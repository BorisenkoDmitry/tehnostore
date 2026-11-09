import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow, createCartWorkflow, updateCartWorkflow, updateLineItemInCartWorkflow, refreshCartItemsWorkflow, updateCartsStep, updateOrdersStep } from "@medusajs/medusa/core-flows"
import { assertPurchasable, cartState, checkoutRegion, customerCarts, hashToken, newCartToken, privateCart, productItemsTotal, regionConfiguration } from "../lib/texno-cart"
import { calculateQuote, validateCheckout } from "../lib/texno-cart-rules"
import { CheckoutPlan, texnoCheckoutWorkflow } from "./texno-checkout"
import { checkoutRequestFingerprint, isPendingCheckoutAttempt, recoverCheckoutExecution } from "../lib/checkout-operation"

type Input = { operation: "create" | "items" | "quote" | "checkout" | "claim" | "resolve" | "attach"; id?: string; token?: string; customer_id?: string; channel_ids: string[]; data: Record<string, any> }

const associateCart = createWorkflow("texno-associate-customer-cart", function (input: { id: string; customer_id: string; metadata: Record<string, unknown> }) {
  return new WorkflowResponse(updateCartsStep([input]))
})
const associateOrder = createWorkflow("texno-associate-customer-order", function (input: { id: string; customer_id: string; metadata: Record<string, unknown> }) {
  return new WorkflowResponse(updateOrdersStep({ selector: { id: input.id }, update: { customer_id: input.customer_id, metadata: input.metadata } }))
})
const saveCheckoutAttempt = createWorkflow("texno-save-checkout-attempt", function (input: { id: string; metadata: Record<string, unknown> }) {
  return new WorkflowResponse(updateCartsStep([input]))
})
const mergeCustomerCarts = createWorkflow({ name: "merge-customer-carts", store: true, idempotent: true }, function (input: { target_id: string; items: { variant_id: string; quantity: number; thumbnail?: string }[]; source: { id: string; customer_id: string; metadata: Record<string, unknown> } }) {
  addToCartWorkflow.runAsStep({ input: { cart_id: input.target_id, items: input.items } })
  return new WorkflowResponse(updateCartsStep([input.source]))
})

async function finishCheckoutAttempt(container: MedusaContainer, cartId: string, attempt: any) {
  const workflow = texnoCheckoutWorkflow(container)
  const engine = container.resolve(Modules.WORKFLOW_ENGINE)
  const outcome = await recoverCheckoutExecution<CheckoutPlan>(attempt, {
    run: (options) => workflow.run(options),
    retryStep: (options) => workflow.retryStep(options),
    readExecution: async () => {
      const executions = await engine.listWorkflowExecutions({ workflow_id: "texno-durable-checkout", transaction_id: attempt.id }, { select: ["workflow_id", "transaction_id", "run_id", "state", "execution"], order: { created_at: "DESC" }, take: 1 })
      return executions[0]
    },
    readExecutionState: async () => {
      const executions = await engine.listWorkflowExecutions({ workflow_id: "texno-durable-checkout", transaction_id: attempt.id }, { select: ["state"], order: { created_at: "DESC" }, take: 1 })
      return executions[0]?.state
    },
  })
  const cart = await privateCart(container, cartId)
  const state = outcome.transaction.getState()
  // Completion is already committed. Persist bookkeeping through the cart step;
  // updateCartWorkflow correctly rejects business edits of completed carts.
  await saveCheckoutAttempt(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_checkout_attempt: { id: attempt.id, fingerprint: attempt.fingerprint, request_fingerprint: attempt.request_fingerprint, state, ...(state === "done" ? {} : { plan: attempt.plan }) } } } })
  if (outcome.errors?.length) throw outcome.errors[0].error
  if (!cart.completed_at) throw new MedusaError(MedusaError.Types.CONFLICT, "Оформление восстанавливается. Повторите запрос")
  return cartState(container, await privateCart(container, cart.id))
}

