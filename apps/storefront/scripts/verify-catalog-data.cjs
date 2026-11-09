const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const filename = path.resolve(process.cwd(), "src/modules/store/lib/catalog-data.ts")
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const adapter = new Module(filename, module)
adapter._compile(compiled, filename)
const {
  initialCatalogState, parseCatalogState, serializeCatalogState,
  adaptMedusaHit, catalogOptionGroups,
} = adapter.exports

const state = {
  ...initialCatalogState,
  q: "iPhone Зелёный",
  category: "apple-iphone",
  min: "0",
  max: "23995.5",
  options: ["Цвет:Зелёный", "Встроенная память:256 ГБ"],
  sale: true,
  sort: "price_asc",
  page: 2,
}
const url = serializeCatalogState(state, new URLSearchParams("campaign=autumn&category=old&option=old:value"))
assert.equal(url.get("campaign"), "autumn")
assert.deepEqual(parseCatalogState(url), state)
assert.equal(serializeCatalogState(initialCatalogState, url).toString(), "campaign=autumn")

const invalid = parseCatalogState(new URLSearchParams("page=Infinity&min=-1&max=NaN&sort=oops&option=missing-separator&option=:empty&option=Color:Black&option=Color:Black"))
assert.equal(invalid.page, 1)
assert.equal(invalid.min, "")
assert.equal(invalid.max, "")
assert.equal(invalid.sort, "featured")
assert.deepEqual(invalid.options, ["Color:Black"])
assert.equal(parseCatalogState(new URLSearchParams("max=12%2C5")).max, "12.5")
assert.equal(parseCatalogState(new URLSearchParams("page=2.5")).page, 1)

const example = adaptMedusaHit({
  id: "prod_iphone", title: "Apple iPhone 11 Pro 256GB Green", handle: "iphone-11-pro",
  thumbnail: "/images/home/212752287.webp", min_price_rub: 22995, original_price_rub: 55995,
  min_price_eur: 200, is_catalog_example: true,
  category: ["Apple iPhone", "Apple iPhone"],
  option_values: ["Цвет:Зелёный", "Встроенная память:256 ГБ", "malformed"],
}, "rub")
assert.equal(example.price, 22995)
assert.equal(example.currency, "RUB")
assert.equal(example.preview.price, 22995)
assert.equal(example.preview.title, example.title)
assert.deepEqual(example.categoryKeys, ["Apple iPhone"])
assert.deepEqual(example.options["Цвет"], ["Зелёный"])
assert.equal(example.href, "/products/iphone-11-pro")

const regular = adaptMedusaHit({
  objectID: "prod_free", title: "Free product", handle: "safe handle", min_price_rub: 0,
  original_price_rub: -1, option_values: ["__proto__:safe"],
}, "RUB")
assert.equal(regular.price, 0)
assert.equal(regular.oldPrice, 0)
assert.equal(regular.preview, undefined)
assert.equal(regular.href, "/products/safe%20handle")
assert.deepEqual(regular.options.__proto__, ["safe"])
const missing = adaptMedusaHit({ min_price_eur: 12, original_price_rub: Infinity }, "rub")
assert.equal(missing.price, null)
assert.equal(missing.preview, undefined)
assert.equal(missing.oldPrice, 0)
assert.equal(missing.href, undefined)

const facets = catalogOptionGroups(["Встроенная память:256 ГБ", "Встроенная память:32 ГБ", "Встроенная память:32 ГБ", "Цвет:Чёрный", "broken"])
assert.deepEqual(facets.map((group) => group.key), ["Встроенная память", "Цвет"])
assert.deepEqual(facets[0].values.map((value) => value.label), ["32 ГБ", "256 ГБ"])
const definitions = [
  { code: "color", label: "Цвет", aliases: [], filterable: true, position: 1, role: "color", filter_control: "swatch" },
  { code: "storage", label: "Встроенная память", aliases: ["Объем встроенной памяти"], filterable: true, position: 2 },
  { code: "technical", label: "Диагональ", aliases: [], filterable: true, position: 3 },
]
const categoryValues = ["Цвет:Чёрный", "Объем встроенной памяти:256 ГБ", "Встроенная память:256 GB", "Диагональ:6.7\""]
assert.deepEqual(catalogOptionGroups(categoryValues, definitions, null).map((group) => group.code), ["color", "storage", "technical"])
assert.equal(catalogOptionGroups(categoryValues, definitions).find((group) => group.code === "storage").values.length, 1)
assert.deepEqual(catalogOptionGroups(categoryValues, definitions, null, ["storage"]).map((group) => group.code), ["color", "technical"])
assert.deepEqual(catalogOptionGroups(categoryValues, definitions, ["color", "storage"], ["storage"]).map((group) => group.code), ["color"])
console.log("Catalog adapter validation passed: URL round-trip/reset, malformed parameters, RUB amounts, zero/missing prices, example marker, actual facets, safe option keys.")
