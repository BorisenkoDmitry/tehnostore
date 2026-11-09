import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Navigate } from "react-router-dom"

const CheckoutServicesPage = () => <Navigate to="/storefront/cart/services" replace />

export const config = defineRouteConfig({ permissions: ["region:read"] })
export default CheckoutServicesPage
