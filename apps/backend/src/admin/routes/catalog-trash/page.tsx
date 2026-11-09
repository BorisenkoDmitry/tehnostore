import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Trash } from "@medusajs/icons"
import { CatalogTrash } from "../catalog-constructor/catalog-trash"

export const config = defineRouteConfig({
  label: "Корзина",
  icon: Trash,
  permissions: ["product:read", "product_category:read"],
})

export default CatalogTrash
