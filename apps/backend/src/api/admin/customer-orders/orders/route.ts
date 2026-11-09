import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CustomerOrderQuery, parseDirectoryQuery } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { limit, offset, q, customer_type, customer_id, product_id, variant_id, status, from, to } = parseDirectoryQuery(CustomerOrderQuery, req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const filters: Record<string, unknown> = { is_draft_order: false }
  const and: Record<string, unknown>[] = []
  if (customer_id) filters.customer_id = customer_id
  if (status) filters.status = status
  if (from || to) {
    const until = to ? new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 24 * 60 * 60 * 1000) : undefined
    filters.created_at = { ...(from ? { $gte: new Date(`${from}T00:00:00+03:00`) } : {}), ...(until ? { $lt: until } : {}) }
  }
  if (product_id || variant_id) filters.items = { ...(product_id ? { product_id } : {}), ...(variant_id ? { variant_id } : {}) }
  if (customer_type !== "all") {
    if (customer_id) {
      const { data } = await query.graph({ entity: "customer", fields: ["id"], filters: { id: customer_id, has_account: customer_type === "registered" }, pagination: { take: 1 } })
      if (!data.length) { res.setHeader("Cache-Control", "private, no-store"); res.json({ orders: [], count: 0, limit, offset }); return }
    } else {
      // Query the owning Customer module for IDs only, then apply a native
      // Order-module predicate. No linked filters run in JavaScript, no PII
      // directory is downloaded to the browser, and results stay DB-paginated.
      const registered: string[] = []
      let skip = 0
      while (true) {
        const { data } = await query.graph({ entity: "customer", fields: ["id"], filters: { has_account: true }, pagination: { take: 1000, skip, order: { id: "ASC" } } })
        registered.push(...data.map((customer) => customer.id))
        if (data.length < 1000) break
        skip += data.length
      }
      if (customer_type === "registered") filters.customer_id = registered.length ? registered : ["__no_registered_customer__"]
      else if (registered.length) and.push({ $or: [{ customer_id: { $nin: registered } }, { customer_id: null }] })
    }
  }
  if (q) {
    const phone = /^[+\d\s()\-]+$/.test(q) && q.replace(/\D/g, "").length >= 7 ? q.replace(/\D/g, "") : undefined
    for (const word of phone ? [phone] : q.split(/\s+/).slice(0, 8)) {
      const pattern = `%${word.replace(/[\\%_]/g, "\\$&")}%`
      const alternatives: Record<string, unknown>[] = [{ email: { $ilike: pattern } }, { shipping_address: { first_name: { $ilike: pattern } } }, { shipping_address: { last_name: { $ilike: pattern } } }, { shipping_address: { phone: { $ilike: phone ? `%${phone.split("").join("%")}%` : pattern } } }]
      const number = word.replace(/^#/, "")
      if (/^\d+$/.test(number) && Number.isSafeInteger(Number(number)) && Number(number) <= 2147483647) alternatives.push({ display_id: Number(number) })
      and.push({ $or: alternatives })
    }
  }
  if (and.length) filters.$and = and
  const { data: orders, metadata } = await query.graph({
    entity: "order", fields: ["id", "display_id", "status", "metadata", "created_at", "currency_code", "email", "customer_id", "total", "shipping_address.first_name", "shipping_address.last_name", "shipping_address.phone", "items.id", "items.title", "items.variant_title", "items.quantity", "items.product_id", "items.variant_id", "customer.id", "customer.has_account", "customer.first_name", "customer.last_name"],
    filters, pagination: { take: limit, skip: offset, order: readTableOrder(req.query.order, ["display_id", "status", "created_at"], "-created_at") },
  })
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ orders: orders.map(({ metadata, ...order }) => ({ ...order, confirmed: !!metadata?.texno_order_confirmed_at })), count: metadata?.count ?? orders.length, limit, offset })
}
import { readTableOrder } from "../../../../lib/admin-table-order"
