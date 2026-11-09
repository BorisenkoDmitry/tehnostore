import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { createProductVariantsWorkflow, updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { restoreCatalogInventoryTitles, syncCatalogInventoryTitles } from "../../lib/catalog-inventory-titles"

updateProductsWorkflow.hooks.productsUpdated(
  async ({ products }, { container }) => new StepResponse(undefined,
    await syncCatalogInventoryTitles(container, products.map(({ id }) => id))),
  async (changes, { container }) => restoreCatalogInventoryTitles(container, changes),
)

createProductVariantsWorkflow.hooks.productVariantsCreated(
  async ({ product_variants }, { container }) => new StepResponse(undefined,
    await syncCatalogInventoryTitles(container, product_variants.flatMap(({ product_id }) => product_id ? [product_id] : []))),
  async (changes, { container }) => restoreCatalogInventoryTitles(container, changes),
)

updateProductVariantsWorkflow.hooks.productVariantsUpdated(
  async ({ product_variants }, { container }) => new StepResponse(undefined,
    await syncCatalogInventoryTitles(container, product_variants.flatMap(({ product_id }) => product_id ? [product_id] : []))),
  async (changes, { container }) => restoreCatalogInventoryTitles(container, changes),
)
