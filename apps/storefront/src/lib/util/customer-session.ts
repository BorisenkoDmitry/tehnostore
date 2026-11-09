type SessionCookies = {
  get(name: string): { value: string } | undefined
  delete(name: string): unknown
}

/** Reject an invalid customer session without making public pages require login.
 * Keep guest-cart capabilities and saved cart IDs: they are independently scoped.
 */
export async function expireCustomerSession(
  cookies: SessionCookies,
  verify: (token: string) => Promise<unknown>
): Promise<string[]> {
  const token = cookies.get("_medusa_jwt")?.value
  if (!token) return []
  try {
    await verify(token)
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0
    // A service outage must not erase a valid customer's session.
    if (![401, 403, 404].includes(status)) return []
    const names = ["_medusa_jwt", "_medusa_pending_customer"]
    names.forEach((name) => cookies.delete(name))
    return names
  }
  return []
}
