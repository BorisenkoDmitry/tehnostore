import { notFound, redirect } from "next/navigation"
import { getPublishedLegalDocuments } from "@lib/data/legal-documents"

export default async function LegalPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  const { offer, terms } = await getPublishedLegalDocuments(countryCode)
  const document = offer || terms
  if (!document) notFound()
  redirect(document)
}
