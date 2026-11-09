import { Metadata } from "next"
import ContentHome from "@modules/home/templates/content-home"
import { getContentPage } from "@lib/data/content"
import { notFound } from "next/navigation"
import { getSiteOrigin, getStoreName } from "@lib/util/site"
import { toJsonLd } from "@lib/util/product-structured-data"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ countryCode: string }> }): Promise<Metadata> {
  const { countryCode } = await params
  const origin = await getSiteOrigin()
  const page = await getContentPage("home")
  return {
    title: page?.metadata.title || page?.title,
    description: page?.metadata.description,
    robots: page?.metadata.noindex ? { index: false, follow: true } : undefined,
    alternates: { canonical: `${origin}/${countryCode}` },
  }
}

export default async function Home() {
  const origin = await getSiteOrigin()
  const storeName = await getStoreName()
  const page = await getContentPage("home")
  if (!page) notFound()
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd({ "@context": "https://schema.org", "@type": "Organization", name: storeName, url: origin }) }} />
    <ContentHome page={page} />
  </>
}
