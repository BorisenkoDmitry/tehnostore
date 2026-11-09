import type { HttpTypes } from "@medusajs/types"

export type DeliveryMethod = {
  id: string
  label: string
  price: number | null
  min?: number
  max?: number
  pricing: "fixed" | "range" | "unconfirmed"
  required_fields: string[]
}
export type CartConfiguration = {
  currency_code?: string; country_code?: string; default_city?: string
  time_zone?: string; delivery_slots?: string[]
  delivery_methods: DeliveryMethod[]
  services: { id: string; label: string; price: number }[]
}
export type CartQuote = {
  items_total: number
  services_total: number
  delivery_total: number | null
  total: number
  min_total?: number
  max_total?: number
  requires_confirmation: boolean
  line_availability?: { variant_id: string; available_quantity: number; purchasable: boolean; reason?: string }[]
}
export type CheckoutInput = {
  saved_address_id?: string
  name: string
  phone: string
  email?: string
  city: string
  delivery_method: string
  address: Record<string, string>
  delivery_date: string
  delivery_slot: string
  payment_preference: "cash" | "card_on_receipt"
  services: string[]
  comment?: string
  consent: boolean
  expected_total: number
}
export type CheckoutCustomer = {
  id: string; first_name: string | null; last_name: string | null; email: string; phone: string | null
  addresses: { id: string; address_1: string | null; address_2: string | null; city: string | null; postal_code: string | null; country_code: string | null; is_default_shipping?: boolean }[]
}
export type OrderConfirmation = {
  id: string
  display_id: number
  total: number
  currency_code: string
  payment_status?: string
}
export type TexnoCartState = {
  merge_pending?: { message: string; carts: { id: string }[] }
  cart: HttpTypes.StoreCart
  configuration: CartConfiguration
  quote?: CartQuote
  order?: OrderConfirmation
  selected?: { delivery_method?: string; services?: string[] }
}