async function runCartOperation(input: Input, container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const region = await checkoutRegion(container)
  const configuration = regionConfiguration(region)
  if (input.operation === "create") {
    const { data: stores } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
    const channel = stores[0]?.default_sales_channel_id!
    if (!input.channel_ids.includes(channel)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Канал магазина недоступен")
    const token = newCartToken()
    const { result } = await createCartWorkflow(container).run({ input: { region_id: region.id, currency_code: region.currency_code, sales_channel_id: channel, metadata: { texno_checkout: true, texno_token_hash: hashToken(token) } } })
    return { ...(await cartState(container, await privateCart(container, result.id))), token }
  }
  const locking = container.resolve(Modules.LOCKING)
  return locking.execute(`texno-cart:${input.id}`, async () => {
    let cart = await privateCart(container, input.id!, input.token ?? "", input.customer_id)
    if (!input.channel_ids.includes(cart.sales_channel_id)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Канал магазина недоступен")
    if (cart.metadata?.texno_merged_into) return runCartOperation({ ...input, id: cart.metadata.texno_merged_into }, container)
    if (input.operation === "attach") {
      if (!input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Войдите в аккаунт")
      const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "has_account"], filters: { id: input.customer_id } })
      if (!customers[0]?.has_account) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Аккаунт покупателя недоступен")
      const owner = cart.metadata?.texno_customer_id
      if (owner && owner !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина принадлежит другому покупателю")
      if (cart.customer?.has_account && cart.customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина принадлежит другому покупателю")
      // Capability possession plus authenticated actor is required. Contact email
      // never grants ownership, including for an already completed guest order.
      const metadata = { ...cart.metadata, texno_customer_id: input.customer_id, texno_claimed_at: cart.metadata?.texno_claimed_at ?? new Date().toISOString() }
      if (cart.completed_at) {
        const { data: links } = await query.graph({ entity: "order_cart", fields: ["order_id"], filters: { cart_id: cart.id } })
        if (links[0]?.order_id) {
          const { data: orders } = await query.graph({ entity: "order", fields: ["id", "customer_id", "customer.has_account", "metadata"], filters: { id: links[0].order_id } })
          const order = orders[0]
          if (order.metadata?.texno_customer_id && order.metadata.texno_customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ принадлежит другому покупателю")
          if (order.customer?.has_account && order.customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ принадлежит другому покупателю")
          await associateOrder(container).run({ input: { id: order.id, customer_id: input.customer_id, metadata: { ...order.metadata, texno_customer_id: input.customer_id, texno_claimed_at: metadata.texno_claimed_at } } })
        }
      }
      await associateCart(container).run({ input: { id: cart.id, customer_id: input.customer_id, metadata } })
      return cartState(container, await privateCart(container, cart.id))
    }
    if (cart.completed_at) {
      if (input.operation === "checkout") return cartState(container, cart)
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Заказ уже оформлен. Создайте новую корзину")
    }
    const interrupted = cart.metadata?.texno_checkout_attempt
    if (input.operation === "checkout" && isPendingCheckoutAttempt(interrupted)) {
      const executions = await container.resolve(Modules.WORKFLOW_ENGINE).listWorkflowExecutions({ workflow_id: "texno-durable-checkout", transaction_id: interrupted.id })
      const execution = executions[0]
      if (execution?.state === "failed") throw new MedusaError(MedusaError.Types.CONFLICT, "Оформление требует восстановления после ошибки компенсации")
      if (execution?.state !== "reverted") {
        if (interrupted.request_fingerprint !== checkoutRequestFingerprint(input.data)) throw new MedusaError(MedusaError.Types.CONFLICT, "Повторите незавершённое оформление с прежними данными")
        // Resume BEFORE refresh/stock checks: this attempt may already own the
        // reservations which reduced free stock, or have prepared service fees.
        return finishCheckoutAttempt(container, cart.id, interrupted)
      }
      await updateCartWorkflow(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_checkout_attempt: { ...interrupted, state: "reverted" } } } })
      cart = await privateCart(container, cart.id)
    }
    if (isPendingCheckoutAttempt(cart.metadata?.texno_checkout_attempt) && input.operation !== "checkout") throw new MedusaError(MedusaError.Types.CONFLICT, "Оформление не завершено. Повторите оформление для восстановления перед изменением корзины")
    if (input.operation === "items") {
      const { variant_id, mutation_id } = input.data
      const mutations: { id: string; variant_id: string; target: number; done: boolean }[] = (cart.metadata?.texno_mutations ?? []).filter((m) => typeof m === "object")
      const replay = mutations.find((m) => m.id === mutation_id)
      if (replay && replay.variant_id !== variant_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Идентификатор изменения уже использован")
      if (replay?.done) return cartState(container, cart)
      const existing = cart.items.find((i) => i.variant_id === variant_id)
      const quantity = replay?.target ?? (input.data.increment ? Number(existing?.quantity ?? 0) + input.data.quantity : input.data.quantity)
      if (quantity > 0) await assertPurchasable(container, cart, [...cart.items.filter((item) => item.variant_id && item.variant_id !== variant_id).map((item) => ({ variant_id: item.variant_id, quantity: Number(item.quantity) })), { variant_id, quantity }])
      const { data: variantImages } = quantity > 0 ? await query.graph({ entity: "product_variant", fields: ["id", "thumbnail", "images.url", "product.id", "product.thumbnail"], filters: { id: variant_id } }) : { data: [] }
      const { data: productImages } = quantity > 0 && variantImages[0]?.product?.id ? await query.graph({ entity: "product_image", fields: ["id", "url", "rank", "variants.id"], filters: { product_id: variantImages[0].product.id } }) : { data: [] }
      const explicitImage = productImages.filter((image) => image.variants?.some((v) => v?.id === variant_id)).sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))[0]
      const thumbnail = explicitImage?.url ?? variantImages[0]?.images?.[0]?.url ?? variantImages[0]?.thumbnail ?? variantImages[0]?.product?.thumbnail ?? undefined
      const intent = replay ?? { id: mutation_id, variant_id, target: quantity, done: false }
      if (!replay) await updateCartWorkflow(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_mutations: [...mutations.slice(-499), intent] } } })
      if (existing) await updateLineItemInCartWorkflow(container).run({ input: { cart_id: cart.id, item_id: existing.id, update: { quantity, ...(thumbnail ? { thumbnail } : {}) } } })
      else if (quantity > 0) await addToCartWorkflow(container).run({ input: { cart_id: cart.id, items: [{ variant_id, quantity, ...(thumbnail ? { thumbnail } : {}) }] } })
      // Persist the absolute target BEFORE the mutation: increment retry after a
      // lost response or process crash cannot increment a second time.
      cart = await privateCart(container, cart.id)
      await updateCartWorkflow(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_mutations: [...mutations.filter((m) => m.id !== mutation_id).slice(-499), { ...intent, done: true }] } } })
      return cartState(container, await privateCart(container, cart.id))
    }
    await refreshCartItemsWorkflow(container).run({ input: { cart_id: cart.id, force_refresh: true } })
    cart = await privateCart(container, cart.id)
    if (input.operation === "quote") {
      // Validate the submitted identifiers before saving selection. Only IDs,
      // never prices supplied by a browser, become the persisted preference.
      const state = await cartState(container, cart, input.data.delivery_method, input.data.services)
      await updateCartWorkflow(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_selection: { delivery_method: input.data.delivery_method, services: input.data.services } } } })
      return state
    }
    let checkoutInput = input.data
    let savedAddress: any
    if (input.data.saved_address_id) {
      if (!input.customer_id || cart.metadata?.texno_customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Адрес доступен только своему покупателю")
      const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "addresses.*"], filters: { id: input.customer_id } })
      savedAddress = customers[0]?.addresses?.find((address) => address?.id === input.data.saved_address_id)
      if (!savedAddress?.address_1 || !savedAddress.city) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Сохранённый адрес недоступен или неполон")
      checkoutInput = { ...input.data, city: savedAddress.city, address: { ...input.data.address, street: savedAddress.address_1, apartment: input.data.address.apartment || savedAddress.address_2 || "", postal_code: input.data.address.postal_code || savedAddress.postal_code || "" }, saved_address_verified: true }
    }
    let data: Record<string, any>
    try { data = validateCheckout(checkoutInput, configuration) }
    catch (error) { throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message) }
    const productItems = cart.items.filter((i) => i.variant_id)
    if (!productItems.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Добавьте товар в корзину")
    await assertPurchasable(container, { ...cart, metadata: { ...cart.metadata, texno_selection: { delivery_method: data.delivery_method } } }, productItems.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })))
    let quote
    try { quote = calculateQuote(configuration, productItemsTotal(cart), data.delivery_method, data.services) }
    catch (error) { throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message) }
    if (Math.abs(quote.total - data.expected_total) > 0.005) throw new MedusaError(MedusaError.Types.CONFLICT, "Стоимость корзины изменилась. Проверьте обновлённый итог и повторите оформление")
    const method = configuration.delivery_methods.find((m) => m.id === data.delivery_method)!
    const selectedServices = configuration.services.filter((s) => data.services.includes(s.id))
    // Resolve the exact server tariff before persisting contact data or fees.
    const { data: shippingOptions }: { data: any[] } = await query.graph({ entity: "shipping_option", fields: ["id", "metadata", "prices.amount", "prices.currency_code"] })
    const option = shippingOptions.find((o) => o.metadata?.texno_delivery_id === method.id)
    if (!option || !option.prices?.some((p) => p.currency_code === region.currency_code && Number(p.amount) === (method.price ?? 0))) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Тариф доставки изменился. Обратитесь в магазин")
    const address = { first_name: data.name, last_name: "", phone: data.phone, city: data.city, country_code: savedAddress?.country_code || configuration.country_code, postal_code: savedAddress?.postal_code || data.address.postal_code || undefined, address_1: savedAddress?.address_1 || [data.address.street, data.address.house, data.address.building].filter(Boolean).join(", ") || data.city, address_2: [savedAddress?.address_2, data.address.apartment && data.address.apartment !== savedAddress?.address_2 && `Кв./офис ${data.address.apartment}`, data.address.entrance && `Подъезд ${data.address.entrance}`, data.address.floor && `Этаж ${data.address.floor}`, data.address.intercom && `Домофон ${data.address.intercom}`, data.address.metro && `Метро ${data.address.metro}`].filter(Boolean).join("; ") }
    const fingerprint = hashToken(JSON.stringify({ data, quote, products: productItems.map((item) => [item.id, item.variant_id, Number(item.quantity), Number(item.unit_price)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) }))
    let attempt = cart.metadata?.texno_checkout_attempt
    if (isPendingCheckoutAttempt(attempt)) {
      const executions = await container.resolve(Modules.WORKFLOW_ENGINE).listWorkflowExecutions({ workflow_id: "texno-durable-checkout", transaction_id: attempt.id })
      const execution = executions[0]
      if (execution?.state === "reverted") attempt = undefined
      else if (execution?.state === "failed") throw new MedusaError(MedusaError.Types.CONFLICT, "Оформление требует восстановления после ошибки компенсации")
      else if (attempt.fingerprint !== fingerprint) throw new MedusaError(MedusaError.Types.CONFLICT, "Повторите незавершённое оформление с прежними данными")
    } else attempt = undefined
    if (!attempt) {
      const operationId = `checkout-${cart.id}-${newCartToken().slice(0, 24)}`
      const plan: CheckoutPlan = { id: cart.id, operation_id: operationId, ...(data.email ? { email: data.email } : {}), address, selection: { delivery_method: method.id, services: data.services }, order: { contact_name: data.name, phone: data.phone, city: data.city, address: data.address, delivery_method: method.label, delivery_pricing: method.pricing, delivery_date: data.delivery_date, delivery_slot: data.delivery_slot, payment_preference: data.payment_preference, services: selectedServices, comment: data.comment ?? "", consent: true, consent_at: new Date().toISOString(), quote, confirmation_required: true, paid: false }, services: selectedServices, shipping_option_id: option.id, shipping_data: { texno_pricing: method.pricing, estimate_min: method.min, estimate_max: method.max, confirmation_required: method.pricing !== "fixed" }, total: quote.total, payment_preference: data.payment_preference }
      attempt = { id: operationId, fingerprint, request_fingerprint: checkoutRequestFingerprint(input.data), state: "running", plan }
      await updateCartWorkflow(container).run({ input: { id: cart.id, metadata: { ...cart.metadata, texno_checkout_attempt: attempt } } })
    }
    return finishCheckoutAttempt(container, cart.id, attempt)
  }, { timeout: 30, expire: 120 })
}

