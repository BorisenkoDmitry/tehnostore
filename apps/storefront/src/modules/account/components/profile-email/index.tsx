"use client"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { updateCustomerEmail } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { safeAccountAction } from "../../lib/actions"
const ProfileEmail = ({ customer }: { customer: HttpTypes.StoreCustomer }) => {
  const [state, action] = useActionState(safeAccountAction(updateCustomerEmail, { success: false, error: "Связь прервалась. Проверьте интернет и повторите сохранение." }), { success: false, error: null as string | null })
  const router = useRouter()
  useEffect(() => { if (state.success) router.refresh() }, [state, router])
  return <form action={action} className="w-full"><AccountInfo label="Email для входа" currentInfo={customer.email} isSuccess={state.success} isError={Boolean(state.error)} errorMessage={state.error ?? undefined} clearState={() => {}} data-testid="account-email-editor">
    <Input label="Новый email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={customer.email} data-testid="email-input" />
    <Input label="Текущий пароль" name="current_password" type="password" autoComplete="current-password" required maxLength={256} data-testid="current-password-input" />
    <p className="text-sm text-ui-fg-subtle">После сохранения используйте новый email для входа. Пароль останется прежним.</p>
  </AccountInfo></form>
}
export default ProfileEmail
