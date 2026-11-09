import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

function resourceId(value: unknown): string {
  // Express already decodes route parameters. Body and query IDs are used
  // as supplied by their validators. Never decode or fold the ID again.
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Неверный идентификатор ресурса")
  }
  return value
}

function hasCheckoutMetadata(metadata?: Record<string, unknown> | null) {
  return Object.keys(metadata ?? {}).some((key) => key.startsWith("texno_"))
}

function customerId(req: MedusaRequest) {
  const auth = (req as AuthenticatedMedusaRequest).auth_context
  return auth?.actor_type === "customer" ? auth.actor_id : undefined
}

export function validateNativeCheckoutPath(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  // Express throws a URIError before calling parameter middleware. Medusa's
  // error handler would otherwise translate it to a 500.
  try {
    decodeURIComponent(req.path)
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Неверный адрес ресурса")
  }
  next()
}

async function assertNativeCartAccess(req: MedusaRequest, rawId: unknown) {
  const id = resourceId(rawId)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: ["id", "metadata", "completed_at", "customer_id", "customer.has_account"],
    filters: { id },
  })
  const customer = customerId(req)
  // Legacy anonymous carts still use their opaque ID for UCP and resume.
  // TEXNO carts always go through the capability-aware custom API.
  if (!cart || hasCheckoutMetadata(cart.metadata) ||
      (cart.customer_id && cart.customer?.has_account !== false && cart.customer_id !== customer)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина недоступна")
  }
  if (cart.completed_at) {
    const { data: links } = await query.graph({
      entity: "order_cart",
      fields: ["order.metadata", "order.customer_id", "order.customer.has_account"],
      filters: { cart_id: id },
    })
    if (links.some(({ order }) => hasCheckoutMetadata(order?.metadata) ||
      (order?.customer_id && order.customer?.has_account !== false && order.customer_id !== customer))) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина недоступна")
    }
  }
}

export async function guardTexnoNativeCart(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  await assertNativeCartAccess(req, req.params.id)
  next()
}

export async function guardNativeCartLine(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const id = resourceId(req.params.id)
  const lineId = resourceId(req.params.line_id)
  const { data: [cart] } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: ["id", "items.id"],
    filters: { id },
  })
  // The native delete workflow accepts item IDs independently of the cart.
  if (!cart?.items?.some((item) => item?.id === lineId)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Позиция корзины недоступна")
  }
  next()
}

export function guardNativeCartWrite(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const body = req.validatedBody as {
    metadata?: Record<string, unknown>
    shipping_address?: string | { id?: string }
    billing_address?: string | { id?: string }
  }
  if (hasCheckoutMetadata(body?.metadata)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Служебные данные корзины доступны только серверу")
  }
  if ([body?.shipping_address, body?.billing_address].some(
    (address) => typeof address === "string" || address?.id !== undefined
  )) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Укажите данные адреса корзины")
  }
  next()
}

export async function guardNativeCartShipping(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const body = req.validatedBody as { cart_id?: string } | undefined
  if (req.method === "POST") resourceId(req.params.id)
  await assertNativeCartAccess(req, req.method === "POST" ? body?.cart_id : req.filterableFields.cart_id)
  next()
}

async function getNativeOrder(req: MedusaRequest, rawId: unknown) {
  const id = resourceId(rawId)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "metadata"],
    filters: { id },
  })
  if (!order) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ недоступен")

  if (hasCheckoutMetadata(order.metadata)) return { order, protectedCheckout: true }
  // Older orders can lack checkout metadata even though their cart is protected.
  const { data: links } = await query.graph({
    entity: "order_cart",
    fields: ["cart.metadata"],
    filters: { order_id: id },
  })
  return { order, protectedCheckout: links.some((link) => hasCheckoutMetadata(link.cart?.metadata)) }
}

export async function guardTexnoNativeOrder(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const { order, protectedCheckout } = await getNativeOrder(req, req.params.id)
  const customer = customerId(req)
  const readsOrder = req.method === "GET" || req.method === "HEAD"
  const ownsOrder = Boolean(customer && order.customer_id === customer)
  const checkoutOwner = order.metadata?.texno_customer_id
  if ((readsOrder && (!ownsOrder || (checkoutOwner != null && checkoutOwner !== customer))) ||
      (protectedCheckout && !readsOrder)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ доступен владельцу в личном кабинете")
  }
  next()
}

export function blockNativeOrderTransfer(_req: MedusaRequest, _res: MedusaResponse, _next: MedusaNextFunction) {
  // Request and cancel return the order to a transfer requester, who may not
  // own it. Guest order association uses the capability-aware claim workflow.
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Для привязки заказа используйте защищённую корзину")
}

export async function guardNativeOrderReturn(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const body = req.validatedBody as { order_id?: string } | undefined
  const { order, protectedCheckout } = await getNativeOrder(req, body?.order_id)
  const customer = customerId(req)
  if (protectedCheckout || !customer || order.customer_id !== customer) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Возврат по заказу недоступен")
  }
  next()
}

export function blockNativeCheckoutPayments(_req: MedusaRequest, _res: MedusaResponse, _next: MedusaNextFunction) {
  // Checkout creates collections and sessions in the authenticated server flow.
  // The public Medusa payment routes cannot establish the same cart capability.
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Оплата доступна при защищённом оформлении заказа")
}
