import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { saveCheckoutServicesWorkflow } from "../../../../workflows/checkout-settings"
import type { CheckoutServicesInput } from "../validators"

export async function POST(req: AuthenticatedMedusaRequest<CheckoutServicesInput>, res: MedusaResponse) {
  const { result } = await saveCheckoutServicesWorkflow(req.scope).run({
    input: { ...req.validatedBody, actor_id: req.auth_context.actor_id },
  })
  res.json(result)
}
