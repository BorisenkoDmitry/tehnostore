import { z } from "@medusajs/framework/zod"

export const CreateTexnoCart = z.strictObject({})
export const TexnoCartItems = z.strictObject({ variant_id: z.string().min(1).max(100), quantity: z.number().int().min(0).max(999), mutation_id: z.uuid(), increment: z.boolean().default(false) })
export const TexnoCartQuote = z.strictObject({ delivery_method: z.string().max(80).optional(), services: z.array(z.string().max(80)).max(50).default([]) })
export const TexnoCartCheckout = z.strictObject({
  saved_address_id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(2).max(120), phone: z.string().max(40), email: z.union([z.email(), z.literal("")]).optional(),
  city: z.string().trim().min(1).max(120), delivery_method: z.string().max(80),
  address: z.record(z.string().max(30), z.string().trim().max(250)),
  delivery_date: z.string().max(10), delivery_slot: z.string().max(20),
  payment_preference: z.enum(["cash", "card_on_receipt"]), services: z.array(z.string().max(80)).max(50),
  comment: z.string().max(2000).optional(), consent: z.literal(true), expected_total: z.number().finite().nonnegative(),
})
export type CreateTexnoCart = z.infer<typeof CreateTexnoCart>
export type TexnoCartItems = z.infer<typeof TexnoCartItems>
export type TexnoCartQuote = z.infer<typeof TexnoCartQuote>
export type TexnoCartCheckout = z.infer<typeof TexnoCartCheckout>
