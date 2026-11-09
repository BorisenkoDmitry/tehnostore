import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { changeCustomerOrderStatusWorkflow } from "../../../../../../workflows/customer-order-status"
import type { CustomerOrderStatusBody } from "../../../validators"

export async function POST(req: AuthenticatedMedusaRequest<CustomerOrderStatusBody>, res: MedusaResponse) {
  const { result } = await changeCustomerOrderStatusWorkflow(req.scope).run({
    input: { id: req.params.id, action: req.validatedBody.action, actor_id: req.auth_context.actor_id },
  })
  res.json(result)
}
