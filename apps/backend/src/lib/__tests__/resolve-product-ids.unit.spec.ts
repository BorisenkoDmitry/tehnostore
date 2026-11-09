import type { SearchTypes } from "@medusajs/framework/types"
import { resolveProductIds } from "../../search/helpers/resolve-product-ids"

describe("search updates after cascading product deletion", () => {
  it("skips missing deleted options while preserving surviving product identities", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [undefined, { product_id: "prod_surviving" }, null] })
    const context = { container: { query: { graph } } } as unknown as SearchTypes.SearchIngestionContext
    await expect(resolveProductIds({ name: "product-option.deleted", data: [{ id: "opt_removed" }, { id: "opt_surviving" }] }, context)).resolves.toEqual(["prod_surviving"])
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "product_option", withDeleted: true, filters: { id: ["opt_removed", "opt_surviving"] } }))
  })
  it("handles late variant and option-value delete events after rows are gone", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [undefined] })
    const context = { container: { query: { graph } } } as unknown as SearchTypes.SearchIngestionContext
    for (const name of ["product-variant.deleted", "product-option-value.deleted"]) await expect(resolveProductIds({ name, data: { id: "removed" } }, context)).resolves.toEqual([])
  })
})
