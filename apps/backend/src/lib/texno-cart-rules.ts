export type DeliveryMethod = {
  id: string; label: string; price: number | null; min?: number; max?: number
  pricing: "fixed" | "range" | "unconfirmed"; required_fields: string[]
  allowed_cities?: string[]
}
export type CartConfiguration = {
  currency_code?: string; country_code?: string; default_city?: string
  time_zone?: string; delivery_slots?: string[]
  delivery_methods: DeliveryMethod[]
  services: { id: string; label: string; price: number }[]
}

/** Confirmation is an explicit CMS operation with audit provenance. Inventory
 * quantity alone cannot turn an unknown supplier balance into confirmed stock. */
export function stockProvenanceKnown(variant: { metadata?: Record<string, unknown> | null; catalog_variant?: { source_data?: Record<string, unknown> | null } | null }) {
  if (variant.metadata?.catalog_stock_confirmed === true && typeof variant.metadata.catalog_stock_confirmation_id === "string") return true
  if (variant.metadata?.insales_stock_known === false) return false
  if (variant.catalog_variant) return variant.metadata?.insales_stock_known === true && Boolean(String(variant.catalog_variant.source_data?.["Остаток"] ?? "").trim())
  return variant.metadata?.insales_stock_known === true
}
export const DEFAULT_CART_CONFIGURATION: CartConfiguration = {
  time_zone: "Europe/Moscow", delivery_slots: ["10:00–14:00", "14:00–18:00", "18:00–22:00"],
  delivery_methods: [
    { id: "moscow", label: "Курьером по Москве", price: 299, pricing: "fixed", required_fields: ["street", "metro", "house"], allowed_cities: ["Москва"] },
    { id: "outside_mkad", label: "За МКАД / Московская область", price: null, min: 600, max: 1200, pricing: "range", required_fields: ["street", "house"] },
    { id: "pickup", label: "Доставка в точки самовывоза", price: 0, pricing: "fixed", required_fields: [] },
    { id: "transport", label: "Транспортной компанией по России", price: null, min: 400, max: 800, pricing: "range", required_fields: [] },
    { id: "express", label: "Экспресс-доставка за 3 часа по Москве", price: 490, pricing: "fixed", required_fields: ["street", "metro", "house"], allowed_cities: ["Москва"] },
    { id: "metro", label: "До станции метро по Москве", price: 290, pricing: "fixed", required_fields: ["metro"], allowed_cities: ["Москва"] },
    { id: "pickup_point", label: "Самовывоз из пункта выдачи", price: 0, pricing: "fixed", required_fields: [] },
    { id: "none", label: "Доставка не требуется", price: 0, pricing: "fixed", required_fields: [] },
    { id: "cdek", label: "Курьером СДЭК — стоимость уточняется", price: null, pricing: "unconfirmed", required_fields: ["street", "house"] },
  ],
  services: [
    { id: "sim", label: "Адаптация SIM под Micro / Nano SIM", price: 200 },
    { id: "activation", label: "Помощь в активации", price: 190 },
    { id: "protection", label: "Наклейка защитной плёнки / стекла", price: 290 },
    { id: "apple_id", label: "Создание и настройка Apple ID / iCloud", price: 790 },
    { id: "warranty", label: "Дополнительный год гарантийного обслуживания", price: 490 },
    { id: "application", label: "Установка и настройка одного приложения", price: 390 },
  ],
}

export function calculateQuote(configuration: CartConfiguration, itemsTotal: number, methodId?: string, services: string[] = []) {
  if (new Set(services).size !== services.length || services.some((id) => !configuration.services.some((s) => s.id === id))) throw new Error("Выберите действующие дополнительные услуги")
  const method = configuration.delivery_methods.find((m) => m.id === methodId)
  if (methodId && !method) throw new Error("Выберите действующий способ доставки")
  const servicesTotal = configuration.services.filter((s) => services.includes(s.id)).reduce((sum, s) => sum + s.price, 0)
  const base = itemsTotal + servicesTotal
  return {
    items_total: itemsTotal, services_total: servicesTotal, delivery_total: method?.price ?? null,
    total: base + (method?.price ?? 0),
    ...(method?.min !== undefined ? { min_total: base + method.min } : {}),
    ...(method?.max !== undefined ? { max_total: base + method.max } : {}),
    requires_confirmation: !method || method.pricing !== "fixed",
  }
}

export function validateCheckout(data: Record<string, any>, configuration: CartConfiguration, now = new Date()) {
  const method = configuration.delivery_methods.find((m) => m.id === data.delivery_method)
  if (!method) throw new Error("Выберите способ доставки")
  if (typeof data.name !== "string" || data.name.trim().length < 2) throw new Error("Укажите имя")
  const rawPhone = String(data.phone ?? "").trim()
  let phone = rawPhone.replace(/\D/g, "")
  if (!rawPhone.startsWith("+") && phone.length === 10) phone = `7${phone}`
  if (!rawPhone.startsWith("+") && phone.length === 11 && phone.startsWith("8")) phone = `7${phone.slice(1)}`
  if (phone.length < 10 || phone.length > 15 || phone.startsWith("0")) throw new Error("Проверьте номер телефона")
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error("Проверьте email")
  if (!data.city?.trim()) throw new Error("Укажите город")
  if (method.allowed_cities?.length && !method.allowed_cities.some((city) => city.toLocaleLowerCase("ru") === data.city.trim().toLocaleLowerCase("ru"))) throw new Error(`Этот способ доставки доступен в городах: ${method.allowed_cities.join(", ")}`)
  for (const field of method.required_fields) if (!(data.saved_address_verified && ["street", "house"].includes(field)) && !data.address?.[field]?.trim()) throw new Error(`Заполните обязательное поле адреса: ${field}`)
  if (data.consent !== true) throw new Error("Необходимо согласие на обработку персональных данных")
  if (!["cash", "card_on_receipt"].includes(data.payment_preference)) throw new Error("Выберите предпочтительный способ оплаты")
  const day = String(data.delivery_date ?? "")
  const currentDay = new Intl.DateTimeFormat("sv-SE", { timeZone: configuration.time_zone || "UTC" }).format(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day || day < currentDay || day > new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10)) throw new Error("Выберите дату доставки в пределах 90 дней")
  if (!(configuration.delivery_slots ?? []).includes(data.delivery_slot)) throw new Error("Выберите действующий интервал доставки")
  const slotEnd = Number(data.delivery_slot.slice(-5, -3))
  const currentHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: configuration.time_zone || "UTC", hour: "2-digit", hourCycle: "h23" }).format(now))
  if (day === currentDay && slotEnd <= currentHour) throw new Error("Выбранный интервал уже завершён")
  return { ...data, name: data.name.trim(), phone: `+${phone}`, email: data.email?.trim() || undefined, city: data.city.trim() }
}
