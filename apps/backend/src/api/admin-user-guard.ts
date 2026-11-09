import type { AuthenticatedMedusaRequest, MedusaNextFunction, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// Authentication verifies a credential. A staff credential must also refer to
// a currently existing user. Do not cache this decision for the JWT lifetime.
export async function requireCurrentAdminUser(req: AuthenticatedMedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const auth = req.auth_context
  // Native authentication owns API-key validation and public invite endpoints.
  if (auth?.actor_type !== "user" || !auth.actor_id) return next()
  const users = await req.scope.resolve(Modules.USER).listUsers({ id: auth.actor_id }, { select: ["id"] })
  if (!users.length) {
    // Clear the stale session too; bearer requests have no server session state.
    if (req.session?.auth_context?.actor_type === "user") delete req.session.auth_context
    res.status(401).json({ message: "Unauthorized" })
    return
  }
  next()
}
