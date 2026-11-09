import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { cartState, privateCart } from "../../../../lib/texno-cart"
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  let cart = await privateCart(req.scope, req.params.id, String(req.headers["x-texno-cart-token"] ?? ""), req.auth_context?.actor_id)
  if (cart.metadata?.texno_merged_into) cart = await privateCart(req.scope, cart.metadata.texno_merged_into, "", req.auth_context?.actor_id)
  if (!req.publishable_key_context?.sales_channel_ids.includes(cart.sales_channel_id)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Канал магазина недоступен")
  res.setHeader("Cache-Control", "private, no-store")
  res.json(await cartState(req.scope, cart))
}
