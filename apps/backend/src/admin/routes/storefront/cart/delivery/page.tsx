import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CartSettings } from "../cart-settings"
import { DeliverySettings } from "../delivery-settings"

const CartDeliveryPage = () => <CartSettings section="delivery"><DeliverySettings /></CartSettings>

export const config = defineRouteConfig({ label: "Доставка", rank: 1 })
export default CartDeliveryPage
