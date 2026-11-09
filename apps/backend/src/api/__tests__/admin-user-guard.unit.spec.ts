import { requireCurrentAdminUser } from "../admin-user-guard"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

function fixture(actor: string, exists: boolean) {
  const listUsers = jest.fn(async () => exists ? [{ id: "user_staff" }] : [])
  const req = { auth_context: { actor_type: actor, actor_id: "user_staff" }, session: { auth_context: { actor_type: actor } }, scope: { resolve: () => ({ listUsers }) } } as unknown as AuthenticatedMedusaRequest
  const json = jest.fn(), status = jest.fn(() => ({ json }))
  return { req, res: { status } as unknown as MedusaResponse, next: jest.fn(), status, json, listUsers }
}

describe("F5 current staff boundary", () => {
  it("rejects a deleted user on every request and clears the stale staff session", async () => {
    const f = fixture("user", false)
    await requireCurrentAdminUser(f.req, f.res, f.next)
    expect(f.status).toHaveBeenCalledWith(401)
    expect(f.next).not.toHaveBeenCalled()
    expect(f.req.session.auth_context).toBeUndefined()
    expect(f.listUsers).toHaveBeenCalledWith({ id: "user_staff" }, { select: ["id"] })
  })
  it("does not cache a successful lookup across deletion", async () => {
    const f = fixture("user", true)
    await requireCurrentAdminUser(f.req, f.res, f.next)
    f.listUsers.mockResolvedValueOnce([])
    await requireCurrentAdminUser(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalledTimes(1)
    expect(f.status).toHaveBeenCalledWith(401)
  })
  it.each(["customer", "api-key"])("preserves native %s authentication", async (actor) => {
    const f = fixture(actor, false)
    await requireCurrentAdminUser(f.req, f.res, f.next)
    expect(f.listUsers).not.toHaveBeenCalled()
    expect(f.next).toHaveBeenCalledTimes(1)
  })
  it("fails closed on database errors", async () => {
    const f = fixture("user", true)
    f.listUsers.mockRejectedValueOnce(new Error("database unavailable"))
    await expect(requireCurrentAdminUser(f.req, f.res, f.next)).rejects.toThrow("database unavailable")
    expect(f.next).not.toHaveBeenCalled()
  })
})
