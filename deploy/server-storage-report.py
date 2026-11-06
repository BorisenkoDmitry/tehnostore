#!/usr/bin/env python3
"""Read-only server storage inventory. Run after deployment, with Docker/du access.

Only explicit Docker metadata fields are requested. File contents, environment
variables, certificate data and credentials are never read or printed.
"""
import collections
import datetime
import json
import pathlib
import shutil
import subprocess


ERRORS = []
TIMEOUT = 180


def command(args, purpose, preserve_partial_output=False):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as error:
        ERRORS.append({"operation": purpose, "error": type(error).__name__})
        return None
    if result.returncode:
        # Do not emit raw stderr: it may contain unrelated filesystem names.
        ERRORS.append({"operation": purpose, "exit_code": result.returncode})
        return result.stdout if preserve_partial_output else None
    return result.stdout


def json_lines(args, purpose, preserve_partial_output=False):
    text = command(args, purpose, preserve_partial_output=preserve_partial_output)
    if text is None:
        return []
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            ERRORS.append({"operation": purpose, "error": "InvalidJSON"})
    return rows


def inspect_many(kind, names, template):
    rows = []
    for offset in range(0, len(names), 64):
        rows.extend(json_lines(
            ["docker", kind, "inspect", "--format", template] + names[offset:offset + 64],
            "docker " + kind + " metadata",
            preserve_partial_output=True,
        ))
    return rows


SIZE_CACHE = {}


def directory_bytes(path, purpose):
    """Keep the original apparent-byte helper for compatibility."""
    return directory_sizes(path, purpose)["apparent_bytes"]


def directory_sizes(path, purpose):
    if path in SIZE_CACHE:
        return SIZE_CACHE[path]
    sizes = {"apparent_bytes": None, "allocated_bytes": None}
    # Neither command reads file contents. Separate invocations also avoid
    # changing du's hard-link accounting by batching unrelated directories.
    for field, options in [
        ("apparent_bytes", ["-sb"]),
        ("allocated_bytes", ["-s", "-B1"]),
    ]:
        result = command(["du"] + options + ["--", path], purpose + " " + field)
        if result:
            try:
                sizes[field] = int(result.split()[0])
            except (ValueError, IndexError):
                ERRORS.append({"operation": purpose + " " + field, "error": "InvalidSize"})
    SIZE_CACHE[path] = sizes
    return sizes


def directory_metadata(path, purpose):
    result = {"path": path, "bytes": None, "apparent_bytes": None, "allocated_bytes": None}
    if not path:
        result["state"] = "missing_or_not_absolute"
        return result
    try:
        directory = pathlib.Path(path)
        if not directory.is_absolute():
            result["state"] = "missing_or_not_absolute"
            return result
        resolved = directory.resolve()
        result["canonical_path"] = str(resolved)
        if resolved == pathlib.Path("/") or resolved.parts[1:2] in [
            ("proc",), ("sys",), ("dev",), ("run",), ("etc",)
        ]:
            result["state"] = "excluded_system_directory"
            return result
        # Skip every individual file, including secret/config/certificate binds.
        # Only directory trees are sized; no file contents are opened.
        if not resolved.is_dir():
            result["state"] = "skipped_non_directory_or_missing"
            return result
        result.update(directory_sizes(str(resolved), purpose))
        result["bytes"] = result["apparent_bytes"]
        if result["apparent_bytes"] is None or result["allocated_bytes"] is None:
            result["state"] = "measurement_incomplete"
        else:
            result["state"] = "measured"
        return result
    except (OSError, RuntimeError):
        result["state"] = "unavailable"
        return result


def project_directory(path):
    if not path:
        return None
    return directory_metadata(path, "project directory size")


def project_root(path):
    """Include all /opt project releases without broadening Coolify trees."""
    directory = pathlib.PurePosixPath(path)
    if directory.is_absolute() and len(directory.parts) >= 3 and directory.parts[1] == "opt":
        return str(pathlib.PurePosixPath("/opt", directory.parts[2]))
    return path


def memory():
    values = {}
    try:
        for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            if key in ("MemTotal", "MemAvailable", "SwapTotal", "SwapFree"):
                values[key] = int(value.split()[0]) * 1024
    except (OSError, ValueError):
        ERRORS.append({"operation": "memory summary", "error": "Unavailable"})
    return values


