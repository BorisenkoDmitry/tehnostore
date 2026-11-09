import { z } from "@medusajs/framework/zod"

export const AccountSecuritySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("email"), current_password: z.string().min(1).max(256), email: z.email().max(254).transform((value) => value.trim().toLowerCase()) }),
  z.object({ operation: z.literal("password"), current_password: z.string().min(1).max(256), password: z.string().min(8).max(128) }),
])
export type AccountSecurityInput = z.infer<typeof AccountSecuritySchema>
