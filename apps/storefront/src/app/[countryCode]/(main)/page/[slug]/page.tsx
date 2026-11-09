import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getContentPage, getContentPreview } from "@lib/data/content"
import { getSiteOrigin, getStoreName } from "@lib/util/site"
import ContentBody from "@modules/information/components/content-body"
import ContentBlocks from "@modules/information/components/content-body/blocks"
import ContentHome from "@modules/home/templates/content-home"
import { ReviewsList } from "@modules/home/components/store-reviews"
import AboutPage from "@modules/information/templates/about"
import DeliveryPage from "@modules/information/templates/delivery"
import WarrantyPage from "@modules/information/templates/warranty"
import ContactsPage from "@modules/information/templates/contacts"
import FaqPage from "@modules/information/templates/faq"

type Props = { params: Promise<{ slug: string; countryCode: string }>; searchParams: Promise<{ preview?: string }> }
export const dynamic = "force-dynamic"
async function load(props: Props) {
  const [{ slug }, { preview }] = await Promise.all([props.params, props.searchParams])
  const page = preview ? await getContentPreview(preview) : await getContentPage(slug)
  if (!page || page.slug !== slug) notFound()
  return { page, preview: Boolean(preview) }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [{ page, preview }, { countryCode }, origin] = await Promise.all([load(props), props.params, getSiteOrigin()])
  return {
    title: page.metadata.title || `${page.title} — ${await getStoreName()}`, description: page.metadata.description || undefined,
    alternates: { canonical: page.metadata.canonical || (page.slug === "home" ? `${origin}/${countryCode}` : `${origin}/${countryCode}/page/${page.slug}`) },
    robots: preview || page.metadata.noindex ? { index: false, follow: !preview } : undefined,
    openGraph: page.metadata.image ? { images: [page.metadata.image] } : undefined,
  }
}

export default async function InformationPage(props: Props) {
  const [{ page, preview }, { countryCode }] = await Promise.all([load(props), props.params])
  const houseLayout = page.blocks.some((block) => block.enabled && block.type === "layout-copy")
  const layout = page.slug === "home" ? <ContentHome page={page} /> : !houseLayout ? null : page.slug === "about-us" ? <AboutPage content={page} />
    : page.slug === "delivery" ? <DeliveryPage content={page} />
    : page.slug === "warranty" ? <WarrantyPage content={page} />
    : page.slug === "contacts" ? <ContactsPage content={page} countryCode={countryCode} />
    : page.slug === "faq" ? <FaqPage content={page} /> : null
  return <>
    {preview && <div role="status" className="texno-container" style={{ paddingBlock: 16 }}>Предпросмотр черновика. Изменения ещё не опубликованы.</div>}
    {layout}
    {page.slug !== "home" && (!layout || page.body.length > 0 || page.blocks.some((block) => block.enabled && block.type === "text")) && <section className="texno-section texno-reviews-page"><div className="texno-container">
      {!layout && <div className="texno-section-heading"><h1>{page.title}</h1></div>}
      <ContentBody nodes={page.body} />
      {page.slug !== "home" && <ContentBlocks blocks={page.blocks} />}
      {page.slug === "reviews" && <ReviewsList />}
    </div></section>}
  </>
}
