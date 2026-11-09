import { matchesCatalogVariant } from "../../search/helpers/match-catalog-variants"
import { LEGACY_VARIATION_FACETS, libraryFacetNames, variationFacets } from "../../search/helpers/variation-facets"
import { LIBRARY_VARIATIONS } from "../catalog-variation-library"

const choices = (color: string, size: string) => ({
  options: [{ option: { title: "Цвет" }, value: color }, { option: { title: "Размер" }, value: size }],
})

describe("catalog variant search", () => {
  it("matches selected axes on the same variant and keeps alternatives within an axis", () => {
    const variants = [choices("Чёрный", "S"), choices("Чёрный", "M"), choices("Зелёный", "XL")]
    expect(matchesCatalogVariant(variants, [["цвет:черный"], ["размер:xl"]])).toBe(false)
    expect(matchesCatalogVariant(variants, [["цвет:черный", "цвет:зеленый"], ["размер:xl"]])).toBe(true)
  })

  it("leaves a product-wide characteristic outside the variant match", () => {
    const variants = [choices("Чёрный", "S"), choices("Зелёный", "XL")]
    expect(matchesCatalogVariant(variants, [["цвет:черный"], ["материал:хлопок"]])).toBe(true)
  })

  it("filters migrated assignments by old and renamed labels on the same actual variant", () => {
    const variants = [
      { id: "a", metadata: { [LEGACY_VARIATION_FACETS]: { display: ["Цвет:Чёрный", "Размер:S"], lookup: ["Бренд:Пример"] } } },
      { id: "b", metadata: { [LEGACY_VARIATION_FACETS]: { display: ["Цвет:Зелёный", "Размер:XL"] } } },
    ]
    const metadata = { insales_product_id: "42", [LIBRARY_VARIATIONS]: {
      a: { color: { original: "Чёрный", choice: "Синий", value: "Синий", display: ["Цвет:Чёрный"] } },
      b: { color: { original: "Зелёный", choice: "Зелёный", value: "Зелёный", display: ["Цвет:Зелёный"] } },
    } }
    const names = libraryFacetNames([{ code: "color", label: "Оттенок", aliases: ["Цвет"] }])
    expect(variationFacets(variants[0], metadata, names)).toEqual({ display: ["Цвет:Синий", "Размер:S"], lookup: ["Бренд:Пример", "Оттенок:Синий"] })
    expect(matchesCatalogVariant(variants, [["оттенок:синий"], ["размер:xl"]], metadata, names)).toBe(false)
    expect(matchesCatalogVariant(variants, [["цвет:синий"], ["размер:s"]], metadata, names)).toBe(true)
    expect(matchesCatalogVariant(variants, [["оттенок:синий"], ["размер:s"]], metadata, names)).toBe(true)
  })
})
