import { createHash } from "node:crypto"
import { clearTimeout as clearDelay, setTimeout as setDelay } from "node:timers"
import { TransactionHandlerType, TransactionState, TransactionStepState, TransactionStepStatus } from "@medusajs/framework/utils"

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}

export function checkoutRequestFingerprint(data: Record<string, any>) {
  return createHash("sha256").update(JSON.stringify(canonical(data))).digest("hex")
}

export function isPendingCheckoutAttempt(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  return ["running", TransactionState.NOT_STARTED, TransactionState.INVOKING, TransactionState.WAITING_TO_COMPENSATE, TransactionState.COMPENSATING, TransactionState.FAILED].includes(String((value as { state?: unknown }).state))
}

const resumableCheckoutActions = new Set([
  "texno-checkout-checkpoint",
  "checkpoint-services",
  "checkpoint-shipping",
  "checkpoint-before-collection",
  "checkpoint-collection",
  "checkpoint-session",
  "texno-checkout-ensure-services",
])

/** Only our read checkpoints and idempotent service reconciler can be retried.
 * Native child mutations are deliberately excluded from forced recovery. */
export function checkoutRetryIdempotencyKey(attemptId: string, value: unknown): string | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(attemptId) || !value || typeof value !== "object") return undefined
  const flow = value as { state?: unknown; steps?: Record<string, { definition?: { action?: unknown; async?: unknown }; invoke?: { state?: unknown; status?: unknown } }> }
  if (flow.state !== TransactionState.INVOKING || !flow.steps || typeof flow.steps !== "object") return undefined
  const waiting = Object.values(flow.steps).filter((step) => step?.invoke?.state === TransactionStepState.INVOKING && step.invoke.status === TransactionStepStatus.WAITING)
  if (waiting.length !== 1) return undefined
  const step = waiting[0], action = step.definition?.action
  if (step.definition?.async || typeof action !== "string" || !resumableCheckoutActions.has(action)) return undefined
  return `texno-durable-checkout:${attemptId}:${action}:${TransactionHandlerType.INVOKE}`
}

type CheckoutExecutionResult = {
  transaction: { getFlow: () => unknown; getState: () => string }
  errors?: { error: unknown }[]
}

function checkoutStoredFlow(attemptId: string, value: unknown): any | undefined {
  if (!value || typeof value !== "object") return undefined
  const row = value as { workflow_id?: unknown; transaction_id?: unknown; run_id?: unknown; state?: unknown; execution?: any }
  const flow = row.execution
  if (row.workflow_id !== "texno-durable-checkout" || row.transaction_id !== attemptId || typeof row.run_id !== "string" || !row.run_id || flow?.modelId !== row.workflow_id || flow?.transactionId !== attemptId || flow?.runId !== row.run_id || flow?.state !== row.state) return undefined
  return flow
}

export function checkoutStoredRetryIdempotencyKey(attemptId: string, value: unknown): string | undefined {
  return checkoutRetryIdempotencyKey(attemptId, checkoutStoredFlow(attemptId, value))
}

export async function recoverCheckoutExecution<TPlan>(attempt: { id: string; plan: TPlan }, runner: {
  run: (options: { input: TPlan; context: { transactionId: string }; throwOnError: false }) => Promise<CheckoutExecutionResult>
  retryStep: (options: { idempotencyKey: string; throwOnError: false }) => Promise<CheckoutExecutionResult>
  readExecution: () => Promise<unknown>
  readExecutionState: () => Promise<string | undefined>
}, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<CheckoutExecutionResult> {
  const runOptions = { input: attempt.plan, context: { transactionId: attempt.id }, throwOnError: false as const }
  // Inspect the exact persisted run before entering its graph. An initial run
  // of an orphan WAITING graph can interfere with the scheduled retry worker.
  const stored = await runner.readExecution()
  const storedFlow = checkoutStoredFlow(attempt.id, stored)
  const retryKey = checkoutStoredRetryIdempotencyKey(attempt.id, stored)
  // A prior retry owns a detached timer worker. Even if it has advanced to a
  // native mutation, another HTTP request must only observe its execution.
  const scheduledWorker = storedFlow && ![TransactionState.DONE, TransactionState.REVERTED, TransactionState.FAILED].includes(storedFlow.state) && Object.values(storedFlow.steps ?? {}).some((step: any) => step?.hasScheduledRetry === true)
  // Do not replace or mutate the saved attempt if retryStep itself fails.
  if (!retryKey && !scheduledWorker) return runner.run(runOptions)
  const retried: CheckoutExecutionResult = scheduledWorker
    ? { transaction: { getFlow: () => storedFlow, getState: () => storedFlow.state } }
    : await runner.retryStep({ idempotencyKey: retryKey!, throwOnError: false })
  const terminal = new Set<string>([TransactionState.DONE, TransactionState.REVERTED, TransactionState.FAILED])
  if (terminal.has(retried.transaction.getState())) return retried
  // retryStep schedules a timer worker; it does not await its completion. Read
  // the stored state while the caller retains its cart mutex. Never launch a
  // second run while that worker is invoking or compensating.
  const deadline = Date.now() + Math.max(0, options.timeoutMs ?? 30_000)
  for (;;) {
    let clearDeadline = () => {}
    let state: string | undefined
    try {
      state = await Promise.race([
        runner.readExecutionState(),
        new Promise<undefined>((resolve) => {
          const timer = setDelay(resolve, Math.max(0, deadline - Date.now()))
          clearDeadline = () => clearDelay(timer)
        }),
      ])
    } finally { clearDeadline() }
    if (state && terminal.has(state)) return runner.run(runOptions)
    const remaining = deadline - Date.now()
    if (remaining <= 0) return retried
    await new Promise((resolve) => setTimeout(resolve, Math.min(options.pollMs ?? 100, remaining)))
  }
}
