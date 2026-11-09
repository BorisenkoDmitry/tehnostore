import { contentPreviewCountry } from "../../admin/lib/content-preview-country"

describe("F13 content preview country", () => {
  it("selects the configured region, including when it is not the first returned region", () => {
    expect(contentPreviewCountry({ profile: { region_id: "rub" }, regions: [{ id: "demo", countries: [{ iso_2: "dk" }] }, { id: "rub", countries: [{ iso_2: "RU" }] }] })).toBe("ru")
  })
  it("does not invent a country while profile or region data is missing", () => {
    expect(contentPreviewCountry()).toBeUndefined()
    expect(contentPreviewCountry({ profile: null, regions: [{ id: "demo", countries: [{ iso_2: "dk" }] }] })).toBeUndefined()
    expect(contentPreviewCountry({ profile: { region_id: "missing" }, regions: [] })).toBeUndefined()
  })
})
