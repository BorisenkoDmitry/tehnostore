import { redirectToPublishedPage } from "@lib/data/content-alias"

export default async function ContactPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  return redirectToPublishedPage(countryCode, ["contacts", "contact"])
}
