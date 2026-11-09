import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customer = req.auth_context.actor_id
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["id", "customer_id", "email", "metadata"], filters: { id: req.params.id, customer_id: customer } })
  const order = data[0]
  const snapshot = order?.metadata?.texno_order as Record<string, unknown> | undefined
  if (!snapshot || order.metadata?.texno_checkout !== true || order.metadata?.texno_customer_id !== customer) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Заказ не найден")
  const strings = ["contact_name", "phone", "city", "delivery_method", "delivery_pricing", "delivery_date", "delivery_slot", "payment_preference", "comment"]
  const allowedAddress = new Set(["street", "house", "building", "metro", "apartment", "entrance", "intercom", "floor", "pickup", "postal_code"])
  const address = Object.fromEntries(Object.entries((snapshot.address ?? {}) as object).filter(([key, value]) => allowedAddress.has(key) && typeof value === "string"))
  const quote = snapshot.quote as Record<string, unknown> | undefined
  const services = Array.isArray(snapshot.services) ? snapshot.services.map((service) => ({ label: String(service.label ?? ""), price: Number(service.price ?? 0) })) : []
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ checkout: {
    confirmed_at: typeof order.metadata?.texno_order_confirmed_at === "string" ? order.metadata.texno_order_confirmed_at : null,
    ...Object.fromEntries(strings.map((key) => [key, typeof snapshot[key] === "string" ? snapshot[key] : ""])),
    email: order.email ?? null, address, services,
    quote: quote ? Object.fromEntries(["items_total", "services_total", "delivery_total", "total", "min_total", "max_total", "requires_confirmation"].filter((key) => key in quote).map((key) => [key, quote[key]])) : null,
  } })
}
