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


def command(args, purpose):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as error:
        ERRORS.append({"operation": purpose, "error": type(error).__name__})
        return None
    if result.returncode:
        # Do not emit raw stderr: it may contain unrelated filesystem names.
        ERRORS.append({"operation": purpose, "exit_code": result.returncode})
        return None
    return result.stdout


def json_lines(args, purpose):
    text = command(args, purpose)
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
        ))
    return rows


SIZE_CACHE = {}


def directory_bytes(path, purpose):
    if path in SIZE_CACHE:
        return SIZE_CACHE[path]
    # du counts metadata and sizes; it does not read the files' contents.
    result = command(["du", "-sb", "--", path], purpose)
    size = None
    if result:
        try:
            size = int(result.split()[0])
        except (ValueError, IndexError):
            ERRORS.append({"operation": purpose, "error": "InvalidSize"})
    SIZE_CACHE[path] = size
    return size


def project_directory(path):
    if not path:
        return None
    try:
        directory = pathlib.Path(path)
        if not directory.is_absolute() or not directory.is_dir():
            return {"path": path, "bytes": None, "state": "missing_or_not_absolute"}
        resolved = directory.resolve()
        if resolved == pathlib.Path("/") or resolved.parts[1:2] in [
            ("proc",), ("sys",), ("dev",), ("run",), ("etc",)
        ]:
            return {"path": path, "bytes": None, "state": "excluded_system_directory"}
        return {"path": path, "bytes": directory_bytes(str(resolved), "project directory size")}
    except OSError:
        return {"path": path, "bytes": None, "state": "unavailable"}


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
        '"volume_names":"{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}"}'
    )
    containers = inspect_many("container", container_ids, container_template)
    projects = {}

    def project(name, compose):
        if name not in projects:
            projects[name] = {
                "name": name, "compose": compose, "containers": [],
                "images": set(), "volumes": set(), "directories": set(),
            }
        return projects[name]

    consumers = collections.defaultdict(set)
    volume_containers = collections.defaultdict(set)
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
        group["containers"].append({key: container[key] for key in [
            "name", "service", "status", "running", "health", "restart_count"
        ]})

    image_ids = sorted({container["image_id"] for container in containers})
    images = inspect_many("image", image_ids,
        '{"id":{{json .Id}},"virtual_size_bytes":{{json .Size}}}')
    image_sizes = {image["id"]: image["virtual_size_bytes"] for image in images}
    volume_names = (command(["docker", "volume", "ls", "-q"], "docker volume list") or "").split()
    volumes = inspect_many("volume", volume_names,
        '{"name":{{json .Name}},"mountpoint":{{json .Mountpoint}},'
        '"owner_project":{{json (index .Labels "com.docker.compose.project")}}}')
    volume_sizes = {}
    for volume in volumes:
        name = volume["name"]
        mountpoint = volume.pop("mountpoint")
        size = directory_bytes(mountpoint, "named volume size") if mountpoint else None
        volume["bytes"] = size
        volume_sizes[name] = size
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
        group["image_virtual_bytes"] = sum(image_sizes.get(image, 0) for image in group["images"])
        group["image_measurement_failures"] = sum(image not in image_sizes for image in group["images"])
        group["image_ids"] = sorted(group.pop("images"))
        group["named_volumes"] = sorted(group.pop("volumes"))
        group["named_volume_bytes"] = sum(volume_sizes.get(volume) or 0 for volume in group["named_volumes"])
        group["volume_measurement_failures"] = sum(volume_sizes.get(volume) is None for volume in group["named_volumes"])
        group["working_dirs"] = [project_directory(path) for path in sorted(group.pop("directories"))]
        project_rows.append(group)

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
        "projects": project_rows,
        "notes": [
            "Read-only metadata inventory; no file contents, environment variables or certificate data are emitted.",
            "Directory and volume bytes use du -sb (apparent bytes), not allocated filesystem blocks.",
            "Image virtual sizes include shared layers: do not sum project image sizes as actual disk usage.",
            "Shared volumes and overlapping project directories can appear in multiple project rows; do not sum them blindly.",
            "Working-directory sizes may overlap Docker bind-mounted data; writable container layers and anonymous binds are not attributed per project.",
            "Measurements are sequential snapshots and can change while applications or databases are writing.",
            "No cleanup, prune, database access, container restart or filesystem mutation is performed.",
        ],
        "errors": ERRORS,
    }
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