def main():
    disk = shutil.disk_usage("/")
    container_ids = (command(["docker", "ps", "-aq"], "docker container list") or "").split()
    container_template = (
        '{"name":{{json .Name}},"image_id":{{json .Image}},'
        '"status":{{json .State.Status}},"running":{{json .State.Running}},'
        '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
        '"restart_count":{{json .RestartCount}},'
        '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
        '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
        '"working_dir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},'
        '"volume_names":"{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}",'
        '"bind_mounts":[{{$comma := false}}{{range .Mounts}}{{if eq .Type "bind"}}'
        '{{if $comma}},{{end}}{"type":{{json .Type}},"source":{{json .Source}},'
        '"destination":{{json .Destination}}}{{$comma = true}}{{end}}{{end}}]}'
    )
    containers = inspect_many("container", container_ids, container_template)
    projects = {}

    def project(name, compose):
        if name not in projects:
            projects[name] = {
                "name": name, "compose": compose, "containers": [],
                "images": set(), "volumes": set(), "directories": set(), "bind_sources": set(),
            }
        return projects[name]

    consumers = collections.defaultdict(set)
    volume_containers = collections.defaultdict(set)
    bind_sources = {}
    for container in containers:
        container["name"] = container["name"].lstrip("/")
        compose = bool(container["project"])
        name = container["project"] or "standalone:" + container["name"]
        group = project(name, compose)
        group["images"].add(container["image_id"])
        if container["working_dir"]:
            group["directories"].add(container["working_dir"])
        for volume in container["volume_names"].split():
            group["volumes"].add(volume)
            consumers[volume].add(name)
            volume_containers[volume].add(container["name"])
        for mount in container["bind_mounts"]:
            metadata = directory_metadata(mount["source"], "bind source directory size")
            canonical = metadata.get("canonical_path", mount["source"])
            if canonical not in bind_sources:
                bind_sources[canonical] = {
                    **metadata, "source_paths": set(), "used_by_projects": set(),
                    "used_by_containers": set(), "destinations": set(),
                }
            source = bind_sources[canonical]
            source["source_paths"].add(mount["source"])
            source["used_by_projects"].add(name)
            source["used_by_containers"].add(container["name"])
            source["destinations"].add(mount["destination"])
            group["bind_sources"].add(canonical)
        group["containers"].append({key: container[key] for key in [
            "name", "service", "status", "running", "health", "restart_count", "bind_mounts"
        ]})

    image_ids = sorted({container["image_id"] for container in containers})
    images = inspect_many("image", image_ids,
        '{"id":{{json .Id}},"virtual_size_bytes":{{json .Size}}}')
    image_sizes = {image["id"]: image["virtual_size_bytes"] for image in images}
    # Docker inspect can emit successful JSON rows and still exit 1 when a
    # different image in the batch is missing. Retain those rows and make
    # missing measurements explicit instead of presenting them as zero bytes.
    for image_id in image_ids:
        if image_id not in image_sizes:
            images.append({"id": image_id, "virtual_size_bytes": None, "state": "unavailable"})
            ERRORS.append({"operation": "docker image metadata", "image_id": image_id, "error": "MissingMeasurement"})
    volume_names = (command(["docker", "volume", "ls", "-q"], "docker volume list") or "").split()
    volumes = inspect_many("volume", volume_names,
        '{"name":{{json .Name}},"mountpoint":{{json .Mountpoint}},'
        '"owner_project":{{json (index .Labels "com.docker.compose.project")}}}')
    volume_sizes = {}
    volume_allocated_sizes = {}
    for volume in volumes:
        name = volume["name"]
        mountpoint = volume.pop("mountpoint")
        metadata = directory_metadata(mountpoint, "named volume size")
        for field in ("bytes", "apparent_bytes", "allocated_bytes", "state"):
            volume[field] = metadata.get(field)
        volume_sizes[name] = volume["apparent_bytes"]
        volume_allocated_sizes[name] = volume["allocated_bytes"]
        volume["used_by_projects"] = sorted(consumers[name])
        volume["used_by_containers"] = sorted(volume_containers[name])
        if volume["owner_project"]:
            project(volume["owner_project"], True)["volumes"].add(name)
        elif not consumers[name]:
            project("unassigned-volumes", False)["volumes"].add(name)

    project_rows = []
    for name in sorted(projects):
        group = projects[name]
        group["container_count"] = len(group["containers"])
        group["state_counts"] = dict(collections.Counter(c["status"] for c in group["containers"]))
        known_image_sizes = [image_sizes[image] for image in group["images"] if image_sizes.get(image) is not None]
        group["image_virtual_bytes"] = sum(known_image_sizes) if known_image_sizes else None
        group["image_measurement_failures"] = sum(image_sizes.get(image) is None for image in group["images"])
        group["image_measurement_complete"] = group["image_measurement_failures"] == 0
        group["image_ids"] = sorted(group.pop("images"))
        group["named_volumes"] = sorted(group.pop("volumes"))
        group["named_volume_bytes"] = sum(volume_sizes.get(volume) or 0 for volume in group["named_volumes"])
        group["named_volume_apparent_bytes"] = group["named_volume_bytes"]
        group["named_volume_allocated_bytes"] = sum(volume_allocated_sizes.get(volume) or 0 for volume in group["named_volumes"])
        group["volume_measurement_failures"] = sum(volume_sizes.get(volume) is None for volume in group["named_volumes"])
        group["volume_allocated_measurement_failures"] = sum(volume_allocated_sizes.get(volume) is None for volume in group["named_volumes"])
        group["working_dirs"] = [project_directory(path) for path in sorted(group.pop("directories"))]
        unique_working_dirs = {row.get("canonical_path", row["path"]): row for row in group["working_dirs"]}
        group["working_dir_apparent_bytes"] = sum(row["apparent_bytes"] or 0 for row in unique_working_dirs.values())
        group["working_dir_allocated_bytes"] = sum(row["allocated_bytes"] or 0 for row in unique_working_dirs.values())
        group["working_dir_measurement_failures"] = sum(row["apparent_bytes"] is None or row["allocated_bytes"] is None for row in unique_working_dirs.values())
        roots = {}
        for directory in group["working_dirs"]:
            root_path = project_root(directory["path"])
            metadata = directory_metadata(root_path, "complete project root size")
            roots.setdefault(metadata.get("canonical_path", root_path), metadata)
        group["project_roots"] = [roots[path] for path in sorted(roots)]
        group["project_root_apparent_bytes"] = sum(row["apparent_bytes"] or 0 for row in roots.values())
        group["project_root_allocated_bytes"] = sum(row["allocated_bytes"] or 0 for row in roots.values())
        group["project_root_count"] = len(roots)
        group["project_root_measurement_failures"] = sum(row["apparent_bytes"] is None or row["allocated_bytes"] is None for row in roots.values())
        group["project_root_apparent_measurement_failures"] = sum(row["apparent_bytes"] is None for row in roots.values())
        group["project_root_allocated_measurement_failures"] = sum(row["allocated_bytes"] is None for row in roots.values())
        group["bind_sources"] = sorted(group["bind_sources"])
        group["bind_source_apparent_bytes"] = sum(bind_sources[path]["apparent_bytes"] or 0 for path in group["bind_sources"])
        group["bind_source_allocated_bytes"] = sum(bind_sources[path]["allocated_bytes"] or 0 for path in group["bind_sources"])
        group["bind_unmeasured_sources"] = [path for path in group["bind_sources"] if bind_sources[path]["state"] != "measured"]
        project_rows.append(group)

    bind_rows = []
    for path in sorted(bind_sources):
        row = bind_sources[path]
        for field in ("source_paths", "used_by_projects", "used_by_containers", "destinations"):
            row[field] = sorted(row[field])
        bind_rows.append(row)

    system_df = json_lines(["docker", "system", "df", "--format",
        '{"type":{{json .Type}},"total_count":{{json .TotalCount}},'
        '"active":{{json .Active}},"size":{{json .Size}},"reclaimable":{{json .Reclaimable}}}'
    ], "docker storage summary")
    report = {
        "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "disk": {"path": "/", "total_bytes": disk.total, "used_bytes": disk.used, "free_bytes": disk.free},
        "memory_bytes": memory(),
        "docker_system_df": system_df,
        "container_images": images,
        "named_volumes": volumes,
        "bind_sources": bind_rows,
        "projects": project_rows,
        "notes": [
            "Read-only metadata inventory; no file contents, environment variables or certificate data are emitted.",
            "Legacy bytes/named_volume_bytes fields remain apparent bytes; apparent_bytes uses du -sb and allocated_bytes uses du -s -B1. Neither reads file contents.",
            "Bind metadata is limited to Type/Source/Destination; only directory sources are sized. Individual files, including secret/config/certificate binds, and sources under /proc, /sys, /dev, /run, /etc or / are excluded.",
            "Exact canonical directory sources are deduplicated; aliases share one measurement. Parent/child directories, project trees, bind sources and volumes can still overlap and must not be added as disjoint storage.",
            "project_roots expands /opt/<name>/... working directories to the complete /opt/<name> tree, including older releases/backups. Other paths, especially /data/coolify/..., remain exact working directories. Exact canonical roots are deduplicated per project; roots shared by or nested across different projects can overlap and must not be summed blindly. Existing working_dir fields still measure the active Compose working directories.",
            "Image virtual sizes include shared layers: do not sum project image sizes as actual disk usage.",
            "Image totals include successfully measured images only; missing images have null sizes and explicit errors. A project with no known image sizes has a null image total; consult image_measurement_complete before using a partial total.",
            "Shared volumes and overlapping project directories can appear in multiple project rows; do not sum them blindly.",
            "Docker writable container layers, container logs and BuildKit/cache storage are not attributed per project. Docker system df is not a complete host disk account and does not include host bind sources or container log files.",
            "The disk summary covers only the filesystem containing /; bind sources and volumes can live on other filesystems. du traverses mounted subdirectories; apparent/allocated totals can differ from disk usage because of sparse files, hard links, snapshots, compression and shared blocks.",
            "A failed/skipped measurement is null in its detail row; aggregate numeric fields sum available measurements only, so inspect failure counters and states. Anonymous Docker volumes are included in the volume inventory.",
            "Measurements are sequential snapshots and can change while applications or databases are writing.",
            "No cleanup, prune, database access, container restart or filesystem mutation is performed.",
        ],
        "errors": ERRORS,
    }
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
