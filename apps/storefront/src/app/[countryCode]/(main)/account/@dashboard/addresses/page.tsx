import { Metadata } from "next"
import { notFound } from "next/navigation"
import AddressBook from "@modules/account/components/address-book"
import { getRegion } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveCartConfiguration } from "@lib/data/texno-cart"
export const metadata: Metadata = { title: "Адреса доставки", robots: { index: false, follow: false } }
export default async function Addresses() {
  const [customer, configuration] = await Promise.all([retrieveCustomer(), retrieveCartConfiguration().catch(() => null)])
  if (!customer) notFound()
  const countryCode = configuration?.country_code
  const region = countryCode ? await getRegion(countryCode) : null
  if (!region) return <div data-testid="addresses-page-wrapper"><h1 className="mb-5">Адреса доставки</h1><p role="status">Не удалось загрузить параметры доставки. Обновите страницу и повторите попытку.</p></div>
  const names = new Intl.DisplayNames(["ru"], { type: "region" })
  const displayRegion = { ...region, countries: region.countries?.filter(country => country.iso_2 === countryCode).map(country => ({ ...country, display_name: country.iso_2 ? names.of(country.iso_2.toUpperCase()) ?? country.display_name : country.display_name })) }
  return <div className="w-full" data-testid="addresses-page-wrapper"><div className="mb-8 flex flex-col gap-4"><h1>Адреса доставки</h1><p className="leading-relaxed text-ui-fg-subtle">Сохраните адрес, чтобы выбрать его при оформлении заказа. Адрес по умолчанию подставится автоматически.</p></div><AddressBook customer={customer} region={displayRegion} /></div>
}
