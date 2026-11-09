import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { addedDate, SortHeader, TablePagination, useTableSort } from "../../components/admin-table"

type Customer = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; has_account: boolean; created_at: string }
type Order = { id: string; display_id: number; created_at: string; status: string; confirmed?: boolean; currency_code: string; total: number; customer_id: string | null; email: string | null; customer?: Customer | null; shipping_address?: { first_name?: string; last_name?: string; phone?: string }; items: { id: string; title: string; variant_title: string; quantity: number; product_id: string | null; variant_id: string | null }[] }
const person = (customer?: Partial<Customer> | null) => [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Без имени"
const statuses: Record<string, string> = { pending: "Ожидает обработки", completed: "Завершён", canceled: "Отменён", requires_action: "Требует действия", archived: "В архиве", draft: "Черновик" }
const useDebounced = (value: string) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 300); return () => clearTimeout(timer) }, [value])
  return debounced
}
const CustomerType = ({ value, onChange, id }: { value: string; onChange: (value: string) => void; id: string }) => <div><Label htmlFor={id}>Тип покупателя</Label><Select value={value} onValueChange={onChange}><Select.Trigger id={id}><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все покупатели</Select.Item><Select.Item value="registered">Зарегистрированные</Select.Item><Select.Item value="guest">Гости</Select.Item></Select.Content></Select></div>

const CustomersView = ({ openOrders }: { openOrders: (id: string) => void }) => {
  const [search, setSearch] = useState("")
  const q = useDebounced(search)
  const [type, setType] = useState("registered")
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  useEffect(() => setOffset(0), [q, type])
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["customer-directory", q, type, offset, sort.order], queryFn: ({ signal }) => sdk.client.fetch<{ customers: Customer[]; count: number }>("/admin/customer-orders/customers", { query: { q, customer_type: type, offset, limit: 20, order: sort.order }, signal }) })
  return <><div className="my-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="customer-directory-search">Поиск покупателей</Label><Input id="customer-directory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, email или телефон" maxLength={200} /></div><CustomerType id="customer-directory-type" value={type} onChange={setType} /></div>
    {isLoading ? <Text role="status">Загрузка покупателей…</Text> : error ? <div><Text role="alert">Не удалось загрузить покупателей.</Text><Button variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : <Table><Table.Header><Table.Row><SortHeader sort={sort} field="first_name" label="Покупатель" /><SortHeader sort={sort} field="email" label="Контакты" /><SortHeader sort={sort} field="has_account" label="Тип" /><SortHeader sort={sort} field="created_at" label="Создан" descendingFirst /><Table.HeaderCell>Действия</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data?.customers.map((customer) => <Table.Row key={customer.id}><Table.Cell>{person(customer)}</Table.Cell><Table.Cell><Text size="small">{customer.email || "Email не указан"}</Text><Text size="small" className="text-ui-fg-subtle">{customer.phone || "—"}</Text></Table.Cell><Table.Cell><Badge color={customer.has_account ? "green" : "grey"}>{customer.has_account ? "Зарегистрирован" : "Гость"}</Badge></Table.Cell><Table.Cell>{new Date(customer.created_at).toLocaleDateString("ru-RU")}</Table.Cell><Table.Cell><div className="flex gap-2"><Button size="small" variant="secondary" onClick={() => openOrders(customer.id)}>Заказы покупателя</Button><Button asChild size="small" variant="transparent"><Link to={`/customers/${customer.id}`}>Карточка</Link></Button></div></Table.Cell></Table.Row>)}</Table.Body></Table>}
    {!isLoading && !data?.count && <Text className="py-6">Покупателей по заданным условиям нет.</Text>}{data && <TablePagination count={data.count} size={20} offset={offset} setOffset={setOffset} />}
  </>
}

