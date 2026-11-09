import { configurationFamilyKey, configurationPickerNeedsList, configuredProductConfigurations, familyConfigurations, inferredProductFamily, namedFamilyPrefix, ownConfigurations, type ConfigurationProduct } from "../product-configurations"
import type { CatalogDefinitionData } from "../catalog-cms"
import type { CatalogAttributeInput } from "../../modules/catalog-attributes/types"
import { attachRamChoices, DETACHED_VARIATION_FIELDS, LIBRARY_RAM } from "../catalog-variation-library"

const attribute = (label: string, ...values: string[]): CatalogAttributeInput => ({ key: label, label, public: true, filterable: false, dataType: "text", rawValues: values, values: values.map((value) => ({ value, normalized: value, numericValue: null, unit: null })) })
const phone = (id: string, title: string, color: string, storage: string, extra: CatalogAttributeInput[] = []): ConfigurationProduct => ({
  id, title, handle: id, metadata: { insales_kind: "phone", insales_brand: "Apple", catalog_scope: "texno", insales_product_id: id },
  categories: [{ id: "brand", handle: "apple-iphone" }, { id: "model", handle: "apple-iphone-11-pro", parent_category_id: "brand" }],
  variants: [{ id: id + "-variant", title }],
  catalog_record: { attributes: [attribute("Цвет", color), attribute("Объем встроенной памяти", storage), attribute("Состояние", "как новый"), ...extra] },
})

