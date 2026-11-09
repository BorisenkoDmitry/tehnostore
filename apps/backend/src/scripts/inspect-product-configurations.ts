import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { writeFileSync } from "node:fs"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"

export default async function inspectProductConfigurations({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "metadata", "categories.id", "categories.handle", "categories.parent_category_id", "catalog_record.attributes", "variants.id", "variants.title", "variants.catalog_variant.attributes"],
    filters: { status: "published" },
    pagination: { take: 2000 },
  })
  const products = data.map((product) => ({
    ...product,
    catalog_record: { attributes: (product.catalog_record?.attributes as unknown as CatalogAttributeInput[] ?? []).filter((attribute) => attribute.public) },
  }))
  writeFileSync("/tmp/pdp-family-snapshot.json", JSON.stringify(products))
  console.log(`Inspected ${products.length} published products (read only)`)
}
