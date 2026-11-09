import { MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow, addShippingMethodToCartWorkflow, completeCartWorkflow, createPaymentCollectionForCartWorkflow, createPaymentSessionsWorkflow, deleteLineItemsWorkflow, updateCartWorkflow, useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { privateCart } from "../lib/texno-cart"
import { checkoutFaultCheckpoint } from "../lib/checkout-fault-injection"

export type CheckoutPlan = {
  id: string
  email?: string
  address: Record<string, any>
  selection: { delivery_method: string; services: string[] }
  order: Record<string, any>
  services: { id: string; label: string; price: number }[]
  shipping_option_id: string
  shipping_data: Record<string, any>
  total: number
  payment_preference: string
  operation_id?: string
}

const prepareCheckoutStep = createStep("texno-checkout-prepare", async (input: CheckoutPlan, { container }) => {
  const cart = await privateCart(container, input.id)
  return new StepResponse({
    update: { id: input.id, ...(input.email ? { email: input.email } : {}), shipping_address: input.address, billing_address: input.address, metadata: { ...cart.metadata, texno_selection: input.selection, texno_order: input.order } },
    previous_services: cart.items.filter((item) => !item.variant_id).map((item) => item.id),
  })
})

const checkoutCheckpointStep = createStep("texno-checkout-checkpoint", async (input: { id: string; stage: string }, { container }) => {
  await checkoutFaultCheckpoint(input.id, input.stage)
  const cart = await privateCart(container, input.id)
  return new StepResponse({ id: cart.id, total: Number(cart.total), payment_collection: cart.payment_collection })
})

const validateCheckoutTotalStep = createStep("texno-checkout-validate-total", async (input: { id: string; total: number }, { container }) => {
  const cart = await privateCart(container, input.id)
  if (Math.abs(Number(cart.total) - input.total) > 0.005) throw new MedusaError(MedusaError.Types.CONFLICT, "Итог изменился после расчёта. Обновите корзину")
  return new StepResponse(undefined)
})

async function removeOperationServices(container: any, cartId: string, operationId: string) {
  const cart = await privateCart(container, cartId)
  const ids = cart.items.filter((item) => !item.variant_id && item.metadata?.texno_checkout_operation_id === operationId).map((item) => item.id)
  if (ids.length) await deleteLineItemsWorkflow(container).run({ input: { cart_id: cartId, ids } })
}

const ensureCheckoutServicesStep = createStep("texno-checkout-ensure-services", async (input: { id: string; services: CheckoutPlan["services"]; operation_id?: string }, { container }) => {
  const cart = await privateCart(container, input.id)
  const operationId = input.operation_id || cart.metadata?.texno_checkout_attempt?.id
  if (!operationId) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Не найден идентификатор оформления")
  try {
    const missing = input.services.filter((service) => !cart.items.some((item) => !item.variant_id && item.metadata?.texno_service_id === service.id && item.metadata?.texno_checkout_operation_id === operationId && Number(item.quantity) === 1 && Number(item.unit_price) === service.price))
    if (missing.length) await addToCartWorkflow(container).run({ input: { cart_id: input.id, items: missing.map((service) => ({ title: service.label, quantity: 1, unit_price: service.price, requires_shipping: false, is_tax_inclusive: true, metadata: { texno_service_id: service.id, texno_checkout_operation_id: operationId } })) } })
    // This failpoint deliberately runs after the child add-to-cart commit and
    // before this step returns/persists success. A restart re-reads real lines
    // and adds only missing operation/service IDs instead of replaying the add.
    await checkoutFaultCheckpoint(input.id, "service_commit")
    return new StepResponse({ operation_id: operationId }, { id: input.id, operation_id: operationId })
  } catch (error) {
    // A thrown failure precedes StepResponse, so the engine cannot compensate
    // this failed step. Remove only lines owned by this exact cart/operation.
    await removeOperationServices(container, input.id, operationId)
    throw error
  }
}, async (input, { container }) => {
  if (input) await removeOperationServices(container, input.id, input.operation_id)
})

// Each mutation is a compensatable, persisted workflow step. An ordinary error
// rolls back the preparation; an interrupted execution resumes the same step
// graph under its saved transaction id instead of starting a second checkout.
export const texnoCheckoutWorkflow = createWorkflow({ name: "texno-durable-checkout", store: true, idempotent: true, retentionTime: 60 * 60 * 24 * 30 }, function (input: CheckoutPlan) {
  // The installed in-memory engine persists intermediate synchronous steps only
  // when the step requests store:true. Workflow-level store retains executions,
  // but alone does not make every checkpoint survive a process restart.
  const prepared = prepareCheckoutStep(input).config({ store: true })
  updateCartWorkflow.runAsStep({ input: prepared.update })
  checkoutCheckpointStep({ id: input.id, stage: "contacts" }).config({ store: true })
  when("remove-previous-services", { prepared }, ({ prepared }) => prepared.previous_services.length > 0).then(() => {
    deleteLineItemsWorkflow.runAsStep({ input: { cart_id: input.id, ids: prepared.previous_services } }).config({ store: true })
  })
  when("add-selected-services", { input }, ({ input }) => input.services.length > 0).then(() => {
    ensureCheckoutServicesStep({ id: input.id, services: input.services, operation_id: input.operation_id }).config({ store: true })
  })
  checkoutCheckpointStep({ id: input.id, stage: "services" }).config({ name: "checkpoint-services", store: true })
  addShippingMethodToCartWorkflow.runAsStep({ input: { cart_id: input.id, options: [{ id: input.shipping_option_id, data: input.shipping_data }] } })
  checkoutCheckpointStep({ id: input.id, stage: "shipping" }).config({ name: "checkpoint-shipping", store: true })
  validateCheckoutTotalStep(input)
  const cart = checkoutCheckpointStep({ id: input.id, stage: "before_collection" }).config({ name: "checkpoint-before-collection", store: true })
  when("create-checkout-payment-collection", { cart }, ({ cart }) => !cart.payment_collection?.id).then(() => {
    createPaymentCollectionForCartWorkflow.runAsStep({ input: { cart_id: input.id } }).config({ store: true })
  })
  checkoutCheckpointStep({ id: input.id, stage: "collection" }).config({ name: "checkpoint-collection", store: true })
  const { data: paymentCarts } = useQueryGraphStep({ entity: "cart", fields: ["id", "payment_collection.id", "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.provider_id", "payment_collection.payment_sessions.status"], filters: { id: input.id } }).config({ store: true })
  const sessionInput = transform({ input, paymentCarts }, ({ input, paymentCarts }) => ({ payment_collection_id: paymentCarts[0].payment_collection!.id, provider_id: "pp_system_default", data: { payment_preference: input.payment_preference, manual_confirmation: true } }))
  when("create-checkout-payment-session", { paymentCarts }, ({ paymentCarts }) => !paymentCarts[0].payment_collection?.payment_sessions?.some((session) => session?.provider_id === "pp_system_default" && ["pending", "authorized"].includes(session.status))).then(() => {
    createPaymentSessionsWorkflow.runAsStep({ input: sessionInput }).config({ store: true })
  })
  checkoutCheckpointStep({ id: input.id, stage: "session" }).config({ name: "checkpoint-session", store: true })
  const completed = completeCartWorkflow.runAsStep({ input: { id: input.id } }).config({ store: true })
  return new WorkflowResponse(completed)
})
