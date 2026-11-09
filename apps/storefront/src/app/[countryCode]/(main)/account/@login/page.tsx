import { Metadata } from "next"

import { getPublishedLegalDocuments } from "@lib/data/legal-documents"
import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Личный кабинет",
  robots: { index: false, follow: false },
}

export default async function Login({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  const { consent, terms } = await getPublishedLegalDocuments(countryCode)
  return <LoginTemplate consentUrl={consent} termsUrl={terms} />
}
