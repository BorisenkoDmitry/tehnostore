import { notFound, redirect } from "next/navigation"
import { getPublishedLegalDocuments } from "@lib/data/legal-documents"

export default async function LegalPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  const { privacy } = await getPublishedLegalDocuments(countryCode)
  if (!privacy) notFound()
  redirect(privacy)
}
