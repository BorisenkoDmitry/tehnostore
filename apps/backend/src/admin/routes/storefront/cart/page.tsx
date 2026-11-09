import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useRegionPermissions } from "@medusajs/dashboard/hooks"
import { ShoppingCart } from "@medusajs/icons"
import { Navigate, useSearchParams } from "react-router-dom"

const CartSettingsPage = () => {
  const [params] = useSearchParams()
  const { canRead } = useRegionPermissions()
  const section = params.get("tab") === "services" && canRead ? "services" : "delivery"
  return <Navigate to={`/storefront/cart/${section}`} replace />
}

export const config = defineRouteConfig({ label: "Корзина покупателя", icon: ShoppingCart })
export default CartSettingsPage
