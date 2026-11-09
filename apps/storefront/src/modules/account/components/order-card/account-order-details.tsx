import type { HttpTypes } from "@medusajs/types"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import type { CartQuote } from "@lib/data/texno-cart-types"

type Snapshot = {
  contact_name: string
  phone: string
  email?: string
  city: string
  address: Record<string, string>
  delivery_method: string
  delivery_pricing: string
  delivery_date: string
  delivery_slot: string
  payment_preference: string
  confirmed_at?: string | null
  services?: { id: string; label: string; price: number }[]
  comment?: string
  quote: CartQuote
}

const addressLabels: Record<string, string> = {
  street: "Улица", house: "Дом", building: "Корпус / строение", apartment: "Квартира / офис",
  entrance: "Подъезд", intercom: "Домофон", floor: "Этаж", metro: "Метро", address_1: "Адрес",
  address_2: "Дополнительно", postal_code: "Индекс",
}

const AccountOrderDetails = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const details = order.metadata?.texno_order as Snapshot | undefined
  const quote = details?.quote
  const preliminary = Boolean(details && details.delivery_pricing !== "fixed")
  const base = Number(quote?.items_total ?? 0) + Number(quote?.services_total ?? 0)
  const money = (amount: number) => convertToLocale({ amount, currency_code: order.currency_code, locale: "ru-RU" })
  const status = order.status === "canceled" ? "Отменён" : order.status === "completed" ? "Завершён" : details?.confirmed_at ? "Подтверждён" : "Ожидает подтверждения"
  const payment = order.payment_status === "captured" ? "Оплачен" : order.payment_status === "refunded" ? "Оплата возвращена" : "Не оплачен"
  const deliveryPrice = details?.delivery_pricing === "fixed"
    ? money(Number(quote?.delivery_total ?? 0))
    : details?.delivery_pricing === "range" && quote?.min_total !== undefined && quote.max_total !== undefined
      ? money(quote.min_total - base) + "–" + money(quote.max_total - base) + ", согласуется отдельно"
      : "Будет рассчитана и согласована отдельно"
  const shipping = order.shipping_address
  const email = details?.email || order.email

  return <div className="w-full" data-testid="account-order-details">
    <LocalizedClientLink href="/account/orders" className="inline-flex min-h-11 items-center underline underline-offset-4 text-sm mb-5">Все заказы</LocalizedClientLink>
    <h1 className="mb-5">Заказ № {order.display_id}</h1>
    <p className="text-ui-fg-subtle mb-2">{new Date(order.created_at).toLocaleDateString("ru-RU")} · {status}</p>
    <p className="mb-8">{payment}</p>
    <section aria-label="Товары в заказе" className="border-y border-gray-200 divide-y divide-gray-200">
      {order.items?.map(item => <div key={item.id} className="py-5 flex items-start gap-3 sm:gap-5">
        <Thumbnail thumbnail={item.thumbnail || item.product?.thumbnail} size="square" className="!w-16 sm:!w-20 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-wrap justify-between items-start gap-x-5 gap-y-2">
          <div className="min-w-0">
            <p className="break-words">{item.title}</p>
            {item.variant_title && !/^default( variant)?$/i.test(item.variant_title) && <p className="text-sm text-ui-fg-subtle mt-1">{item.variant_title}</p>}
            <p className="text-sm text-ui-fg-subtle mt-2">{item.quantity} шт. × {money(item.unit_price)}</p>
          </div>
          <p className="shrink-0">{money(Number(item.total ?? item.unit_price * item.quantity))}</p>
        </div>
      </div>)}
    </section>
    {!!details?.services?.length && <section className="border-b border-gray-200 py-5">
      <h2 className="text-xl mb-3">Дополнительные услуги</h2>
      <dl className="grid gap-2">{details.services.map(service => <div key={service.id} className="flex justify-between gap-4"><dt>{service.label}</dt><dd className="shrink-0">{money(service.price)}</dd></div>)}</dl>
    </section>}
    <div className="flex flex-wrap justify-between gap-4 py-6 text-xl"><span>{preliminary ? "Предварительный итог" : "Итого"}</span><strong>{money(order.total)}</strong></div>
    {details ? <section className="border-t border-gray-200 pt-7 flex flex-col gap-5">
      <h2 className="text-xl">Получение заказа</h2>
      <div><p>{details.delivery_method}</p><p>{details.city}</p></div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <div><dt className="text-sm text-ui-fg-subtle mb-1">Получатель</dt><dd className="break-words">{details.contact_name}<br />{details.phone}{email && <><br />{email}</>}</dd></div>
        <div><dt className="text-sm text-ui-fg-subtle mb-1">Дата и время, указанные при оформлении</dt><dd>{details.delivery_date || "Уточнить"}{details.delivery_slot && ", " + details.delivery_slot}</dd></div>
        {Object.entries(details.address ?? {}).filter(([key, value]) => addressLabels[key] && value).map(([key, value]) => <div key={key}><dt className="text-sm text-ui-fg-subtle mb-1">{addressLabels[key]}</dt><dd className="break-words">{value}</dd></div>)}
        <div><dt className="text-sm text-ui-fg-subtle mb-1">Стоимость доставки</dt><dd>{deliveryPrice}</dd></div>
        <div><dt className="text-sm text-ui-fg-subtle mb-1">Способ оплаты при получении</dt><dd>{details.payment_preference === "cash" ? "Наличными после проверки" : "Картой при получении, возможность уточняется"}</dd></div>
      </dl>
      {preliminary && <p className="text-sm text-ui-fg-subtle">Стоимость доставки не входила в предварительный итог при оформлении заказа.{!details.confirmed_at && order.status === "pending" && " Менеджер согласует её перед выполнением заказа."}</p>}
      {details.comment && <div><h3 className="text-sm text-ui-fg-subtle mb-1">Комментарий к заказу</h3><p className="whitespace-pre-wrap break-words">{details.comment}</p></div>}
    </section> : shipping && <section className="border-t border-gray-200 pt-7">
      <h2 className="text-xl mb-4">Получение заказа</h2>
      <p>{[shipping.first_name, shipping.last_name].filter(Boolean).join(" ")}</p>
      <p>{[shipping.postal_code, shipping.city, shipping.address_1, shipping.address_2].filter(Boolean).join(", ")}</p>
      {shipping.phone && <p>{shipping.phone}</p>}
      {email && <p className="break-words">{email}</p>}
    </section>}
  </div>
}

export default AccountOrderDetails
