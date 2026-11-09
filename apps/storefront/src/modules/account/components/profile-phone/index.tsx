"use client"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { updateCustomerProfilePhone } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { safeAccountAction } from "../../lib/actions"
const ProfilePhone = ({ customer }: { customer: HttpTypes.StoreCustomer }) => {
  const [state, action] = useActionState(safeAccountAction(updateCustomerProfilePhone, { success: false, error: "Связь прервалась. Проверьте интернет и повторите сохранение." }), { success: false, error: null as string | null })
  const router = useRouter()
  useEffect(() => { if (state.success) router.refresh() }, [state, router])
  return <form action={action} className="w-full"><AccountInfo label="Телефон" currentInfo={customer.phone || "Не указан"} isSuccess={state.success} isError={Boolean(state.error)} errorMessage={state.error ?? undefined} clearState={() => {}} data-testid="account-phone-editor"><Input label="Телефон" name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={customer.phone ?? ""} data-testid="phone-input" /></AccountInfo></form>
}
export default ProfilePhone
