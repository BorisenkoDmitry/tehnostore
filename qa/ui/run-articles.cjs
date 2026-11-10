const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")
const root = path.resolve(__dirname, "../..")
const cli = process.env.PLAYWRIGHT_CLI
if (!cli || !fs.existsSync(cli)) throw Error("Set PLAYWRIGHT_CLI to the installed Playwright CLI entry point; sign in to localhost:9001 in the texno-articles session first")
const session = process.env.ARTICLES_BROWSER_SESSION || "texno-articles"
const output = path.join(root, "output/playwright")
fs.mkdirSync(output, { recursive: true })
function run(filename, destination) {
  const result = cp.spawnSync(process.execPath, [cli, "-s=" + session, "--raw", "run-code", "--filename", path.join(__dirname, filename)], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 180000 })
  if (result.error || result.status) throw Error("Browser command failed")
  let data
  try { data = JSON.parse(result.stdout.trim()) } catch {
    fs.writeFileSync(path.join(root, ".local/articles-browser-error.txt"), result.stdout)
    throw Error("Browser scenario failed; inspect .local/articles-browser-error.txt")
  }
  fs.writeFileSync(path.join(output, destination), JSON.stringify(data, null, 2))
  return data
}
const editor = run("articles-blocknote.js", "articles-blocknote-ui.json")
if (!editor.cases?.length || editor.cases.some((entry) => entry.status !== "PASS")) throw Error("Article editor checks failed")
const drag = run("article-block-drag.js", "articles-drag.json")
if (!drag.dragAndDrop) throw Error("Block reordering check failed")
console.log(JSON.stringify({ passed: editor.cases.length + 1, browser: "Chrome", includes: "two tabs, cover and body upload, rich-text persistence, error recovery, page SEO, drag-and-drop" }))
