import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  ordersQueryKeys,
  useCapturePermissions,
  useFulfillmentPermissions,
  useOrderPermissions,
  useOrderPreview,
  usePaymentCollectionPermissions,
  usePaymentPermissions,
  useRefundPermissions,
  useReturnPermissions,
} from "@medusajs/dashboard/hooks"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { ArrowUturnLeft, ChevronDown, CreditCard, Receipt, TruckFast } from "@medusajs/icons"
import { Badge, Button, Container, DropdownMenu, Heading, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ComponentProps, ReactNode } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../lib/sdk"

type Order = HttpTypes.AdminOrder
type Fulfillment = NonNullable<Order["fulfillments"]>[number] & {
  shipping_option?: { service_zone?: { fulfillment_set?: { type: string } } }
}
type Status = [label: string, color: NonNullable<ComponentProps<typeof Badge>["color"]>]
type Action = { label: string; to: string } | {
  key?: string
  label: string
  run: () => Promise<unknown>
  success: string
  description?: string
  destructive?: boolean
}

const orderStatuses: Record<string, Status> = {
  pending: ["В обработке", "blue"],
  completed: ["Завершён", "green"],
  canceled: ["Отменён", "red"],
  draft: ["Черновик", "grey"],
  archived: ["В архиве", "grey"],
  requires_action: ["Требует действия", "orange"],
}

const deliveryStatuses: Record<string, Status> = {
  not_fulfilled: ["Не собрано", "grey"],
  partially_fulfilled: ["Частично собрано", "orange"],
  fulfilled: ["Готово к отправке", "blue"],
  partially_shipped: ["Частично отправлено", "orange"],
  shipped: ["Отправлено", "blue"],
  partially_delivered: ["Частично доставлено", "orange"],
  delivered: ["Доставлено", "green"],
  partially_returned: ["Частично возвращено", "orange"],
  returned: ["Возвращено", "green"],
  canceled: ["Отменено", "red"],
  requires_action: ["Требует действия", "orange"],
}

const paymentStatuses: Record<string, Status> = {
  not_paid: ["Ожидает оплаты", "orange"],
  awaiting: ["Ожидает оплаты", "orange"],
  authorized: ["Ожидает оплаты", "orange"],
  partially_authorized: ["Частично авторизовано", "orange"],
  partially_captured: ["Частично оплачено", "orange"],
  captured: ["Оплачено", "green"],
  partially_refunded: ["Частичный возврат денег", "orange"],
  refunded: ["Деньги возвращены", "grey"],
  canceled: ["Отменена", "red"],
  requires_action: ["Требует действия", "orange"],
}

const returnStatuses: Record<string, Status> = {
  open: ["Оформляется", "blue"],
  requested: ["Ожидает приёмки", "orange"],
  partially_received: ["Частично принят", "orange"],
  received: ["Принят", "green"],
  canceled: ["Отменён", "grey"],
}

const unknownStatus: Status = ["Не определён", "grey"]

function shipmentStatus(fulfillment: Fulfillment, pickup: boolean): Status {
  if (fulfillment.canceled_at) return deliveryStatuses.canceled
  if (fulfillment.delivered_at) return pickup ? ["Выдано", "green"] : deliveryStatuses.delivered
  if (fulfillment.shipped_at) return deliveryStatuses.shipped
  if (pickup) return ["Готово к выдаче", "blue"]
  return fulfillment.requires_shipping ? deliveryStatuses.fulfilled : ["Ожидает вручения", "blue"]
}

