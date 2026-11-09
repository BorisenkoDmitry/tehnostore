import { canonicalCatalogToken } from "../../search/helpers/catalog-filter-values"
import fixture from "./catalog-filter-values.fixture.json"

// A runtime require avoids including another app in the backend's build root.
// Jest transpiles this pure frontend module, so both shipped implementations
// execute against the same identity fixture rather than a copied test algorithm.
const frontend = require("../../../../storefront/src/modules/store/lib/catalog-data") as {
  canonicalCatalogToken: (value: string) => string
  catalogOptionGroups: (values: string[]) => { key: string; values: { value: string; label: string }[] }[]
  parseCatalogState: (params: URLSearchParams) => { options: string[] }
}

describe("catalog normalized filter identities", () => {
  it.each(fixture)("keeps backend/frontend parity for %s", (source, expected) => {
    expect(canonicalCatalogToken(source)).toBe(expected)
    expect(frontend.canonicalCatalogToken(source)).toBe(expected)
  })

  it("does not merge fuzzy color synonyms, models, frequencies, or distinct capacity units", () => {
    for (const [first, second] of [
      ["Цвет:Gray", "Цвет:Серый"],
      ["Модель:Redmi Note 7", "Модель:Redmi Note 7 Pro"],
      ["Частота:2.4 GHz", "Частота:2.4 ГГц"],
      ["Память:128 MB", "Память:128 GB"],
    ]) expect(canonicalCatalogToken(first)).not.toBe(canonicalCatalogToken(second))
  })

  it("deduplicates aliases while preserving one deterministic source display label", () => {
    const values = ["Объем встроенной памяти:128 Гб", "Встроенная память:128 GB", "встроенная память:128gb", "Встроенная память:256 Гб"]
    const groups = frontend.catalogOptionGroups(values)
    expect(groups).toEqual(frontend.catalogOptionGroups([...values].reverse()))
    expect(groups).toHaveLength(1)
    expect(groups[0].values).toEqual([
      { value: "Встроенная память:128 GB", label: "128 GB" },
      { value: "Встроенная память:256 Гб", label: "256 Гб" },
    ])
  })

  it("deduplicates a saved URL's equivalent selections without rewriting its source display strings", () => {
    const params = new URLSearchParams()
    params.append("option", "Память:128 Гб")
    params.append("option", "память:128GB")
    params.append("option", "Память:256 Гб")
    expect(frontend.parseCatalogState(params).options).toEqual(["Память:128 Гб", "Память:256 Гб"])
  })

  it("hides unapproved UI groups while allowing legacy internal-storage aliases", () => {
    const groups = frontend.catalogOptionGroups([
      "Бренд:Samsung", "Тип товара:Телефоны", "Модель:Galaxy", "Комплектация:Стандартная",
      "Объем оперативной памяти:8 ГБ", "Память:128 ГБ", "Процессор:Exynos",
      "Объем встроенной памяти:128 Гб", "Цвет:Черный", "Диагональ:6.2\"",
      "Количество ядер процессора:8", "Сканер отпечатка пальца:есть",
    ])
    expect(groups.map((group) => group.key).sort()).toEqual([
      "Встроенная память", "Цвет", "Диагональ", "Количество ядер процессора", "Сканер отпечатка пальца",
    ].sort())
    expect(groups.find((group) => group.key === "Встроенная память")?.values[0]).toEqual({ value: "Встроенная память:128 Гб", label: "128 Гб" })
  })
})
