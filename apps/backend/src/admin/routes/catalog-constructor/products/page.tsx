import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CatalogConstructorScreen } from "../catalog-screen"

export const config = defineRouteConfig({ label: "Товары", rank: 1, permissions: ["product:read", "product_category:read"] })
const ConstructorProductsPage = () => <CatalogConstructorScreen section="products" />
export default ConstructorProductsPage
