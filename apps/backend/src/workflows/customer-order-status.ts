import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { completeOrderWorkflow, getOrderDetailWorkflow, updateOrderWorkflow } from "@medusajs/medusa/core-flows"

type Input = { id: string; action: "confirm" | "complete"; actor_id: string }

const changeCustomerOrderStatus = createStep("change-customer-order-status", async (input: Input, { container }) => {
  const status = await container.resolve(Modules.LOCKING).execute(`customer-order-status:${input.id}`, async () => {
    const { result: order } = await getOrderDetailWorkflow(container).run({ input: {
      order_id: input.id, fields: ["id", "status", "metadata", "total", "items.*", "items.detail.*"],
    } })
    const invalid = (message: string) => new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
    if (!order.metadata?.texno_order) throw invalid("Действие доступно для заказов с витрины")
    if (input.action === "complete" && order.status === "completed") return "completed"
    if (order.status !== "pending") throw invalid("Действие доступно для открытого заказа")

    if (input.action === "confirm") {
      if (!order.metadata.texno_order_confirmed_at) {
        await updateOrderWorkflow(container).run({ input: {
          id: input.id, user_id: input.actor_id,
          metadata: { ...order.metadata, texno_order_confirmed_at: new Date().toISOString(), texno_order_confirmed_by: input.actor_id },
        } })
      }
      return "confirmed"
    }

    if (Number(order.total) !== 0 && order.payment_status !== "captured") throw invalid("Сначала отметьте полную оплату заказа")
    const undelivered = order.items?.some((item) => item.requires_shipping && Number(item.detail?.delivered_quantity ?? 0) < Number(item.quantity))
    if (undelivered) throw invalid("Сначала отметьте доставку или выдачу всех товаров")
    await completeOrderWorkflow(container).run({ input: { orderIds: [input.id] } })
    return "completed"
  }, { timeout: 10, expire: 60 })
  return new StepResponse({ status })
})

export const changeCustomerOrderStatusWorkflow = createWorkflow("change-customer-order-status", function (input: Input) {
  return new WorkflowResponse(changeCustomerOrderStatus(input))
})
