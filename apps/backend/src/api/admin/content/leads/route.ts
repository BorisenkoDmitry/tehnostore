import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
import { ContentLeadQuery } from "../../../../modules/content/validation"
import { MedusaError } from "@medusajs/framework/utils"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const parsed = ContentLeadQuery.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Проверьте поиск, фильтры и параметры страниц списка обращений")
  const { limit, offset, q, status, type, source } = parsed.data
  const pattern = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : undefined
  const filters = { ...(status ? { status } : {}), ...(type ? { type } : {}), ...(source ? { source } : {}), ...(pattern ? { $or: ["name", "email", "phone", "message"].map((key) => ({ [key]: { $ilike: pattern } })) } : {}) }
  const order = readTableOrder(req.query.order, ["source", "name", "message", "status", "created_at"], "-created_at")
  const [leads, count] = await service.listAndCountContentLeads(filters, { take: limit, skip: offset, order })
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ leads, count })
}
import { readTableOrder } from "../../../../lib/admin-table-order"
