import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderCard from "../order-card"
const Overview = ({ customer, orders }: { customer: HttpTypes.StoreCustomer | null; orders: HttpTypes.StoreOrder[] | null }) => <div data-testid="overview-page-wrapper">
  <h1 className="mb-6">Личный кабинет</h1>
  <p className="text-lg mb-2" data-testid="welcome-message" data-value={customer?.first_name}>{customer?.first_name ? `Здравствуйте, ${customer.first_name}` : "Здравствуйте"}</p>
  <p className="text-ui-fg-subtle break-all" data-testid="customer-email" data-value={customer?.email}>{customer?.email}</p>
  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 mb-10 text-sm"><LocalizedClientLink href="/account/profile" className="underline underline-offset-4 min-h-11 inline-flex items-center">Личные данные</LocalizedClientLink><LocalizedClientLink href="/account/addresses" className="underline underline-offset-4 min-h-11 inline-flex items-center">Адреса доставки ({customer?.addresses?.length ?? 0})</LocalizedClientLink></div>
  <section className="border-t border-gray-200 pt-8"><h2 className="text-xl mb-6">Последние заказы</h2><div className="flex flex-col gap-8" data-testid="orders-wrapper">{orders?.length ? orders.slice(0, 3).map(order => <OrderCard order={order} key={order.id} />) : <p className="text-ui-fg-subtle" data-testid="no-orders-message">Здесь появятся ваши заказы после оформления.</p>}</div></section>
</div>
export default Overview
