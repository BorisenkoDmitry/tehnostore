const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "..")
const store = path.join(root, "node_modules/.pnpm")
const packageDirectory = fs.readdirSync(store).find((name) => name.startsWith("@medusajs+search-postgres@") && JSON.parse(fs.readFileSync(path.join(store, name, "node_modules/@medusajs/search-postgres/package.json"), "utf8")).version === "2.22.3")
if (!packageDirectory) throw new Error("Pinned search provider not found")
const patchPath = path.join(root, "patches/@medusajs__search-postgres@2.22.3.patch")
const previous = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, "utf8").replace(/\r\n/g, "\n") : ""
const upstream = previous.split("diff --git a/dist/utils/search-containment.cjs")[0].split("\n")
  .filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1)).join("\n")
const original = upstream || fs.readFileSync(path.join(store, packageDirectory, "node_modules/@medusajs/search-postgres/dist/utils/filters.js"), "utf8")
const marker = "    const compile = (branch) => {\n        const parts = [];\n        for (const [key, value] of Object.entries(branch)) {"
if (!original.includes(marker)) throw new Error("Search provider source changed")
const replacement = `    const compile = (branch) => {
        const { merged, rest } = require("./search-containment.cjs")(branch, plan, castScalar);
        const parts = [];
        if (Object.keys(merged).length) {
            parts.push(\`"indexed" @> \${nextParam(params, JSON.stringify(merged))}::jsonb\`);
        }
        for (const [key, value] of rest) {`
const membership = `    const parts = values.map((value) => equalitySql(planned, value, params));`
const optimizedMembership = `    // Avoid repeatedly decompressing the same JSONB for large category unions.
    // COALESCE keeps missing/null fields compatible with negative membership.
    if (planned.is_array && (planned.kind === "keyword" || planned.kind === "text") &&
        values.length > 1 && values.every((value) => value !== null && value !== undefined)) {
        const expr = jsonbPath(planned.path);
        const choices = values.map((value) => nextParam(params, castScalar(planned, value))).join(", ");
        return \`COALESCE((jsonb_typeof(\${expr}) = 'array' AND jsonb_exists_any(\${expr}, ARRAY[\${choices}]::text[])), FALSE)\`;
    }
${membership}`
if (!original.includes(membership)) throw new Error("Array membership source changed")
const changed = original.replace(marker, replacement).replace(membership, optimizedMembership)
const originalLines = original.trimEnd().split("\n")
const changedLines = changed.trimEnd().split("\n")
const helper = fs.readFileSync(path.join(root, "patches/search-containment.cjs"), "utf8").replace(/\r\n/g, "\n").trimEnd().split("\n")
const patch = [
  "diff --git a/dist/utils/filters.js b/dist/utils/filters.js", "--- a/dist/utils/filters.js", "+++ b/dist/utils/filters.js",
  `@@ -1,${originalLines.length} +1,${changedLines.length} @@`, ...originalLines.map((line) => "-" + line), ...changedLines.map((line) => "+" + line),
  "diff --git a/dist/utils/search-containment.cjs b/dist/utils/search-containment.cjs", "new file mode 100644", "--- /dev/null", "+++ b/dist/utils/search-containment.cjs", `@@ -0,0 +1,${helper.length} @@`, ...helper.map((line) => "+" + line), "",
].join("\n")
fs.writeFileSync(patchPath, patch)
