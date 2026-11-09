import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { texnoCartWorkflow } from "../../../workflows/texno-cart"
import type { CreateTexnoCart } from "./validators"

export async function POST(req: MedusaStoreRequest<CreateTexnoCart>, res: MedusaResponse) {
  const { result } = await texnoCartWorkflow(req.scope).run({ input: { operation: req.auth_context?.actor_id ? "resolve" : "create", customer_id: req.auth_context?.actor_id, channel_ids: req.publishable_key_context?.sales_channel_ids ?? [], data: req.validatedBody } })
  res.json(result)
}
