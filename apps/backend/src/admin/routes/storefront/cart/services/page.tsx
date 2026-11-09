import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CartSettings } from "../cart-settings"
import { ServiceSettings } from "../service-settings"

const CartServicesPage = () => <CartSettings section="services"><ServiceSettings /></CartSettings>

export const config = defineRouteConfig({ label: "Доп. услуги", rank: 2, permissions: ["region:read"] })
export default CartServicesPage
