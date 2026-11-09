import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Container, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"
import { Link } from "react-router-dom"

const TexnoOrderCheckout = ({ data }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const orderQuery = useQuery({
    queryKey: ["texno-order-checkout", data.id],
    queryFn: () => sdk.admin.order.retrieve(data.id, { fields: "id,email,currency_code,metadata,*customer" }),
  })
  const order = orderQuery.data?.order
  const details = order?.metadata?.texno_order as Record<string, any> | undefined
  if (orderQuery.isLoading) return <Container className="px-6 py-4"><Text>Загрузка данных оформления…</Text></Container>
  if (orderQuery.isError) return <Container className="px-6 py-4"><Text className="text-ui-fg-error">Не удалось загрузить данные оформления</Text></Container>
  if (!order || !details) return null
  const customer = order.customer as HttpTypes.AdminCustomer | undefined
  const money = (amount: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: order?.currency_code || data.currency_code, maximumFractionDigits: 2 }).format(amount)
  const rows = [
    ["Контакт при оформлении", [details.contact_name, details.phone, order?.email].filter(Boolean).join(" · ")],
    ["Доставка", `${details.delivery_method} · ${details.city}`],
    ["Дата и интервал (предпочтение)", `${details.delivery_date}, ${details.delivery_slot}`],
    ["Адрес, дополнительные сведения", Object.entries(details.address ?? {}).filter(([, value]) => value).map(([key, value]) => `${({ street: "Улица", house: "Дом", building: "Корп./стр.", metro: "Метро", entrance: "Подъезд", apartment: "Кв./офис", intercom: "Домофон", floor: "Этаж" } as Record<string, string>)[key] ?? key}: ${value}`).join("; ") || "Подтвердить место получения с покупателем"],
    ["Предпочтение по оплате", details.payment_preference === "cash" ? "Наличными при получении и проверке" : "Картой при получении — возможность уточнить"],
    ["Услуги", (details.services ?? []).map((s: { label: string; price: number }) => `${s.label} — ${money(s.price)}`).join("; ") || "Не выбраны"],
    ["Стоимость доставки", details.delivery_pricing === "fixed" ? money(details.quote?.delivery_total ?? 0) : details.delivery_pricing === "range" ? `${money(Number(details.quote?.min_total) - Number(details.quote?.items_total) - Number(details.quote?.services_total))}–${money(Number(details.quote?.max_total) - Number(details.quote?.items_total) - Number(details.quote?.services_total))}, уточнить и согласовать` : "Не рассчитана; согласовать с покупателем"],
    ["Комментарий", details.comment || "Нет"],
    ["Согласие", details.consent ? `Получено ${details.consent_at}` : "Не получено"],
  ]
  return <Container className="px-6 py-4">
    <Text size="small" weight="plus">Оформление заказа</Text>
    <Text size="small" className="text-ui-fg-subtle mt-2">{customer?.has_account ? <Link className="underline" to={`/customers/${customer.id}`}>Зарегистрированный покупатель</Link> : "Гостевой заказ"}. Контакты ниже сохранены при оформлении.</Text>
    {details.delivery_pricing !== "fixed" && <Text size="small" className="text-ui-fg-warning mt-2">Итог заказа предварительный: стоимость перевозки не включена. Ноль в доставке Medusa означает ожидающий расчёт.</Text>}
    <div className="mt-4 flex flex-col gap-3">{rows.map(([label, value]) => <div key={label}><Text size="small" weight="plus">{label}</Text><Text size="small" className="text-ui-fg-subtle break-words">{value}</Text></div>)}</div>
  </Container>
}
export const config = defineWidgetConfig({ zone: "order.details" })
export default TexnoOrderCheckout