describe("safe product configurations", () => {
  const green = phone("green", "Apple iPhone 11 Pro 256GB Green", "Green - Зеленый", "256 Гб")
  const gold = phone("gold", "Apple iPhone 11 Pro 64GB Gold", "Gold - Золотой", "64 Гб")
  it("links actual color/storage siblings while retaining their own product and variant IDs", () => {
    expect(configurationFamilyKey(green)).toBe(configurationFamilyKey(gold))
    expect(familyConfigurations(green, [gold, green])).toEqual(expect.arrayContaining([
      expect.objectContaining({ product_id: "gold", variant_id: "gold-variant", storage: "64 ГБ", color: "Gold - Золотой" }),
      expect.objectContaining({ product_id: "green", storage: "256 ГБ" }),
    ]))
  })
  it.each(["Apple iPhone 11 Pro Max 64GB Gold", "Apple iPhone 11 Pro 64GB Gold (Dual SIM)", "Apple iPhone 11 Pro 64GB Gold (Japan)", "Apple iPhone 11 Pro 64GB Gold 2020"])("keeps significant name differences: %s", (title) => {
    expect(familyConfigurations(green, [{ ...gold, title }])).toHaveLength(1)
  })
  it("requires exact model category and matching technical facts, including missing values", () => {
    expect(familyConfigurations(green, [{ ...gold, categories: [{ id: "other", handle: "apple-iphone-11" }] }])).toHaveLength(1)
    expect(familyConfigurations(green, [phone("x", gold.title, "Gold - Золотой", "64 Гб", [attribute("Региональная версия", "China")])])).toHaveLength(1)
    const differentState = phone("x", gold.title, "Gold - Золотой", "64 Гб")
    differentState.catalog_record!.attributes!.find((a) => a.label === "Состояние")!.values[0].value = "новый"
    expect(familyConfigurations(green, [differentState])).toHaveLength(1)
  })
  it("does not remove RAM or combine different RAM/storage identities", () => {
    expect(configurationFamilyKey(phone("a", "Xiaomi Note 7 4/64GB Black", "Black - Черный", "64 Гб"))).not.toBe(configurationFamilyKey(phone("b", "Xiaomi Note 7 6/128GB Black", "Black - Черный", "128 Гб")))
  })
  it("groups known RAM and storage combinations without masking hardware or SIM differences", () => {
    const definition: CatalogDefinitionData = { id: LIBRARY_RAM, code: LIBRARY_RAM, label: "Оперативная память", type: "number",
      unit: "ГБ", public: true, enabled: true, filterable: false, position: 0, role: "variant_axis" }
    const redmi = (ram: number, storage: number, suffix = "", model = `${ram}GB RAM`) => phone(
      `${ram}-${storage}${suffix}`, `Xiaomi Redmi Note 12 Pro 5G ${ram}/${storage}GB Blue${suffix}`, "Blue - Синий", `${storage} Гб`,
      [attribute("Объем оперативной памяти", `${ram} Гб`), attribute("Модель", model)],
    )
    const a = redmi(6, 128)
    const b = redmi(8, 128)
    const c = redmi(8, 256)
    const d = redmi(12, 256)
    const other = redmi(8, 256, " (Dual SIM)", "EU Model")
    const configurations = familyConfigurations(a, [a, b, c, d, other], [definition])
    expect(configurations.map(({ ram, storage }) => [ram, storage])).toEqual([
      ["6 ГБ", "128 ГБ"], ["8 ГБ", "128 ГБ"], ["8 ГБ", "256 ГБ"], ["12 ГБ", "256 ГБ"],
    ])
    expect(inferredProductFamily(a, [definition])?.legacyId).toBe(inferredProductFamily(a, [])?.id)
  })

  it("leaves a deliberately detached RAM field detached during data refreshes", () => {
    const facts = [attribute("Объем оперативной памяти", "8 ГБ")]
    const variants = [{ id: "sku" }]
    expect(attachRamChoices({}, facts, variants)?.sku[LIBRARY_RAM]).toMatchObject({ choice: "8", original: "8" })
    expect(attachRamChoices({ [DETACHED_VARIATION_FIELDS]: [LIBRARY_RAM] }, facts, variants)).toBeUndefined()
  })
  it("does not advertise a product's list of manufacturer colors as real variants", () => {
    const multi = phone("x", "Apple iPhone 11 Pro 64GB", "Black", "64 Гб")
    multi.catalog_record!.attributes![0] = attribute("Цвет", "Black", "White")
    expect(ownConfigurations(multi)[0].color).toBeNull()
    expect(configurationFamilyKey(multi)).toBeNull()
  })
  it("rejects ambiguous competing sibling pairs and keeps the actual current product", () => {
    expect(familyConfigurations(green, [green, gold, { ...gold, id: "duplicate", variants: [{ id: "other-variant", title: gold.title }] }])).toHaveLength(1)
  })
  it("links a manually assigned card to an imported family in both directions", () => {
    const axes: CatalogDefinitionData[] = ["Цвет", "Объем встроенной памяти"].map((label) => ({
      id: label, code: label, label, type: "text", unit: null, public: true, enabled: true, filterable: true, position: 0,
      role: label === "Цвет" ? "color" : "variant_axis",
    }))
    const family = inferredProductFamily(green, axes)!
    const sim = { ...gold, id: "sim", title: `${gold.title} (Dual SIM)` }
    const manual = {
      ...gold,
      metadata: { catalog_origin: "manual", catalog_kind: "phone", catalog_brand: "Apple", catalog_scope: "texno", catalog_family_id: family.id },
      variants: [{ id: "gold-variant", title: gold.title, catalog_variant: { attributes: gold.catalog_record!.attributes! } }],
    }
    const candidates = [green, sim, manual]
    expect(configuredProductConfigurations(green, candidates, axes).map(({ product_id }) => product_id)).toEqual(["green", "gold"])
    expect(configuredProductConfigurations(manual, candidates, axes).map(({ product_id }) => product_id)).toEqual(["gold", "green"])
    expect(configuredProductConfigurations(green, [green, { ...manual, metadata: { ...manual.metadata, catalog_scope: "texno:draft" } }], axes)).toHaveLength(1)
  })

  it("keeps separate card specifications within a named family", () => {
    const axes: CatalogDefinitionData[] = ["Цвет", "Объем встроенной памяти"].map((label) => ({
      id: label, code: label, label, type: "text", unit: null, public: true, enabled: true, filterable: true, position: 0,
      role: label === "Цвет" ? "color" : "variant_axis",
    }))
    const family = namedFamilyPrefix + "iPhone 11 Pro"
    const named = (product: ConfigurationProduct, condition: string) => ({
      ...product,
      metadata: { ...product.metadata, catalog_family_id: family },
      catalog_record: { attributes: [...product.catalog_record!.attributes!.slice(0, 2), attribute("Состояние", condition)] },
    })
    const a = named(green, "новый")
    const b = named(gold, "как новый")
    expect(configuredProductConfigurations(a, [a, b], axes).map(({ product_id }) => product_id)).toEqual(["green", "gold"])
  })

  it("uses variant color over product colors and never gives accessories phone memory", () => {
    const accessory = { ...gold, metadata: { insales_kind: "accessory" }, variants: [{ id: "white", title: "White", catalog_variant: { attributes: [attribute("Цвет варианта", "White")] } }] }
    expect(ownConfigurations(accessory)[0]).toMatchObject({ color: "White", storage: null })
    expect(configurationFamilyKey(accessory)).toBeNull()
  })

  it("uses a list when real combinations cannot be reached by changing one axis at a time", () => {
    const variant = (variant_id: string, color: string, size: string) => ({ product_id: "product", handle: "product", variant_id, color, storage: null, axes: { color, size } })
    const red = variant("red", "Красный", "S")
    const green = variant("green", "Зелёный", "XL")
    expect(configurationPickerNeedsList([red, green], ["color", "size"])).toBe(true)
    expect(configurationPickerNeedsList([red, green, variant("bridge", "Красный", "XL")], ["color", "size"])).toBe(false)
    expect(configurationPickerNeedsList([red, green], ["color"])).toBe(false)
  })
})
