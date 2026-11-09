"use client"
import { useActionState } from "react"
import { HttpTypes } from "@medusajs/types"
import { updateCustomerPassword } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { safeAccountAction } from "../../lib/actions"
const ProfilePassword = ({ customer: _customer }: { customer: HttpTypes.StoreCustomer }) => {
  const [state, action] = useActionState(safeAccountAction(updateCustomerPassword, { success: false, error: "Связь прервалась. Повторите попытку. Если пароль уже изменён, используйте новый пароль." }), { success: false, error: null as string | null })
  return <form action={action} className="w-full"><AccountInfo label="Пароль" currentInfo="Не отображается" isSuccess={state.success} isError={Boolean(state.error)} errorMessage={state.error ?? undefined} clearState={() => {}} data-testid="account-password-editor">
    <Input label="Текущий пароль" name="old_password" type="password" autoComplete="current-password" required maxLength={256} data-testid="old-password-input" />
    <Input label="Новый пароль" name="new_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} data-testid="new-password-input" />
    <Input label="Повторите новый пароль" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} data-testid="confirm-password-input" />
    <p className="text-sm text-ui-fg-subtle">От 8 символов. Для изменения нужен текущий пароль.</p>
  </AccountInfo></form>
}
export default ProfilePassword
