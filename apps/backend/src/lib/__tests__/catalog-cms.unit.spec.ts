import { normalizeCmsAttributes, normalizeProductSpecifications, CatalogDefinitionData } from "../catalog-cms"
import { stockProvenanceKnown } from "../texno-cart-rules"
import { catalogAliasFilterValues } from "../../search/helpers/catalog-facet-values"

const definition: CatalogDefinitionData = { id: "def_test", code: "storage", label: "Встроенная память", type: "number", unit: "ГБ", public: true, filterable: true, enabled: true, position: 0, aliases: ["Объем встроенной памяти"] }

describe("catalog CMS data boundaries", () => {
  it("normalizes typed numeric values and preserves the stable code and legacy label", () => {
    const [attribute] = normalizeCmsAttributes([{ code: "storage", values: ["128,5"] }], [definition])
    expect(attribute).toMatchObject({ key: "storage", legacyLabels: ["Объем встроенной памяти"], values: [{ value: "128.5 ГБ", numericValue: 128.5, normalized: "128.5 гб" }] })
  })
  it("rejects units embedded in a typed numeric value and unknown definitions", () => {
    expect(() => normalizeCmsAttributes([{ code: "storage", values: ["128 GB"] }], [definition])).toThrow()
    expect(() => normalizeCmsAttributes([{ code: "unknown", values: ["128"] }], [definition])).toThrow()
  })
  it("keeps a reusable monetary choice numeric while formatting the assigned value in its currency", () => {
    const money = { ...definition, code: "surcharge", type: "money" as const, unit: "RUB" }
    const [attribute] = normalizeCmsAttributes([{ code: money.code, values: ["125,50"] }], [money])
    expect(attribute).toMatchObject({ dataType: "number", values: [{ value: "125,50 ₽", numericValue: 125.5, unit: "RUB" }] })
    expect(() => normalizeCmsAttributes([{ code: money.code, values: ["125,501"] }], [money])).toThrow()
    expect(() => normalizeCmsAttributes([{ code: money.code, values: ["-1"] }], [money])).toThrow()
  })
  it("does not allow private definitions to become public filters", () => {
    expect(normalizeCmsAttributes([{ code: "storage", values: ["128"] }], [{ ...definition, public: false }])[0].filterable).toBe(false)
  })
  it("keeps custom specifications in their product record even when a variation has the same name", () => {
    const code = "product_spec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const rows = [{ code, label: definition.label, values: ["Текст для этой карточки"] }]
    const [stored] = normalizeProductSpecifications(rows, [definition])
    expect(stored).toMatchObject({ key: code, label: definition.label, dataType: "text", public: true, filterable: false })
    expect(normalizeProductSpecifications([{ code, values: ["Изменено"] }], [definition], [stored])[0].label).toBe(definition.label)
    expect(() => normalizeProductSpecifications([{ code, values: ["Другая карточка"] }], [definition])).toThrow()
    expect(catalogAliasFilterValues({ catalog_record: { attributes: [stored] } })).toEqual([])
  })
  it("supports old option-label URLs without exposing hidden aliases", () => {
    const attribute = normalizeCmsAttributes([{ code: "storage", values: ["128"] }], [definition])[0]
    expect(catalogAliasFilterValues({ catalog_record: { attributes: [attribute] } })).toEqual(["Объем встроенной памяти:128 ГБ"])
    expect(catalogAliasFilterValues({ catalog_record: { attributes: [{ ...attribute, public: false }] } })).toEqual([])
  })
  it("requires stock provenance rather than quantity or a lone boolean flag", () => {
    expect(stockProvenanceKnown({ metadata: { catalog_stock_confirmed: true }, catalog_variant: { source_data: { origin: "manual" } } })).toBe(false)
    expect(stockProvenanceKnown({ metadata: { insales_stock_known: false }, catalog_variant: { source_data: { Остаток: "" } } })).toBe(false)
    expect(stockProvenanceKnown({ metadata: { insales_stock_known: true }, catalog_variant: { source_data: { Остаток: "5" } } })).toBe(true)
    expect(stockProvenanceKnown({ metadata: { insales_stock_known: false, catalog_stock_confirmed: true, catalog_stock_confirmation_id: "catchg_test" }, catalog_variant: { source_data: { Остаток: "" } } })).toBe(true)
  })
  it("preserves unchanged mixed source facts instead of coercing them during another field edit", () => {
    const previous = { key: "storage", label: "Встроенная память", dataType: "text" as const, public: true, filterable: true, rawValues: ["нет"], values: [{ value: "нет", normalized: "нет", numericValue: null, unit: null }] }
    expect(normalizeCmsAttributes([{ code: "storage", values: ["нет"] }], [definition], [previous])[0].values).toEqual(previous.values)
  })
})
