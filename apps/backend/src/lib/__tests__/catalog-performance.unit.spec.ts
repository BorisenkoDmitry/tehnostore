import { advanceCatalogCache, cachedCatalogRead } from "../catalog-read-cache"
import { variantSearchProjection } from "../catalog-variant-search"
import { matchCatalogVariantFilters, matchesCatalogVariant } from "../../search/helpers/match-catalog-variants"
import { LEGACY_VARIATION_FACETS } from "../../search/helpers/variation-facets"

describe("catalog read caching", () => {
  it("cannot repopulate the current generation with a read started before a CMS save", async () => {
    const entries = new Map<string, object>()
    const caching = { get: async ({ key }) => entries.get(key), set: async ({ key, data }) => { entries.set(key, data) } }
    const container = { resolve: () => caching } as any
    let finish!: (data: object) => void
    const pending = cachedCatalogRead(container, "race", [], () => new Promise<object>((resolve) => { finish = resolve }))
    await new Promise((resolve) => setImmediate(resolve))
    await advanceCatalogCache(container)
    finish({ title: "old" })
    await pending
    expect(await cachedCatalogRead(container, "race", [], async () => ({ title: "new" }))).toEqual({ title: "new" })
  })
  it("stores only successful loads with explicit entity invalidation tags", async () => {
    const caching = { get: jest.fn().mockResolvedValue(null), set: jest.fn() }
    const container = { resolve: () => caching } as any
    const load = jest.fn().mockResolvedValue([{ id: "definition" }])
    expect(await cachedCatalogRead(container, "definitions", ["CatalogDefinition:list:*"], load)).toEqual([{ id: "definition" }])
    expect(caching.set).toHaveBeenCalledWith(expect.objectContaining({ ttl: 300, tags: ["CatalogDefinition:list:*"], options: { autoInvalidate: true } }))
    caching.get.mockResolvedValue([{ id: "cached" }])
    expect(await cachedCatalogRead(container, "definitions", [], load)).toEqual([{ id: "cached" }])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("never caches failed loads and works without a caching module", async () => {
    const set = jest.fn()
    const container = { resolve: () => ({ get: async () => null, set }) } as any
    await expect(cachedCatalogRead(container, "fail", [], async () => { throw new Error("unavailable") })).rejects.toThrow("unavailable")
    expect(set).not.toHaveBeenCalled()
    expect(await cachedCatalogRead({ resolve: () => undefined } as any, "fallback", [], async () => [])).toEqual([])
  })
})

describe("catalog variant projection", () => {
  it("preserves three-axis correlation, absent fields and alternatives", () => {
    const variants = [["Цвет:Красный", "Размер:S", "Память:64"], ["Цвет:Красный", "Размер:M", "Память:128"], ["Цвет:Синий", "Размер:S", "Память:128"]].map((display, index) => ({ id: String(index), metadata: { [LEGACY_VARIATION_FACETS]: { display } } }))
    const projection = variantSearchProjection(variants)
    expect(projection.fields).toEqual(["цвет", "размер", "память"])
    expect(matchesCatalogVariant(variants, [["цвет:красный"], ["размер:s"], ["память:128"]])).toBe(false)
    expect(matchesCatalogVariant(variants, [["цвет:красный", "цвет:синий"], ["размер:s"], ["память:128"]])).toBe(true)
    expect(matchesCatalogVariant(variants, [["цвет:красный"], ["материал:хлопок"]])).toBe(true)
    expect(projection.rows).toHaveLength(3)
  })

  it("keeps visibility filters and pagination in the core endpoint without hydrating candidates", async () => {
    const findVariantMismatches = jest.fn().mockResolvedValue(["prod_impossible"])
    const query = { entity: "product", filters: { q: "phone", $and: [{ filter_values: "цвет:черный" }, { filter_values: { $in: ["размер:s", "размер:m"] } }] }, pagination: { skip: 12, take: 12 }, search_options: { facets: ["option_values"] } }
    const req = { validatedBody: { queries: [query, query] }, publishable_key_context: { sales_channel_ids: ["sc_allowed"] }, scope: { resolve: jest.fn().mockReturnValue({ findVariantMismatches }) } } as any
    const next = jest.fn()
    await matchCatalogVariantFilters(req, {} as any, next)
    expect(findVariantMismatches).toHaveBeenCalledTimes(1)
    expect(req.validatedBody.queries[0]).toMatchObject({ pagination: query.pagination, search_options: query.search_options, filters: { q: "phone", $and: [expect.anything(), { id: { $nin: ["prod_impossible"] } }] } })
    expect(next).toHaveBeenCalledTimes(1)
  })
})

const frontend = require("../../../../storefront/src/modules/store/lib/catalog-search") as any
const frontendState = require("../../../../storefront/src/modules/store/lib/catalog-data") as any

describe("shared server and browser catalog queries", () => {
  const config = { currency: "rub", scope: "test", categories: [{ id: "a", handle: "phones", parent_id: null }, { id: "b", handle: "apple", parent_id: "a" }] }
  it("uses the same category descendants, sale prices and AND/OR choices on first render", () => {
    const state = { ...frontendState.initialCatalogState, category: "a", sale: true, options: ["Цвет:Чёрный", "Цвет:Синий", "Размер:XL"], min: "100", page: 2 }
    const [hits, facets] = frontend.catalogSearchQueries(state, [], config)
    expect(hits.params.page).toBe(1)
    expect(hits.params.facetFilters).toContainEqual(["category_handles:phones", "category_handles:apple"])
    expect(hits.params.facetFilters).toContainEqual(["filter_values:цвет:черный", "filter_values:цвет:синий"])
    expect(hits.params.numericFilters).toEqual(["min_sale_price_rub>=100"])
    expect(hits.params.attributesToRetrieve).not.toContain("description")
    expect(facets.params.hitsPerPage).toBe(0)
    expect(facets.params.facetFilters.flat()).not.toContain("filter_values:размер:xl")
  })

  it("keeps empty results, out-of-range correction and currency amounts consistent", () => {
    const state = { ...frontendState.initialCatalogState, page: 5 }
    const mapped = frontend.catalogSearchResponse([{ hits: [], nbHits: 0, nbPages: 0 }, { hits: [], nbHits: 0, nbPages: 0 }], state, [], config)
    expect(mapped.state.page).toBe(1)
    expect(mapped.result.products).toEqual([])
    expect(mapped.result.currency).toBe("rub")
  })

  it("returns React-serializable objects while retaining safe arbitrary attribute names", () => {
    const mapped = frontend.catalogSearchResponse([{ hits: [{ id: "a", title: "Test", option_values: ["__proto__:safe", "constructor:value"], min_price_rub: 100 }], nbHits: 1, nbPages: 1 }, { hits: [], nbHits: 1, nbPages: 1 }], frontendState.initialCatalogState, [], config)
    const options = mapped.result.products[0].options
    expect(Object.getPrototypeOf(options)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(options, "__proto__")).toBe(true)
    expect(options.__proto__).toEqual(["safe"])
    expect(options.constructor).toEqual(["value"])
    expect(JSON.parse(JSON.stringify(mapped.result)).products[0].price).toBe(100)
  })
})
