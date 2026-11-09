import { retrieveTexnoCart } from "@lib/data/texno-cart"
import TexnoCart from "@modules/cart/components/texno-cart"
import { Metadata } from "next"
import { retrieveCustomer } from "@lib/data/customer"
import { getStoreName } from "@lib/util/site"
import { getPublishedLegalDocuments } from "@lib/data/legal-documents"

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Корзина — ${await getStoreName()}`, description: "Товары, доставка и оформление заказа.", robots: { index: false, follow: false } }
}

export default async function Cart({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  const [customer, result, documents] = await Promise.all([
    retrieveCustomer(), retrieveTexnoCart().then((state) => ({ state, loadError: false })).catch(() => ({ state: null, loadError: true })), getPublishedLegalDocuments(countryCode),
  ])
  return <TexnoCart initialState={result.state} loadError={result.loadError} documents={documents} customer={customer ? { id: customer.id, first_name: customer.first_name ?? null, last_name: customer.last_name ?? null, email: customer.email, phone: customer.phone ?? null, addresses: (customer.addresses ?? []).map((address) => ({ id: address.id, address_1: address.address_1 ?? null, address_2: address.address_2 ?? null, city: address.city ?? null, postal_code: address.postal_code ?? null, country_code: address.country_code ?? null, is_default_shipping: address.is_default_shipping })) } : null} />
}
