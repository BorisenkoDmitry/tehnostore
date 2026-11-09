import { catalogFacetValues, legacyCatalogHierarchyValues } from "../../search/helpers/catalog-facet-values"

const attribute = (label: string, ...values: string[]) => ({ label, filterable: true, values: values.map((value) => ({ value })) })
const sourceAttributes = [
  attribute("Цвет", "Red - Красный", "Blue - Синий"),
  attribute("Объем встроенной памяти", "128 Гб"),
  attribute("Объем оперативной памяти", "8 Гб"),
  attribute("Диагональ", "6.2\""),
  attribute("Количество ядер процессора", "8"),
  attribute("Сканер отпечатка пальца", "есть"),
  attribute("Процессор", "Exynos 2400"),
  attribute("Комплектация", "Смартфон, кабель"),
  attribute("Модель устройства", "Samsung Galaxy S24"),
]
const product = (kind: string) => ({
  metadata: { insales_kind: kind, insales_brand: "Samsung" },
  options: [{ title: "Комплектация", values: [{ value: "Стандартная" }] }],
  catalog_record: { attributes: sourceAttributes },
  variants: [{ catalog_variant: { attributes: [attribute("Цвет варианта", "Black - Черный")] } }],
})

describe("approved phone and accessory facet policy", () => {
  it("emits only five phone attribute groups, internal storage rather than RAM, and exact variant colors", () => {
    const source = product("phone")
    const before = JSON.stringify(source)
    expect(catalogFacetValues(source).sort()).toEqual([
      "Встроенная память:128 Гб", "Диагональ:6.2\"", "Количество ядер процессора:8",
      "Сканер отпечатка пальца:есть", "Цвет:Black - Черный",
    ].sort())
    expect(JSON.stringify(source)).toBe(before)
    expect(source.catalog_record.attributes).toHaveLength(9)
  })

  it("limits accessories to actual color even if source contains phone-like specifications", () => {
    expect(catalogFacetValues(product("accessory"))).toEqual(["Цвет:Black - Черный"])
  })

  it("uses product color when variant color is absent and does not invent absent groups", () => {
    const source = product("accessory")
    source.variants = []
    expect(catalogFacetValues(source)).toEqual(["Цвет:Red - Красный", "Цвет:Blue - Синий"])
    expect(catalogFacetValues({ metadata: { insales_kind: "phone" }, catalog_record: { attributes: [] } })).toEqual([])
  })

  it("keeps brand/type/model saved-URL identities private while excluding them from display facets", () => {
    const source = product("phone")
    expect(legacyCatalogHierarchyValues(source)).toEqual(expect.arrayContaining([
      "Тип товара:Телефоны", "Бренд:Samsung", "Модель устройства:Samsung Galaxy S24",
    ]))
    expect(catalogFacetValues(source).some((value) => /^(Бренд|Тип|Модель)/.test(value))).toBe(false)
  })

  it("retains the established option contract for unrelated merchandising products", () => {
    expect(catalogFacetValues({ options: [{ title: "Size", values: [{ value: "S" }] }] })).toEqual(["Size:S"])
  })
})