const CustomerPicker = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [search, setSearch] = useState("")
  const q = useDebounced(search)
  const { data } = useQuery({ queryKey: ["order-customer-picker", q], queryFn: () => sdk.client.fetch<{ customers: Customer[] }>("/admin/customer-orders/customers", { query: { q, limit: 20, customer_type: "all" } }) })
  const { data: selected } = useQuery({ queryKey: ["order-customer-selected", value], queryFn: () => sdk.admin.customer.retrieve(value, { fields: "id,first_name,last_name,email,has_account" }), enabled: !!value })
  const items = [...(data?.customers ?? [])]
  if (selected?.customer && !items.some((item) => item.id === value)) items.unshift(selected.customer as Customer)
  return <div className="flex flex-col gap-2"><Label htmlFor="order-customer-picker">Покупатель</Label><Input aria-label="Найти покупателя" placeholder="Найти по имени, email, телефону" value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={value || "all"} onValueChange={(item) => onChange(item === "all" ? "" : item)}><Select.Trigger id="order-customer-picker"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все покупатели</Select.Item>{items.map((item) => <Select.Item key={item.id} value={item.id}>{person(item)} · {item.email || item.phone || "без email"} · {item.has_account ? "Аккаунт" : "Гость"}</Select.Item>)}</Select.Content></Select></div>
}

const ProductPicker = ({ product, variant, onChange }: { product: string; variant: string; onChange: (product: string, variant: string) => void }) => {
  const [search, setSearch] = useState("")
  const q = useDebounced(search)
  const { data } = useQuery({ queryKey: ["order-product-picker", q], queryFn: () => sdk.admin.product.list({ q, limit: 50, fields: "id,title" }) })
  const { data: selected } = useQuery({ queryKey: ["order-product-selected", product], queryFn: () => sdk.admin.product.retrieve(product, { fields: "id,title" }), enabled: !!product })
  const { data: variants } = useQuery({ queryKey: ["order-variant-picker", product], queryFn: () => sdk.admin.product.listVariants(product, { limit: 100, fields: "id,title,sku" }), enabled: !!product })
  const products = [...(data?.products ?? [])]
  if (selected?.product && !products.some((item) => item.id === product)) products.unshift(selected.product)
  return <><div className="flex flex-col gap-2"><Label htmlFor="order-product-picker">Товар в заказе</Label><Input aria-label="Найти товар" placeholder="Поиск по названию" value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={product || "all"} onValueChange={(value) => onChange(value === "all" ? "" : value, "")}><Select.Trigger id="order-product-picker"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все товары</Select.Item>{products.map((item) => <Select.Item key={item.id} value={item.id}>{item.title}</Select.Item>)}</Select.Content></Select></div>
    <div className="flex flex-col gap-2"><Label htmlFor="order-variant-picker">Вариант товара</Label><Select value={variant || "all"} onValueChange={(value) => onChange(product, value === "all" ? "" : value)} disabled={!product}><Select.Trigger id="order-variant-picker"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все варианты</Select.Item>{variants?.variants.map((item) => <Select.Item key={item.id} value={item.id}>{item.title}{item.sku ? ` · ${item.sku}` : ""}</Select.Item>)}</Select.Content></Select></div></>
}

