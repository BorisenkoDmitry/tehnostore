import { includeNativeAxisValues, nativeCatalogAxes } from "../catalog-native-axes"
import type { CatalogDefinitionData } from "../catalog-cms"

const definitions: CatalogDefinitionData[] = [
  { id: "def_size", code: "size", label: "Размер", aliases: ["Size"], enabled: true, public: true, filterable: true, position: 0, type: "text", unit: null },
  { id: "def_color", code: "color", label: "Цвет", aliases: ["Color"], enabled: true, public: true, filterable: true, position: 1, type: "text", unit: null },
]

describe("F8 native and CMS catalog axes", () => {
  it("carries native size and colour choices using existing IDs and explicit profile axes", () => {
    const options = [{ id: "opt_size", title: " SIZE " }, { id: "opt_color", title: "Цвет" }]
    const selected = [{ option_id: "opt_size", value: "M" }, { option_id: "opt_color", value: "Синий" }]
    const before = JSON.stringify({ options, selected })
    const axes = nativeCatalogAxes(options, ["size", "color"], definitions)
    expect(includeNativeAxisValues([], selected, axes)).toEqual([{ code: "size", values: ["M"] }, { code: "color", values: ["Синий"] }])
    expect(JSON.stringify({ options, selected })).toBe(before)
  })
  it("keeps submitted values authoritative and is idempotent", () => {
    const axes = nativeCatalogAxes([{ id: "size", title: "Размер" }], ["size"], definitions)
    const options = [{ option_id: "size", value: "M" }]
    const rows = [{ code: "size", values: ["L"] }]
    expect(includeNativeAxisValues(rows, options, axes)).toEqual(rows)
    expect(includeNativeAxisValues(includeNativeAxisValues([], options, axes), options, axes)).toEqual([{ code: "size", values: ["M"] }])
  })
  it("ignores disabled, non-profile and ambiguous options instead of inventing a mapping", () => {
    expect(nativeCatalogAxes([{ id: "a", title: "Size" }, { id: "b", title: "Размер" }], ["size"], definitions)).toEqual([])
    expect(nativeCatalogAxes([{ id: "a", title: "Size" }], [], definitions)).toEqual([])
    expect(nativeCatalogAxes([{ id: "a", title: "Size" }], ["size"], [{ ...definitions[0], enabled: false }])).toEqual([])
  })
})
