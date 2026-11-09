import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { texnoCartWorkflow } from "../../../../../workflows/texno-cart"
import type { TexnoCartQuote } from "../../validators"
export async function POST(req: MedusaStoreRequest<TexnoCartQuote>, res: MedusaResponse) {
  const { result } = await texnoCartWorkflow(req.scope).run({ input: { operation: "quote", id: req.params.id, token: String(req.headers["x-texno-cart-token"] ?? ""), customer_id: req.auth_context?.actor_id, channel_ids: req.publishable_key_context?.sales_channel_ids ?? [], data: req.validatedBody } })
  res.json(result)
}
