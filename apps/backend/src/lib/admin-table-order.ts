import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

export const productOrderFields = ["title", "status", "created_at"] as const
export const variantOrderFields = ["title", "sku", "created_at"] as const
export const trashOrderFields = ["title", "created_at"] as const

export const tableOrderSchema = (fields: readonly string[]) => z.string().refine(
  (value) => fields.includes(value.startsWith("-") ? value.slice(1) : value),
  "Выберите доступную колонку для сортировки",
).optional()

export function readTableOrder(value: unknown, fields: readonly string[], fallback: string) {
  const parsed = tableOrderSchema(fields).safeParse(value)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Недоступная сортировка")
  return tableOrderBy(parsed.data ?? fallback)
}

export function tableOrderBy(order: string): Record<string, "ASC" | "DESC"> {
  const desc = order.startsWith("-")
  return { [desc ? order.slice(1) : order]: desc ? "DESC" : "ASC", id: "ASC" }
}
