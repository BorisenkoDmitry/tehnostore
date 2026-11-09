const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

// These execute installed package code: they intentionally fail if a clean
// dependency installation did not apply the pinned dashboard patch.
const dashboard = process.env.DASHBOARD_PACKAGE_PATH || path.dirname(require.resolve("@medusajs/dashboard/package.json"))
function load(relative, mocks, expose = "") {
  const file = path.join(dashboard, relative)
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8") + expose, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2021 } })
  const module = { exports: {} }
  const jsx = (type, props) => ({ type, props: props ?? {} })
  new Function("require", "module", "exports", outputText)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id]
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" }
    if (id.includes("modals")) return { RouteFocusModal: "modal", RouteDrawer: { Header: "header", Body: "body", Footer: "footer", Close: "close", Title: "title", Description: "description" }, useRouteModal: () => ({ handleSuccess() {} }) }
    if (id.includes("constants")) return { DEFAULT_FIELDS: "id" }
    return new Proxy({}, { get: (_, key) => key === "__esModule" ? true : key === "getProductImportCsvTemplate" ? () => "csv" : String(key) })
  }, module, module.exports)
  return module.exports
}

function hookHost() {
  let cursor = 0
  const values = []
  const effects = []
  return {
    render(fn) { cursor = 0; return fn() },
    flush() { effects.splice(0).forEach((fn) => fn()) },
    hooks: {
      useRef(initial) { const index = cursor++; return values[index] ??= { current: initial } },
      useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { values[index] = value }] },
      useEffect(fn) { effects.push(fn) },
      useMemo(fn) { return fn() },
    },
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

function loadEsmWizard(folder, name, hooks, host, mocks, common = false) {
  const file = common ? "app.js" : fs.readdirSync(path.join(dashboard, "dist")).find((file) => file.startsWith(`${folder}-`) && file.endsWith(".mjs"))
  const source = fs.readFileSync(path.join(dashboard, "dist", file), "utf8")
  const start = source.indexOf(common ? `    ${name} = () => {` : `var ${name} = () => {`)
  const end = source.indexOf(common ? "\n    };" : "\n};", start)
  assert.ok(start >= 0 && end > start, "published ESM wizard must exist")
  const body = (common ? "var " : "") + source.slice(start, end + (common ? 7 : 3))
  const identifiers = new Set()
  const ast = ts.createSourceFile("wizard.js", body, ts.ScriptTarget.ES2021, true)
  function visit(node) { if (ts.isIdentifier(node)) identifiers.add(node.text); ts.forEachChild(node, visit) }
  visit(ast)
  identifiers.delete(name)
  identifiers.delete("return")
  const values = [...identifiers].map((key) => {
    if (Object.hasOwn(hooks, key)) return hooks[key]
    if (Object.hasOwn(host.hooks, key)) return host.hooks[key]
    if (/^useEffect\d*$/.test(key)) return host.hooks.useEffect
    if (/^useState\d*$/.test(key)) return host.hooks.useState
    if (/^useTranslation\d*$/.test(key)) return mocks["react-i18next"].useTranslation
    if (key === "useNavigate") return mocks["react-router-dom"].useNavigate
    if (key === "useParams") return mocks["react-router-dom"].useParams
    if (/^jsx\d*$/.test(key)) return (type, props) => ({ type, props })
    if (/^toast\d*$/.test(key)) return mocks["@medusajs/ui"].toast
    if (/^import_react\d*$/.test(key)) return host.hooks
    if (/^import_react_router_dom\d*$/.test(key)) return mocks["react-router-dom"]
    if (/^import_react_i18next\d*$/.test(key)) return mocks["react-i18next"]
    if (/^import_ui\d*$/.test(key)) return mocks["@medusajs/ui"]
    if (/^import_jsx_runtime\d*$/.test(key)) return { jsx: (type, props) => ({ type, props }) }
    if (key === "Set") return Set
    if (key === "Error") return Error
    return key
  })
  return new Function(...identifiers, `${body}\nreturn ${name}`)(...values)
}

for (const format of ["source", "esm", "cjs"]) {
for (const [kind, folder, file, name, hook, key] of [
  ["edit", "order-create-edit", "order-edit-create", "OrderEditCreate", "useCreateOrderEdit", ""],
  ["exchange", "order-create-exchange", "exchange-create", "ExchangeCreate", "useCreateExchange", "exchange"],
  ["claim", "order-create-claim", "claim-create", "ClaimCreate", "useCreateClaim", "claim"],
]) {
  test(`F12 ${format} ${kind}: finishing the wizard cannot initialize a second draft (20 preview races)`, async () => {
    const host = hookHost()
    let preview = { id: "order_test" }
    let calls = 0
    const create = async () => { calls++; await tick(); return key ? { [key]: { id: `${kind}_test` } } : {} }
    const hooks = { useOrder: () => ({ order: { id: "order_test" } }), useOrderPreview: () => ({ order: preview }), [hook]: () => ({ mutateAsync: create }), useExchange: () => ({}), useClaim: () => ({}), useReturn: () => ({}) }
    const mocks = {
      react: host.hooks,
      "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
      "react-router-dom": { useParams: () => ({ id: "order_test" }), useNavigate: () => () => {} },
      "@medusajs/ui": { toast: { error(message) { throw Error(message) } } },
      "../../../hooks/api/orders": hooks, "../../../hooks/api/order-edits": hooks, "../../../hooks/api/exchanges": hooks, "../../../hooks/api/claims": hooks, "../../../hooks/api/returns": hooks,
    }
    const Component = format === "source" ? load(`src/routes/orders/${folder}/${file}.tsx`, mocks)[name] : loadEsmWizard(folder, name, hooks, host, mocks, format === "cjs")
    host.render(Component); host.flush()
    host.render(Component); host.flush() // StrictMode-like repeated setup while begin is pending.
    await tick(); await tick()
    for (let repeat = 0; repeat < 20; repeat++) {
      preview = { id: "order_test", order_change: { change_type: kind, [`${kind}_id`]: `${kind}_test` } }
      host.render(Component); host.flush(); await tick()
      preview = { id: "order_test" } // cancel/confirm invalidation wins the navigation race.
      host.render(Component); host.flush(); await tick()
    }
    assert.equal(calls, 1)
  })
}
}

function elements(node) {
  if (!node || typeof node !== "object") return []
  if (Array.isArray(node)) return node.flatMap(elements)
  return [node, ...elements(node.props?.children)]
}

test("F17 malformed import is handled by the form and allows a subsequent valid upload", async () => {
  const host = hookHost()
  const errors = []
  let calls = 0
  const imported = (body, callbacks) => {
    calls++
    if (calls === 1) callbacks.onError(new Error("Quote Not Closed: synthetic CSV"))
  }
  const source = "src/routes/products/product-import/product-import.tsx"
  const { ProductImportContent } = load(source, {
    react: host.hooks,
    "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    "@medusajs/ui": { Button: "button", Heading: "heading", Text: "text", toast: { error: (message) => errors.push(message) } },
    "../../../hooks/api": { useImportProducts: () => ({ mutate: imported, mutateAsync: async () => { throw Error("unhandled mutateAsync") }, data: undefined }), useConfirmImportProducts: () => ({ mutate() {} }) },
  }, "\nexport { ProductImportContent }\n")
  const upload = () => elements(host.render(ProductImportContent)).find((node) => node.props?.onUploaded).props.onUploaded
  await upload()({ name: "malformed.csv" })
  assert.deepEqual(errors, ["Quote Not Closed: synthetic CSV"])
  await upload()({ name: "valid.csv" })
  assert.equal(calls, 2)
})

