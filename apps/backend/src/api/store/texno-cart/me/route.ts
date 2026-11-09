import type { AuthenticatedMedusaRequest, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { customerCartState } from "../../../../lib/texno-cart"
import { texnoCartWorkflow } from "../../../../workflows/texno-cart"

export async function GET(req: AuthenticatedMedusaRequest & MedusaStoreRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ state: await customerCartState(req.scope, req.auth_context.actor_id, req.publishable_key_context?.sales_channel_ids ?? []) })
}
export async function POST(req: AuthenticatedMedusaRequest & MedusaStoreRequest, res: MedusaResponse) {
  const { result } = await texnoCartWorkflow(req.scope).run({ input: { operation: "resolve", customer_id: req.auth_context.actor_id, channel_ids: req.publishable_key_context?.sales_channel_ids ?? [], data: {} } })
  res.setHeader("Cache-Control", "private, no-store")
  res.json(result)
}
