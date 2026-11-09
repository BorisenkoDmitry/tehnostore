import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Navigate } from "react-router-dom"

export const config = defineRouteConfig({ permissions: ["product:read", "product_category:read"] })
const LegacyCatalogTrash = () => <Navigate to="/catalog-trash" replace />

export default LegacyCatalogTrash
