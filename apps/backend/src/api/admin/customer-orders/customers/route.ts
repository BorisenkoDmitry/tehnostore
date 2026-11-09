import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CustomerDirectoryQuery, parseDirectoryQuery } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { limit, offset, q, customer_type } = parseDirectoryQuery(CustomerDirectoryQuery, req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const phone = q && /^[+\d\s()\-]+$/.test(q) && q.replace(/\D/g, "").length >= 7 ? q.replace(/\D/g, "") : undefined
  const terms = (phone ? [phone] : q?.split(/\s+/).slice(0, 8))?.map((word) => {
    const pattern = `%${word.replace(/[\\%_]/g, "\\$&")}%`
    return { $or: ["first_name", "last_name", "email", "phone"].map((key) => ({ [key]: { $ilike: key === "phone" && phone ? `%${phone.split("").join("%")}%` : pattern } })) }
  })
  const { data: customers, metadata } = await query.graph({
    entity: "customer", fields: ["id", "first_name", "last_name", "email", "phone", "has_account", "created_at"],
    filters: { ...(customer_type === "all" ? {} : { has_account: customer_type === "registered" }), ...(terms?.length ? { $and: terms } : {}) },
    pagination: { take: limit, skip: offset, order: readTableOrder(req.query.order, ["first_name", "email", "has_account", "created_at"], "-created_at") },
  })
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ customers, count: metadata?.count ?? customers.length, limit, offset })
}
import { readTableOrder } from "../../../../lib/admin-table-order"
