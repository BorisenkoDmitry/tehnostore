import { Metadata } from "next"
import Hero from "@modules/home/components/hero"
import StoreBenefits from "@modules/home/components/store-benefits"
import PopularProducts from "@modules/home/components/popular-products"
import AccessoryCollections from "@modules/home/components/accessory-collections"
import StoreStory from "@modules/home/components/store-story"
import StoreReviews from "@modules/home/components/store-reviews"
import { getSiteOrigin, STORE_NAME } from "@lib/util/site"
import { toJsonLd } from "@lib/util/product-structured-data"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ countryCode: string }> }): Promise<Metadata> {
  const { countryCode } = await params
  const origin = await getSiteOrigin()
  return {
    title: "TEXNO STORE — смартфоны и аксессуары",
    description: "Смартфоны и аксессуары в TEXNO STORE. Каталог техники, информация о доставке, гарантии и контакты магазина.",
    alternates: { canonical: `${origin}/${countryCode}` },
  }
}

export default async function Home() {
  const origin = await getSiteOrigin()
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd({ "@context": "https://schema.org", "@type": "Organization", name: STORE_NAME, url: origin }) }} />
    <Hero />
    <StoreBenefits />
    <PopularProducts />
    <AccessoryCollections />
    <StoreStory />
    <StoreReviews />
  </>
}
