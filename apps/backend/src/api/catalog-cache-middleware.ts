import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { advanceCatalogCache } from "../lib/catalog-read-cache"

// Redis generations close both the event-delivery race and the in-flight-read
// race: an old read can only populate an old generation, which is never reused.
export function invalidateCatalogAfterWrite(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const json = res.json.bind(res)
  res.json = ((body: unknown) => {
    if (res.statusCode >= 400) return json(body)
    advanceCatalogCache(req.scope).then(() => json(body), next)
    return res
  }) as typeof res.json
  next()
}
