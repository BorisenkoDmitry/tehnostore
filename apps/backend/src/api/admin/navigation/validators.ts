import { z } from "@medusajs/framework/zod"

// Only same-site paths and HTTPS links may become public navigation targets.
const safeHref = z.string().max(500).refine(
  (value) => /^\/(?!\/)[^\s\\]*$/.test(value) || /^https:\/\/[^\s\\]+$/.test(value),
  "Укажите путь вида /page/about-us или полную HTTPS-ссылку"
)

const CatalogNodeSchema = z.object({
  id: z.string().min(1).max(100),
  parent_id: z.string().min(1).max(100).nullable(),
  label: z.string().trim().min(1).max(100),
  href: safeHref,
  visible: z.boolean(),
})

const CatalogTreeSchema = z.array(CatalogNodeSchema).max(1000).refine((nodes) => {
  const index = new Map(nodes.map((node) => [node.id, node]))
  if (index.size !== nodes.length) return false
  return nodes.every((node) => {
    const visited = new Set([node.id])
    let parent = node.parent_id
    while (parent !== null) {
      if (visited.has(parent) || !index.has(parent) || visited.size > 8) return false
      visited.add(parent)
      parent = index.get(parent)!.parent_id
    }
    return true
  })
}, "Проверьте дерево: ID должны быть уникальны, родители существовать, циклы недопустимы")

export const NavigationItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(60),
  kind: z.enum(["link", "catalog"]),
  href: z.union([z.literal(""), safeHref]),
  visible: z.boolean(),
  children: CatalogTreeSchema.optional(),
}).refine((item) => item.kind === "catalog" || item.href !== "", {
  message: "Для ссылки нужен адрес",
  path: ["href"],
})

export const UpdateNavigationSchema = z.object({
  items: z.array(NavigationItemSchema).max(20)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Повторяются ID пунктов")
    .refine((items) => items.filter((item) => item.kind === "catalog").length <= 1, "Допустим один каталог"),
  phone: z.string().trim().regex(/^\+?[\d\s()\-]{7,30}$/, "Проверьте номер телефона"),
  telegram_url: z.string().url().refine(
    (value) => /^https:\/\/t\.me\/[A-Za-z0-9_]+\/?$/.test(value),
    "Укажите ссылку https://t.me/имя"
  ),
})

export type NavigationInput = z.infer<typeof UpdateNavigationSchema>
