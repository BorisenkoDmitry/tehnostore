import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Оформление заказа — TEXNO STORE",
}

export default async function Checkout({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  redirect(`/${countryCode}/cart`)
}
