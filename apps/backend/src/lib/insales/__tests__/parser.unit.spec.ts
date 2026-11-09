import { attributeKey, buildInsalesPlan, decimal, descriptionText, extractAttributes, loadInsalesPlan, NavigationNode, parseTsv, safeImageUrls, SourceRow } from ".."
import approvedNavigation from "../../../scripts/data/catalog-navigation.json"

// Planning deliberately requires the reviewed production allowlist. A truncated
// menu masks the row-level assertion with the allowlist integrity error.
const navigation: NavigationNode[] = approvedNavigation
const row = (overrides: SourceRow = {}): SourceRow => ({
  "ID товара": "1", "ID варианта": "10", "Название товара или услуги": "Телефон",
  "Название товара в URL": "phone", "URL": "https://texno.store/collection/apple-iphone-15/product/phone",
  "Описание": "<p>Описание</p>", "Дополнительное описание": "", "Видимость на витрине": "выставлен",
  "Размещение на сайте": "Каталог/Apple iPhone/Apple iPhone 15", "Валюта склада": "RUR",
  "Цена продажи": "12345,50", "Старая цена": "9990", "Остаток": "", "Вес": "",
  "Свойство: Цвет": "", "Артикул": "same-sku", "Изображения": "", "Изображения варианта": "",
  "Параметр: Цвет": "Red##Blue", "Параметр: Объем встроенной памяти": "128 Гб",
  "Параметр: __Собрать в группу": "do-not-merge", ...overrides,
})