const OrdersView = ({ customerId, setCustomerId }: { customerId: string; setCustomerId: (value: string) => void }) => {
  const [search, setSearch] = useState("")
  const q = useDebounced(search)
  const [type, setType] = useState("all")
  const [status, setStatus] = useState("all")
  const [product, setProduct] = useState("")
  const [variant, setVariant] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [offset, setOffset] = useState(0)
  const sort = useTableSort("-created_at", () => setOffset(0))
  useEffect(() => setOffset(0), [q, type, status, product, variant, from, to, customerId])
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["customer-directory-orders", q, type, status, product, variant, from, to, customerId, offset, sort.order], queryFn: ({ signal }) => sdk.client.fetch<{ orders: Order[]; count: number }>("/admin/customer-orders/orders", { query: { limit: 20, offset, order: sort.order, q, customer_type: type, ...(customerId ? { customer_id: customerId } : {}), ...(product ? { product_id: product } : {}), ...(variant ? { variant_id: variant } : {}), ...(status !== "all" ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }, signal }) })
  return <><div className="my-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div><Label htmlFor="order-directory-search">Поиск заказов</Label><Input id="order-directory-search" placeholder="Номер, имя, телефон или email" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} /></div><CustomerType id="order-directory-type" value={type} onChange={setType} /><div><Label htmlFor="order-directory-status">Статус заказа</Label><Select value={status} onValueChange={setStatus}><Select.Trigger id="order-directory-status"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">Все статусы</Select.Item>{Object.entries(statuses).filter(([key]) => key !== "draft").map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}</Select.Content></Select></div>
    <CustomerPicker value={customerId} onChange={setCustomerId} /><ProductPicker product={product} variant={variant} onChange={(product, variant) => { setProduct(product); setVariant(variant) }} /><div><Label htmlFor="order-directory-from">С даты (Москва)</Label><Input id="order-directory-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><Label htmlFor="order-directory-to">По дату включительно (Москва)</Label><Input id="order-directory-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><div className="flex items-end"><Button variant="secondary" size="small" onClick={() => { setSearch(""); setType("all"); setStatus("all"); setProduct(""); setVariant(""); setFrom(""); setTo(""); setCustomerId(""); setOffset(0) }}>Сбросить фильтры</Button></div></div>
    {isLoading ? <Text role="status">Загрузка заказов…</Text> : error ? <div><Text role="alert">Не удалось загрузить заказы. Проверьте диапазон дат и повторите запрос.</Text><Button variant="secondary" onClick={() => refetch()}>Повторить</Button></div> : <Table><Table.Header><Table.Row><SortHeader sort={sort} field="display_id" label="Заказ" /><SortHeader sort={sort} field="created_at" label="Дата добавления" descendingFirst /><Table.HeaderCell>Покупатель и контакты</Table.HeaderCell><Table.HeaderCell>Товары</Table.HeaderCell><SortHeader sort={sort} field="status" label="Статус" /><Table.HeaderCell>Сумма</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data?.orders.map((order) => <Table.Row key={order.id}><Table.Cell><Link className="text-ui-fg-interactive" to={`/orders/${order.id}`}>#{order.display_id}</Link></Table.Cell><Table.Cell className="whitespace-nowrap">{addedDate(order.created_at)}</Table.Cell><Table.Cell><Text size="small">{order.shipping_address ? [order.shipping_address.first_name, order.shipping_address.last_name].filter(Boolean).join(" ") || person(order.customer) : person(order.customer)}</Text><Text size="small" className="text-ui-fg-subtle">{order.email || "Email не указан"} · {order.shipping_address?.phone || "—"}</Text><Badge color={order.customer?.has_account ? "green" : "grey"}>{order.customer?.has_account ? "Зарегистрирован" : "Гость"}</Badge></Table.Cell><Table.Cell><div className="max-w-md">{order.items.map((item) => <Text key={item.id} size="small">{item.title}{item.variant_title ? ` · ${item.variant_title}` : ""} × {Number(item.quantity)}</Text>)}</div></Table.Cell><Table.Cell>{order.status === "pending" && order.confirmed ? "Подтверждён" : statuses[order.status] || order.status}</Table.Cell><Table.Cell>{Number.isFinite(Number(order.total)) ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: order.currency_code.toUpperCase() }).format(Number(order.total)) : "—"}</Table.Cell></Table.Row>)}</Table.Body></Table>}
    {!isLoading && !data?.count && <Text className="py-6">Заказов по заданным условиям нет.</Text>}{data && <TablePagination count={data.count} size={20} offset={offset} setOffset={setOffset} />}
  </>
}

const CustomerOrders = () => {
  const [params, setParams] = useSearchParams()
  const view = params.get("view") === "orders" ? "orders" : "customers"
  const customerId = params.get("customer_id") || ""
  return <Container><div className="flex flex-wrap items-start justify-between gap-3"><div><Heading level="h1">Покупатели и заказы</Heading><Text size="small" className="text-ui-fg-subtle">Реальные записи Medusa. Гости отличаются от зарегистрированных покупателей по наличию аккаунта.</Text></div><Button asChild size="small" variant="secondary"><Link to={view === "orders" ? "/orders" : "/customers"}>Открыть основной раздел</Link></Button></div><div className="mt-5 flex gap-2"><Button size="small" variant={view === "customers" ? "primary" : "secondary"} onClick={() => setParams({ view: "customers" })}>Покупатели</Button><Button size="small" variant={view === "orders" ? "primary" : "secondary"} onClick={() => setParams({ view: "orders" })}>Заказы</Button></div>{view === "customers" ? <CustomersView openOrders={(id) => setParams({ view: "orders", customer_id: id })} /> : <OrdersView customerId={customerId} setCustomerId={(id) => setParams({ view: "orders", ...(id ? { customer_id: id } : {}) })} />}</Container>
}
export const config = defineRouteConfig({ label: "Покупатели и заказы", icon: Users })
export default CustomerOrders
