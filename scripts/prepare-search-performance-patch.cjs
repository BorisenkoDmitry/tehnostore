const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "..")
const store = path.join(root, "node_modules/.pnpm")
const packageDirectory = fs.readdirSync(store).find((name) => name.startsWith("@medusajs+search-postgres@") && JSON.parse(fs.readFileSync(path.join(store, name, "node_modules/@medusajs/search-postgres/package.json"), "utf8")).version === "2.22.3")
if (!packageDirectory) throw new Error("Pinned search provider not found")
const original = fs.readFileSync(path.join(store, packageDirectory, "node_modules/@medusajs/search-postgres/dist/utils/filters.js"), "utf8")
const marker = "    const compile = (branch) => {\n        const parts = [];\n        for (const [key, value] of Object.entries(branch)) {"
if (!original.includes(marker)) throw new Error("Search provider source changed")
const replacement = `    const compile = (branch) => {
        const { merged, rest } = require("./search-containment.cjs")(branch, plan, castScalar);
        const parts = [];
        if (Object.keys(merged).length) {
            parts.push(\`"indexed" @> \${nextParam(params, JSON.stringify(merged))}::jsonb\`);
        }
        for (const [key, value] of rest) {`
const changed = original.replace(marker, replacement)
const originalLines = original.trimEnd().split("\n")
const changedLines = changed.trimEnd().split("\n")
const helper = fs.readFileSync(path.join(root, "patches/search-containment.cjs"), "utf8").trimEnd().split("\n")
const patch = [
  "diff --git a/dist/utils/filters.js b/dist/utils/filters.js", "--- a/dist/utils/filters.js", "+++ b/dist/utils/filters.js",
  `@@ -1,${originalLines.length} +1,${changedLines.length} @@`, ...originalLines.map((line) => "-" + line), ...changedLines.map((line) => "+" + line),
  "diff --git a/dist/utils/search-containment.cjs b/dist/utils/search-containment.cjs", "new file mode 100644", "--- /dev/null", "+++ b/dist/utils/search-containment.cjs", `@@ -0,0 +1,${helper.length} @@`, ...helper.map((line) => "+" + line), "",
].join("\n")
fs.writeFileSync(path.join(root, "patches/@medusajs__search-postgres@2.22.3.patch"), patch)
