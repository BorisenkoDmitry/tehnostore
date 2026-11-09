import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CatalogConstructorScreen } from "../catalog-screen"

export const config = defineRouteConfig({ label: "Категории", rank: 4, permissions: ["product:read", "product_category:read"] })
const ConstructorCategoriesPage = () => <CatalogConstructorScreen section="folders" />
export default ConstructorCategoriesPage
