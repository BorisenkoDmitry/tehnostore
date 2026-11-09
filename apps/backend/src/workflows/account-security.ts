import type { MedusaContainer } from "@medusajs/framework/types"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import type { AccountSecurityInput } from "../api/store/account-security/validators"

type Input = AccountSecurityInput & { customer_id: string; auth_identity_id: string }
type Snapshot = { provider_id: string; entity_id: string; provider_metadata: Record<string, unknown> | null; customer_id: string; email: string | null; new_entity_id: string; operation: Input["operation"] }

async function updateSecurity(input: Input, container: MedusaContainer) {
  const auth = container.resolve(Modules.AUTH)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "email", "has_account"], filters: { id: input.customer_id } })
  const customer = customers[0]
  if (!customer?.has_account) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Войдите в аккаунт покупателя")
  const identity = await auth.retrieveAuthIdentity(input.auth_identity_id, { relations: ["provider_identities"] })
  if (identity.app_metadata?.customer_id !== customer.id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Аккаунт недоступен")
  if (identity.app_metadata?.user_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Для учётной записи с доступом администратора измените данные входа в настройках магазина")
  const provider = identity.provider_identities?.find((entry) => entry.provider === "emailpass")
  if (!provider) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Этот способ входа не поддерживает изменение email и пароля")
  const verified = await auth.authenticate("emailpass", { body: { email: provider.entity_id, password: input.current_password } })
  if (!verified.success || verified.authIdentity?.id !== identity.id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Текущий пароль указан неверно")
  const nextEmail = input.operation === "email" ? input.email : provider.entity_id
  const snapshot: Snapshot = { provider_id: provider.id, entity_id: provider.entity_id, provider_metadata: provider.provider_metadata ?? null, customer_id: customer.id, email: customer.email, new_entity_id: nextEmail, operation: input.operation }
  if (input.operation === "email") {
    const duplicates = await auth.listProviderIdentities({ provider: "emailpass", entity_id: nextEmail })
    const { data: accounts } = await query.graph({ entity: "customer", fields: ["id"], filters: { email: nextEmail, has_account: true } })
    if (duplicates.some((entry) => entry.id !== provider.id) || accounts.some((entry) => entry.id !== customer.id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Этот email уже используется другим аккаунтом")
    await auth.updateProviderIdentities({ id: provider.id, entity_id: nextEmail })
    try {
      await updateCustomersWorkflow(container).run({ input: { selector: { id: customer.id }, update: { email: nextEmail } } })
    } catch (error) {
      await auth.updateProviderIdentities({ id: provider.id, entity_id: snapshot.entity_id })
      throw error
    }
  } else {
    const result = await auth.updateProvider("emailpass", { entity_id: provider.entity_id, password: input.password })
    if (!result.success || result.authIdentity?.id !== identity.id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Не удалось изменить пароль. Повторите попытку")
  }
  return snapshot
}

const accountSecurityStep = createStep("texno-account-security", async (input: Input, { container }) => {
  const snapshot = await container.resolve(Modules.LOCKING).execute(`texno-account-security:${input.customer_id}`, () => updateSecurity(input, container), { timeout: 5, expire: 60 })
  return new StepResponse({ success: true }, snapshot)
}, async (snapshot, { container }) => {
  if (!snapshot) return
  await container.resolve(Modules.LOCKING).execute(`texno-account-security:${snapshot.customer_id}`, async () => {
    const auth = container.resolve(Modules.AUTH)
    const provider = await auth.retrieveProviderIdentity(snapshot.provider_id)
    if (provider.entity_id !== snapshot.new_entity_id) throw new Error("Account changed after this operation; automatic recovery stopped")
    await auth.updateProviderIdentities({ id: snapshot.provider_id, entity_id: snapshot.entity_id, provider_metadata: snapshot.provider_metadata ?? {} })
    if (snapshot.operation === "email") await updateCustomersWorkflow(container).run({ input: { selector: { id: snapshot.customer_id }, update: { email: snapshot.email } } })
  }, { timeout: 5, expire: 60 })
})

export const accountSecurityWorkflow = createWorkflow({ name: "texno-account-security", store: false }, function (input: Input) {
  return new WorkflowResponse(accountSecurityStep(input))
})
