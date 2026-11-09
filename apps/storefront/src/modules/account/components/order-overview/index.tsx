"use client"
import { HttpTypes } from "@medusajs/types"
import OrderCard from "../order-card"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
const OrderOverview = ({ orders }: { orders: HttpTypes.StoreOrder[] }) => orders?.length ? <div className="flex flex-col gap-8">{orders.map(order => <div key={order.id} className="border-b border-gray-200 pb-8 last:border-0"><OrderCard order={order} /></div>)}</div> : <div data-testid="no-orders-container" className="py-8"><h2 className="text-xl mb-3">Заказов пока нет</h2><p className="text-ui-fg-subtle mb-5">После оформления заказ появится в этом разделе.</p><LocalizedClientLink href="/store" className="inline-flex items-center min-h-11 underline underline-offset-4" data-testid="continue-shopping-button">Перейти в каталог</LocalizedClientLink></div>
export default OrderOverview
