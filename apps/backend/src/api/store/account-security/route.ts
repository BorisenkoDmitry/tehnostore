import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { accountSecurityWorkflow } from "../../../workflows/account-security"
import type { AccountSecurityInput } from "./validators"

export async function POST(req: AuthenticatedMedusaRequest<AccountSecurityInput>, res: MedusaResponse) {
  const { result } = await accountSecurityWorkflow(req.scope).run({ input: { ...req.validatedBody, customer_id: req.auth_context.actor_id, auth_identity_id: req.auth_context.auth_identity_id } })
  res.json(result)
}
