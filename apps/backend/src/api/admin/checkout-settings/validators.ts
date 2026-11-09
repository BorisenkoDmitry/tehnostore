import { z } from "@medusajs/framework/zod"

const Identifier = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)
const Money = z.number().finite().min(0).max(1000000).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, "Не более двух знаков после запятой")
const Services = z.array(z.object({
  id: Identifier,
  label: z.string().trim().min(2).max(200),
  price: Money,
  enabled: z.boolean(),
  order: z.number().int().min(0).max(999),
}).strict()).max(50).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Коды услуг должны быть уникальными")

export const CheckoutServicesSchema = z.strictObject({
  expected_revision: z.number().int().min(0),
  services: Services,
})
export type CheckoutServicesInput = z.infer<typeof CheckoutServicesSchema>

export const CheckoutSettingsSchema = z.object({
  expected_revision: z.number().int().min(0),
  country_code: z.string().regex(/^[a-z]{2}$/).optional(), default_city: z.string().trim().max(120).optional(),
  time_zone: z.string().min(1).max(100).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } }, "Неизвестный часовой пояс").optional(),
  delivery_slots: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d–(?:[01]\d|2[0-3]):[0-5]\d$/).refine((value) => value.slice(0, 5) < value.slice(-5), "Конец интервала должен быть позже начала")).min(1).max(24).optional(),
  delivery_methods: z.array(z.object({
    id: Identifier, label: z.string().trim().min(2).max(200),
    pricing: z.enum(["fixed", "range", "unconfirmed"]), price: Money.nullable(),
    min: Money.optional(), max: Money.optional(), enabled: z.boolean(), order: z.number().int().min(0).max(999),
    required_fields: z.array(z.enum(["street", "metro", "house", "building", "entrance", "apartment", "intercom", "floor", "pickup", "postal_code"])).max(10),
    allowed_cities: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    shipping_option_id: z.string().min(1).max(100).optional(),
  }).strict()).min(1).max(50),
  services: Services,
}).strict().superRefine((value, ctx) => {
  if (!value.delivery_methods.some((method) => method.enabled)) ctx.addIssue({ code: "custom", path: ["delivery_methods"], message: "Включите хотя бы один способ доставки" })
  if (new Set(value.delivery_methods.map((item) => item.id)).size !== value.delivery_methods.length) {
    ctx.addIssue({ code: "custom", path: ["delivery_methods"], message: "Коды должны быть уникальными" })
  }
  value.delivery_methods.forEach((method, index) => {
    const valid = method.pricing === "fixed" ? method.price !== null && method.min === undefined && method.max === undefined
      : method.pricing === "range" ? method.price === null && method.min !== undefined && method.max !== undefined && method.max >= method.min
      : method.price === null && method.min === undefined && method.max === undefined
    if (!valid) ctx.addIssue({ code: "custom", path: ["delivery_methods", index], message: "Укажите точную цену, полный диапазон или стоимость, требующую расчёта" })
  })
})
export type CheckoutSettingsInput = z.infer<typeof CheckoutSettingsSchema>
