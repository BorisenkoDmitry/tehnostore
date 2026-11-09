"use client"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { updateCustomerProfileName } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { safeAccountAction } from "../../lib/actions"
const ProfileName = ({ customer }: { customer: HttpTypes.StoreCustomer }) => {
  const [state, action] = useActionState(safeAccountAction(updateCustomerProfileName, { success: false, error: "Связь прервалась. Проверьте интернет и повторите сохранение." }), { success: false, error: null as string | null })
  const router = useRouter()
  useEffect(() => { if (state.success) router.refresh() }, [state, router])
  return <form action={action} className="w-full"><AccountInfo label="Имя и фамилия" currentInfo={[customer.first_name, customer.last_name].filter(Boolean).join(" ")} isSuccess={state.success} isError={Boolean(state.error)} errorMessage={state.error ?? undefined} clearState={() => {}} data-testid="account-name-editor"><div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3"><Input label="Имя" name="first_name" autoComplete="given-name" required maxLength={100} defaultValue={customer.first_name ?? ""} data-testid="first-name-input" /><Input label="Фамилия" name="last_name" autoComplete="family-name" required maxLength={100} defaultValue={customer.last_name ?? ""} data-testid="last-name-input" /></div></AccountInfo></form>
}
export default ProfileName