describe("InSales parser safety and source identity", () => {
  it("retains the reviewed allowlist boundary before planning merchant rows", () => {
    expect(() => buildInsalesPlan([row()], navigation.filter((node) => node.id !== "apple-iphone-15"))).toThrow(/Allowlist changed/)
  })
  it("parses quoted TAB, CR/LF and escaped quotes without splitting a record", () => {
    const input = '\uFEFFID товара\tID варианта\tОписание\tВидимость на витрине\tРазмещение на сайте\tЦена продажи\r\n1\t10\t"line\t1\nline ""2"""\tвыставлен\tКаталог\t10\r\n'
    expect(parseTsv(input)[0]["Описание"]).toBe('line\t1\nline "2"')
    expect(parseTsv(input.trimEnd())).toHaveLength(1)
  })

  it("rejects malformed quoting and rows with a different column count", () => {
    expect(() => parseTsv('ID товара\tID варианта\tОписание\tВидимость на витрине\tРазмещение на сайте\tЦена продажи\n1\t10')).toThrow(/columns/)
    expect(() => parseTsv('"unterminated')).toThrow(/Unterminated/)
  })

  it("keeps separate Product IDs and all variants of one card", () => {
    const plan = buildInsalesPlan([row(), row({ "ID варианта": "11", "Описание": "" }), row({ "ID товара": "2", "ID варианта": "20" })], navigation)
    expect(plan.summary.importedProducts).toBe(2)
    expect(plan.summary.importedVariants).toBe(3)
    expect(plan.products[0].variants.map((variant) => variant.sku)).toEqual(["insales-10", "insales-11"])
    expect(plan.products[0].variants[0].price).toBe(12345.5)
    expect(plan.products[0].variants[0].oldPrice).toBeNull()
    expect(plan.products[0].variants[0].stock).toBeNull()
    expect(plan.products[0].privateRaw.rows[0]["Старая цена"]).toBe("9990")
    expect(plan.products[0].categoryHandles).toEqual(["apple-iphone", "apple-iphone-15"])
  })

  it("does not inherit a different product's description or broaden a root to an absent model", () => {
    const plan = buildInsalesPlan([row(), row({ "ID товара": "2", "ID варианта": "20", "Описание": "", "Видимость на витрине": "скрыт" }), row({ "ID товара": "3", "ID варианта": "30", "Размещение на сайте": "Каталог/Xiaomi/Xiaomi Mi 6X", "URL": "https://texno.store/collection/xiaomi-mi-6x/product/phone" })], navigation)
    expect(plan.summary.importedProducts).toBe(1)
    expect(plan.excluded.find((product) => product.sourceProductId === "2")?.reasons).toEqual(expect.arrayContaining(["hidden", "missing_own_description"]))
    expect(plan.excluded.find((product) => product.sourceProductId === "3")?.reasons).toContain("outside_approved_menu_leaves")
  })

  it("rejects conflicting visibility, source IDs and unknown/nonpositive commercial values", () => {
    expect(() => buildInsalesPlan([row(), row()], navigation)).toThrow(/Duplicate source variant/)
    expect(buildInsalesPlan([row({ "Цена продажи": "0" })], navigation).excluded[0].reasons).toContain("invalid_commercial_data")
    expect(buildInsalesPlan([row({ "Остаток": "-1" })], navigation).excluded[0].reasons).toContain("invalid_commercial_data")
    expect(buildInsalesPlan([row(), row({ "ID варианта": "11", "Видимость на витрине": "скрыт" })], navigation).excluded[0].reasons).toContain("conflicting_visibility")
    expect(() => decimal("1e3")).toThrow()
  })

  it("preserves raw characteristics and separately types explicitly numeric units", () => {
    const attrs = extractAttributes([row()])
    expect(attrs.find((attribute) => attribute.key === attributeKey("Объем встроенной памяти"))?.values[0]).toMatchObject({ numericValue: 128, unit: "GB", value: "128 Гб" })
    expect(attrs.find((attribute) => attribute.label === "Цвет")?.values).toHaveLength(2)
    expect(attrs.find((attribute) => attribute.label === "__Собрать в группу")).toMatchObject({ public: false, filterable: false, rawValues: ["do-not-merge"] })
  })

  it("publishes only whitelisted customer facts from prefixed source parameters", () => {
    const source = row({ "Параметр: __Гарантия": "1 год", "Параметр: __Производство": "Собрано в Китае", "Параметр: __Аксессуар для": "iphone 7", "Параметр: __Тип аксессуара": "чехлы", "Параметр: __комплектный товар": "да" })
    const attrs = extractAttributes([source])
    for (const label of ["Гарантия", "Производство", "Совместимость с устройством", "Тип аксессуара"]) expect(attrs.find((attribute) => attribute.label === label)).toMatchObject({ public: true, filterable: true })
    expect(attrs.find((attribute) => attribute.label === "__комплектный товар")).toMatchObject({ public: false, filterable: false })
    expect(source["Параметр: __Гарантия"]).toBe("1 год")
    expect(attrs.find((attribute) => attribute.label === "Гарантия")?.rawValues).toEqual(["1 год"])
  })

  it("emits text descriptions and rejects credentials, local URLs and lookalike CDN hosts", () => {
    const text = descriptionText('<p>A &amp; B</p><script>alert(1)</script><img src=x onerror=alert(2)><b>Text</b>')
    expect(text).toBe("A & B\n Text".replace("\n ", "\n"))
    expect(text).not.toMatch(/<|alert|onerror/)
    expect(safeImageUrls("http://cdn.insales-shop.ru/images/a.jpg https://cdn.insales-shop.ru.evil.test/images/a.jpg https://user@cdn.insales-shop.ru/images/a.jpg http://127.0.0.1/x file:///x https://cdn.insales-shop.ru/images/a.jpg")).toEqual(["https://cdn.insales-shop.ru/images/a.jpg"])
  })
})

if (process.env.INSALES_SOURCE_PATH) {
  it("matches the reviewed real export without importing it", () => {
    if (!process.env.INSALES_NAVIGATION_PATH) throw new Error("Explicit INSALES_NAVIGATION_PATH required for merchant export verification")
    const plan = loadInsalesPlan({ sourcePath: process.env.INSALES_SOURCE_PATH!, navigationPath: process.env.INSALES_NAVIGATION_PATH, comparisonPath: process.env.INSALES_COMPARISON_PATH })
    expect(plan.summary).toMatchObject({ sourceRows: 1723, sourceProducts: 1649, importedProducts: 1172, importedVariants: 1244, phones: 844, accessories: 328, productAttributes: 45532, attributeValues: 55680, excludedProducts: 477 })
    expect(plan.products.flatMap((product) => product.variants).filter((variant) => variant.stock === null)).toHaveLength(157)
    expect(new Set(plan.products.flatMap((product) => product.variants.map((variant) => variant.sku))).size).toBe(1244)
    expect(plan.products.some((product) => /Mi 6X|Mi A2/.test(product.title))).toBe(false)
  })
}