async function runOperation(input: Input, container: MedusaContainer): Promise<any> {
  if (input.operation !== "claim" && input.operation !== "resolve") return runCartOperation(input, container)
  if (!input.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Войдите в аккаунт")
  const locking = container.resolve(Modules.LOCKING)
  return locking.execute(`texno-account-cart:${input.customer_id}`, async () => {
    if (input.operation === "claim") await runCartOperation({ ...input, operation: "attach" }, container)
    const carts = await customerCarts(container, input.customer_id!, input.channel_ids)
    if (!carts.length) {
      const created = await runCartOperation({ ...input, operation: "create" }, container)
      return runCartOperation({ ...input, operation: "attach", id: created.cart.id, token: created.token }, container)
    }
    const target = carts[0]
    for (const source of carts.slice(1)) {
      const result = await locking.execute(`texno-cart:${target.id}`, async () => locking.execute(`texno-cart:${source.id}`, async () => {
        const targetCart = await privateCart(container, target.id, "", input.customer_id)
        const sourceCart = await privateCart(container, source.id, "", input.customer_id)
        if (sourceCart.metadata?.texno_merged_into || sourceCart.completed_at) return null
        const quantities = new Map<string, number>()
        for (const item of [...targetCart.items, ...sourceCart.items].filter((item) => item.variant_id)) quantities.set(item.variant_id, (quantities.get(item.variant_id) ?? 0) + Number(item.quantity))
        try { await assertPurchasable(container, targetCart, [...quantities].map(([variant_id, quantity]) => ({ variant_id, quantity }))) }
        catch (error) {
          // Keep both exact baskets when stock prevents a merge. No line or
          // quantity is silently discarded, and both remain owned server-side.
          const preferred = input.id === source.id ? sourceCart : targetCart
          await associateCart(container).run({ input: { id: preferred.id, customer_id: input.customer_id!, metadata: { ...preferred.metadata, texno_account_primary: true, texno_primary_at: new Date().toISOString(), texno_merge_issue: (error as Error).message } } })
          return { ...(await cartState(container, preferred)), merge_pending: { message: (error as Error).message, carts: carts.map((item) => ({ id: item.id })) } }
        }
        const items = sourceCart.items.filter((item) => item.variant_id).map((item) => ({ variant_id: item.variant_id, quantity: item.quantity, ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}) }))
        // A stored idempotent workflow commits the line mutation and source
        // marker together. Retrying after a lost response cannot add twice.
        const sourceUpdate = { id: source.id, customer_id: input.customer_id!, metadata: { ...sourceCart.metadata, texno_merged_into: target.id, texno_merged_at: new Date().toISOString(), texno_account_primary: false } }
        if (items.length) await mergeCustomerCarts(container).run({ context: { transactionId: `merge-${source.id}` }, input: { target_id: target.id, items, source: sourceUpdate } })
        else await associateCart(container).run({ input: sourceUpdate })
        return null
      }, { timeout: 30, expire: 120 }), { timeout: 30, expire: 120 })
      if (result) return result
    }
    const selected = await privateCart(container, target.id, "", input.customer_id)
    await associateCart(container).run({ input: { id: target.id, customer_id: input.customer_id!, metadata: { ...selected.metadata, texno_account_primary: true, texno_primary_at: new Date().toISOString(), texno_merge_issue: null } } })
    return cartState(container, selected)
  }, { timeout: 30, expire: 120 })
}

const operationStep = createStep("texno-cart-operation", async (input: Input, { container }) => new StepResponse(await runOperation(input, container)))
export const texnoCartWorkflow = createWorkflow("texno-cart", function (input: Input) { return new WorkflowResponse(operationStep(input)) })
