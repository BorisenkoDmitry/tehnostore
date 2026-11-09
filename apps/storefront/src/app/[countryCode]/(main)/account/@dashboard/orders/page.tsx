import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listOrders } from "@lib/data/orders"
import OrderOverview from "@modules/account/components/order-overview"
export const metadata: Metadata = { title: "Мои заказы", robots: { index: false, follow: false } }
export default async function Orders() {
  const orders = await listOrders()
  if (!orders) notFound()
  return <div className="w-full" data-testid="orders-page-wrapper"><div className="mb-8 flex flex-col gap-4"><h1>Мои заказы</h1><p className="leading-relaxed text-ui-fg-subtle">История заказов вашего аккаунта. Откройте заказ, чтобы посмотреть состав и условия доставки.</p></div><OrderOverview orders={orders} /></div>
}