function StatusRow({ icon, label, status, children, detail }: {
  icon?: ReactNode
  label: string
  status: Status
  children?: ReactNode
  detail?: string
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 [@container(min-width:36rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_12rem] ${icon ? "" : "bg-ui-bg-subtle"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-5 shrink-0 text-ui-fg-subtle" aria-hidden="true">{icon}</div>
        <Text size="small" weight={icon ? "plus" : "regular"}>{label}</Text>
      </div>
      <div className="min-w-0 group-data-[status-only=true]/order-status:col-start-2 group-data-[status-only=true]/order-status:col-end-[-1] group-data-[status-only=true]/order-status:justify-self-end">
        <Badge color={status[1]} className="max-w-full whitespace-normal">{status[0]}</Badge>
      </div>
      {(children || detail) && <div className="col-span-2 flex w-full max-w-48 flex-col gap-1.5 [@container(min-width:36rem)]:col-span-1">
        {children}
        {detail && <Text size="xsmall" className="text-ui-fg-subtle [@container(min-width:36rem)]:text-center">{detail}</Text>}
      </div>}
    </div>
  )
}

async function listReturns(orderId: string) {
  const returns: HttpTypes.AdminReturn[] = []
  while (true) {
    const page = await sdk.admin.return.list({
      order_id: orderId, offset: returns.length, limit: 50, order: "-created_at",
      fields: "id,display_id,status,canceled_at,exchange_id,claim_id",
    })
    returns.push(...page.returns)
    if (!page.returns.length || returns.length >= page.count) return returns
  }
}

const TexnoOrderStatusActions = ({ data: order }: DetailWidgetProps<Order>) => {
  const client = useQueryClient()
  const prompt = usePrompt()
  const orderPermissions = useOrderPermissions()
  const fulfillmentPermissions = useFulfillmentPermissions()
  const returnPermissions = useReturnPermissions()
  const paymentPermissions = usePaymentPermissions()
  const capturePermissions = useCapturePermissions()
  const refundPermissions = useRefundPermissions()
  const paymentCollectionPermissions = usePaymentCollectionPermissions()
  const { order: preview } = useOrderPreview(order.id)
  const returns = useQuery({
    queryKey: ["returns", "list", "texno-order-status", order.id],
    queryFn: () => listReturns(order.id),
    enabled: returnPermissions.canRead,
  })

  const mutation = useMutation({
    mutationFn: async (action: Extract<Action, { run: () => Promise<unknown> }>) => action.run(),
    onSuccess: async (_, action) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersQueryKeys.all }),
        client.invalidateQueries({ queryKey: ordersQueryKeys.preview(order.id) }),
        client.invalidateQueries({ queryKey: ordersQueryKeys.changes(order.id) }),
        client.invalidateQueries({ queryKey: ["customer-directory-orders"] }),
        client.invalidateQueries({ queryKey: ["returns"] }),
        client.invalidateQueries({ queryKey: ["payment-collection"] }),
        client.invalidateQueries({ queryKey: ["reservation_items"] }),
        client.invalidateQueries({ queryKey: ["inventory_items"] }),
      ])
      toast.success(action.success)
    },
    onError: (error) => toast.error("Действие не выполнено", { description: error.message }),
  })

  async function run(action: Extract<Action, { run: () => Promise<unknown> }>) {
    if (action.description && !await prompt({
      title: action.label,
      description: action.description,
      confirmText: "Подтвердить",
      cancelText: "Назад",
    })) return
    mutation.mutate(action)
  }

  function actionButton(action: Action) {
    if ("to" in action) return <Button size="small" variant="secondary" asChild><Link to={action.to}>{action.label}</Link></Button>
    return <Button size="small" variant="secondary" disabled={mutation.isPending} onClick={() => void run(action)}>{action.label}</Button>
  }

  function actionMenu(actions: Action[], label: string) {
    return <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button size="small" variant="secondary" className="justify-between" disabled={!actions.length || mutation.isPending}>
          {label}<ChevronDown />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {actions.map((action) => "to" in action
          ? <DropdownMenu.Item key={action.to} asChild><Link to={action.to}>{action.label}</Link></DropdownMenu.Item>
          : <DropdownMenu.Item key={action.key ?? action.label} className={action.destructive ? "text-ui-fg-error" : undefined} onSelect={() => void run(action)}>{action.label}</DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu>
  }

  const base = `/orders/${order.id}`
  const isTexno = Boolean(order.metadata?.texno_order)
  const confirmed = Boolean(order.metadata?.texno_order_confirmed_at)
  const canUpdate = orderPermissions.canUpdate
  const isCanceled = order.status === "canceled"
  const active = !isCanceled && order.status !== "archived"
  const items = order.items ?? []
  const paid = Number(order.total) === 0 || order.payment_status === "captured"
  const delivered = items.every((item) => !item.requires_shipping ||
    Number(item.detail?.delivered_quantity ?? 0) >= Number(item.quantity))
  const canChangeTexnoOrder = isTexno && canUpdate && order.status === "pending"
  const fulfillments = (order.fulfillments ?? []) as Fulfillment[]
  const collections = order.payment_collections ?? []
  const status: Status = isTexno && order.status === "pending"
    ? confirmed ? ["Подтверждён", "blue"] : ["Ожидает подтверждения", "orange"]
    : orderStatuses[order.status] ?? unknownStatus

  function changeStatus(action: "confirm" | "complete") {
    return sdk.client.fetch(`/admin/customer-orders/orders/${order.id}/status`, { method: "POST", body: { action } })
  }

  const prepareActions: Action[] = []
  if (active && canUpdate && fulfillmentPermissions.canCreate) {
    for (const requiresShipping of [true, false]) {
      if (items.some((item) => item.requires_shipping === requiresShipping &&
        Number(item.quantity) > Number(item.detail?.fulfilled_quantity ?? 0))) {
        prepareActions.push({
          label: requiresShipping ? "Собрать товары" : "Подготовить позиции без доставки",
          to: `${base}/fulfillment?requires_shipping=${requiresShipping}`,
        })
      }
    }
  }

  function fulfillmentActions(fulfillment: Fulfillment, pickup: boolean): Action[] {
    if (!active || !canUpdate || !fulfillmentPermissions.canUpdate || fulfillment.canceled_at || fulfillment.delivered_at) return []
    const actions: Action[] = []
    if (!fulfillment.shipped_at && fulfillment.requires_shipping && !pickup) {
      actions.push({ label: "Отметить отправку", to: `${base}/${fulfillment.id}/create-shipment` })
    }
    actions.push({
      label: pickup ? "Отметить выдачу" : "Отметить вручение",
      description: "Подтвердите, что покупатель получил все товары из этого отправления.",
      run: () => sdk.admin.order.markAsDelivered(order.id, fulfillment.id),
      success: pickup ? "Отправление выдано" : "Отправление доставлено",
    })
    if (!fulfillment.shipped_at) actions.push({
      label: "Отменить отправление",
      description: "Отправление будет отменено. Товары можно будет собрать заново.",
      run: () => sdk.admin.order.cancelFulfillment(order.id, fulfillment.id, {}),
      success: "Отправление отменено",
      destructive: true,
    })
    return actions
  }

  const formatAmount = (amount: number) => new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: order.currency_code,
  }).format(amount)
  const paymentActions: Action[] = []
  if (canUpdate && paymentPermissions.canRead) {
    const payments = collections.flatMap((collection) => collection.payments ?? [])
    for (const [index, payment] of payments.entries()) {
      const number = payments.length > 1 ? ` №${index + 1}` : ""
      if (active && capturePermissions.canCreate && !payment.canceled_at && !payment.captured_at) {
        paymentActions.push({
          key: payment.id,
          label: `Получить платёж${number} · ${formatAmount(payment.amount)}`,
          description: `Подтвердите проведение платежа на сумму ${formatAmount(payment.amount)}.`,
          run: () => sdk.admin.payment.capture(payment.id, {}),
          success: "Платёж проведён",
        })
      }
      const refunded = (payment.refunds ?? []).reduce((sum, refund) => sum + Number(refund.amount), 0)
      if (refundPermissions.canRead && refundPermissions.canCreate && payment.captured_at && refunded < Number(payment.amount)) {
        paymentActions.push({
          label: `Вернуть деньги${number} · ${formatAmount(Number(payment.amount) - refunded)}`,
          to: `${base}/refund?paymentId=${payment.id}`,
        })
      }
    }
    const outstanding = collections.find((collection) => collection.status === "not_paid")
    if (active && paymentCollectionPermissions.canUpdate && outstanding &&
      Number(order.summary?.pending_difference ?? 0) > 0) {
      paymentActions.push({
        label: `Отметить доплату · ${formatAmount(outstanding.amount)}`,
        description: "Подтвердите, что деньги по этой доплате уже получены.",
        run: () => sdk.admin.paymentCollection.markAsPaid(outstanding.id, { order_id: order.id }),
        success: "Доплата отмечена как полученная",
      })
    }
  }

  const returnable = items.some(({ detail }) => detail &&
    Number(detail.delivered_quantity) > Number(detail.return_received_quantity ?? 0) +
    Number(detail.return_requested_quantity ?? 0) + Number(detail.return_dismissed_quantity ?? 0))
  const openChange = preview?.order_change
  const showCreateReturn = active && canUpdate && returnPermissions.canCreate && returnPermissions.canUpdate &&
    returns.isSuccess && Boolean(preview) && !openChange
  const returnList = returns.data ?? []
  const returnStatus: Status = !returnPermissions.canRead ? ["Нет доступа", "grey"]
    : returns.isError ? ["Не удалось загрузить", "red"]
    : returns.isLoading ? ["Загрузка…", "grey"]
    : returnList.length ? [`Возвратов: ${returnList.length}`, "blue"] : ["Нет возвратов", "grey"]

  const deliveryStatus = deliveryStatuses[order.fulfillment_status] ?? unknownStatus
  const showShipmentRows = fulfillmentPermissions.canRead && fulfillments.length > 1
  const singleShipment = fulfillmentPermissions.canRead && fulfillments.length === 1 ? fulfillments[0] : undefined
  const singlePickup = singleShipment?.shipping_option?.service_zone?.fulfillment_set?.type === "pickup"
  const deliveryActions = [...prepareActions, ...(singleShipment ? fulfillmentActions(singleShipment, singlePickup) : [])]
  const showDeliveryMenu = !isCanceled && (!showShipmentRows || deliveryActions.length > 0)
  const statusOnly = isCanceled && !paymentActions.length && !returns.isError && !openChange
  const displayDeliveryStatus = singleShipment && (order.fulfillment_status === "fulfilled" || order.fulfillment_status === "delivered")
    ? shipmentStatus(singleShipment, singlePickup)
    : deliveryStatus

  return <Container className="group/order-status divide-y p-0 [container-type:inline-size]" data-status-only={statusOnly}>
    <div className="px-4 py-4 sm:px-6"><Heading level="h2">Статусы и действия</Heading></div>
    <StatusRow icon={<Receipt />} label="Заказ" status={status}
      detail={canChangeTexnoOrder && (!paid || !delivered) ? "Завершение после оплаты и вручения" : undefined}>
      {canChangeTexnoOrder && <>
        {!confirmed && actionButton({
          label: "Подтвердить заказ",
          run: () => changeStatus("confirm"),
          success: "Заказ подтверждён",
        })}
        {paid && delivered ? actionButton({
          label: "Завершить заказ",
          description: "Заказ будет отмечен как завершённый в админке и личном кабинете.",
          run: () => changeStatus("complete"),
          success: "Заказ завершён",
        }) : <Button size="small" variant="secondary" disabled>Завершить заказ</Button>}
      </>}
    </StatusRow>
    <StatusRow icon={<TruckFast />} label="Доставка" status={displayDeliveryStatus}>
      {showDeliveryMenu && actionMenu(deliveryActions, "Изменить статус")}
    </StatusRow>
    {showShipmentRows && fulfillments.map((fulfillment, index) => {
      const pickup = fulfillment.shipping_option?.service_zone?.fulfillment_set?.type === "pickup"
      const actions = fulfillmentActions(fulfillment, pickup)
      return <StatusRow key={fulfillment.id} label={`Отправление №${index + 1}`} status={shipmentStatus(fulfillment, pickup)}>
        {!isCanceled && actionMenu(actions, "Изменить статус")}
      </StatusRow>
    })}
    <StatusRow icon={<CreditCard />} label="Оплата"
      status={Number(order.total) === 0 ? ["Оплата не требуется", "grey"] : paymentStatuses[order.payment_status] ?? unknownStatus}>
      {(!isCanceled || paymentActions.length > 0) && actionMenu(paymentActions, "Действия с оплатой")}
    </StatusRow>
    <StatusRow icon={<ArrowUturnLeft />} label="Возврат" status={returnStatus}>
      {returns.isError && <Button size="small" variant="secondary" onClick={() => void returns.refetch()}>Повторить</Button>}
      {showCreateReturn && (returnable
        ? actionButton({ label: "Оформить возврат", to: `${base}/returns` })
        : <Button size="small" variant="secondary" disabled>Оформить возврат</Button>)}
    </StatusRow>
    {returnList.map((entry) => {
      const canReceive = active && canUpdate && returnPermissions.canUpdate && entry.status === "requested" && !entry.canceled_at &&
        Boolean(preview) && (!openChange || (String(openChange.change_type) === "return_receive" && openChange.return_id === entry.id))
      const canContinue = canUpdate && returnPermissions.canUpdate && entry.status === "open" && openChange?.return_id === entry.id &&
        !entry.claim_id && !entry.exchange_id
      return <StatusRow key={entry.id} label={`Возврат №${entry.display_id}`} status={returnStatuses[entry.status ?? ""] ?? unknownStatus}>
        {canReceive && actionButton({ label: "Принять товары", to: `${base}/returns/${entry.id}/receive` })}
        {canContinue && actionButton({ label: "Продолжить оформление", to: `${base}/returns` })}
      </StatusRow>
    })}
    {isCanceled && <div className="bg-ui-bg-subtle px-4 py-3 sm:px-6">
      <Text size="small" className="text-ui-fg-subtle">Отменённый заказ нельзя вернуть в работу. Если покупка ещё актуальна, оформите новый заказ.</Text>
    </div>}
  </Container>
}

export const config = defineWidgetConfig({ zone: "order.details", id: "texno-order-status-actions" })

export default TexnoOrderStatusActions
