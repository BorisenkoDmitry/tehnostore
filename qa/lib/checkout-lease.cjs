const { createRequire } = require("node:module")

// The public cart mutex intentionally survives process death until its lease
// expires. Wait for that exact synthetic cart; never delete or shorten a lock.
module.exports = async function waitForCheckoutLease(C, state) {
  if (!["cms_remediation_fixed_20261109", "cms_remediation_restored_20261109"].includes(C.target.database) || state.project !== C.target.project || state.database !== C.target.database || !/^cart_[A-Za-z0-9]+$/.test(state.cart?.id || "")) throw Error("Checkout lease target mismatch")
  const url = new URL(process.env.REDIS_URL || "http://invalid")
  if (url.protocol !== "redis:" || url.hostname !== "cache" || !["", "/", "/0"].includes(url.pathname)) throw Error("Checkout lease requires the isolated Redis service")
  const backendRequire = createRequire("/server/apps/backend/package.json")
  const medusaRequire = createRequire(backendRequire.resolve("@medusajs/medusa"))
  const Redis = createRequire(medusaRequire.resolve("@medusajs/locking-redis"))("ioredis")
  const client = new Redis(url.toString())
  const started = Date.now(), evidence = { method: "PTTL", initial_ttl_ms: null, final_ttl_ms: null, observations: 0, waited_ms: 0, forced_release: false }
  try {
    for (;;) {
      const ttl = await client.pttl("medusa_lock:texno-cart:" + state.cart.id)
      evidence.observations++
      if (evidence.initial_ttl_ms === null) evidence.initial_ttl_ms = ttl
      evidence.final_ttl_ms = ttl
      evidence.waited_ms = Date.now() - started
      C.report.checkout_lease = evidence
      if (ttl === -2) return
      if (ttl < 0 || ttl > 121000 || Date.now() - started > 130000) throw Error("Synthetic cart lease did not expire within its configured recovery bound")
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(ttl, 50), 1000)))
    }
  } finally { await client.quit() }
}
