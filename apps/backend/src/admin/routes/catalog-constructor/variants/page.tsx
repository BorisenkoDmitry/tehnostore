import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CatalogConstructorScreen } from "../catalog-screen"

export const config = defineRouteConfig({ label: "Варианты", rank: 2, permissions: ["product:read", "product_category:read", "product_variant:read"] })
const ConstructorVariantsPage = () => <CatalogConstructorScreen section="variants" />
export default ConstructorVariantsPage
