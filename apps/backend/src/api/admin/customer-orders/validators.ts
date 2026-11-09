import { z } from "@medusajs/framework/zod"
import { MedusaError } from "@medusajs/framework/utils"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
export const CustomerDirectoryQuery = z.object({
  q: z.string().trim().max(200).optional(), customer_type: z.enum(["all", "registered", "guest"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0),
})
export const CustomerOrderQuery = CustomerDirectoryQuery.extend({
  customer_id: z.string().trim().min(1).max(100).optional(), product_id: z.string().trim().min(1).max(100).optional(), variant_id: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["pending", "completed", "draft", "archived", "canceled", "requires_action"]).optional(), from: date.optional(), to: date.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, "Начало периода должно предшествовать концу")
export type CustomerOrderQueryType = z.infer<typeof CustomerOrderQuery>
export const CustomerOrderStatusSchema = z.object({ action: z.enum(["confirm", "complete"]) })
export type CustomerOrderStatusBody = z.infer<typeof CustomerOrderStatusSchema>
export function parseDirectoryQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Проверьте поиск, фильтры и диапазон дат")
  return parsed.data
}
