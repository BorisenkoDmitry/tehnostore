import { z } from "@medusajs/framework/zod"

export const CreateInsalesImportSchema = z.object({ filename: z.string().min(1).max(200), source_base64: z.string().min(4).max(28 * 1024 * 1024) })
export const ActionInsalesImportSchema = z.object({ action: z.enum(["queue", "resume", "cancel"]) })
export type CreateInsalesImportInput = z.infer<typeof CreateInsalesImportSchema>
export type ActionInsalesImportInput = z.infer<typeof ActionInsalesImportSchema>
