import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import ProfilePhone from "@modules/account/components/profile-phone"
import ProfileEmail from "@modules/account/components/profile-email"
import ProfileName from "@modules/account/components/profile-name"
import ProfilePassword from "@modules/account/components/profile-password"
export const metadata: Metadata = { title: "Личные данные", robots: { index: false, follow: false } }
export default async function Profile() {
  const customer = await retrieveCustomer()
  if (!customer) notFound()
  return <div className="w-full" data-testid="profile-page-wrapper"><div className="mb-10 flex flex-col gap-4"><h1>Личные данные</h1><p className="leading-relaxed text-ui-fg-subtle">Измените контакты или данные для входа. Адреса доставки сохраняются в разделе «Адреса».</p></div><div className="flex flex-col divide-y divide-gray-200 [&>form]:py-7 [&>form:first-child]:pt-0"><ProfileName customer={customer} /><ProfileEmail customer={customer} /><ProfilePhone customer={customer} /><ProfilePassword customer={customer} /></div></div>
}
