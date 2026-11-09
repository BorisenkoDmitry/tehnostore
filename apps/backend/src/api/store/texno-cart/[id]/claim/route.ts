import type { AuthenticatedMedusaRequest, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { texnoCartWorkflow } from "../../../../../workflows/texno-cart"

export async function POST(req: AuthenticatedMedusaRequest & MedusaStoreRequest, res: MedusaResponse) {
  const { result } = await texnoCartWorkflow(req.scope).run({ input: {
    operation: "claim", id: req.params.id, token: String(req.headers["x-texno-cart-token"] ?? ""),
    customer_id: req.auth_context.actor_id, channel_ids: req.publishable_key_context?.sales_channel_ids ?? [], data: {},
  } })
  res.json(result)
}
