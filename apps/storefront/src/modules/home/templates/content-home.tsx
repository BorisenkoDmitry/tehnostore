import type { ContentPage } from "@lib/data/content"
import Hero, { type HeroSlide } from "@modules/home/components/hero"
import StoreBenefits from "@modules/home/components/store-benefits"
import PopularProducts, { type PopularData } from "@modules/home/components/popular-products"
import AccessoryCollections, { type AccessoryData } from "@modules/home/components/accessory-collections"
import StoreStory, { type StoryData } from "@modules/home/components/store-story"
import StoreReviews from "@modules/home/components/store-reviews"
import ContentBody from "@modules/information/components/content-body"
import type { IconName } from "@modules/layout/components/storefront-shell/icons"
import { getCatalogConfig } from "@lib/data/catalog"
import ContentBlocks from "@modules/information/components/content-body/blocks"

export default async function ContentHome({ page }: { page: ContentPage }) {
  const config = await getCatalogConfig()
  const categoryHref = (id?: string) => { const category = config?.categories.find((item) => item.id === id); return category ? `/store?category=${encodeURIComponent(category.handle)}` : undefined }
  const hasStory = page.blocks.some((block) => block.enabled && block.type === "story")
  const hasHero = page.blocks.some((block) => block.enabled && block.type === "hero" && Array.isArray(block.data.slides) && block.data.slides.length)
  return <>{!hasStory && <div className={hasHero ? "sr-only" : "texno-container texno-section"}><div className="texno-section-heading"><h1>{page.title}</h1></div></div>}{[...page.blocks].filter((block) => block.enabled).sort((a, b) => a.order - b.order).map((block) => {
    if (block.type === "hero") { const data = block.data as { slides: HeroSlide[] }; return data.slides?.length ? <Hero key={block.id} slides={data.slides.map((slide) => ({ ...slide, href: categoryHref(slide.category_id) }))} /> : null }
    if (block.type === "benefits") return <StoreBenefits key={block.id} items={(block.data as { items: { icon: IconName; title: string; detail: string }[] }).items ?? []} />
    if (block.type === "popular") return <PopularProducts key={block.id} {...block.data as PopularData} />
    if (block.type === "accessories") { const data = block.data as AccessoryData; return <AccessoryCollections key={block.id} {...data} items={(data.items ?? []).map((item) => ({ ...item, href: categoryHref(item.category_id) ?? item.href }))} /> }
    if (block.type === "story") return <StoreStory key={block.id} {...block.data as StoryData} />
    if (block.type === "reviews") return <StoreReviews key={block.id} {...block.data as { title: string; link_label: string }} />
    if (block.type === "text") return <section key={block.id} className="texno-section"><div className="texno-container"><ContentBlocks blocks={[block]} /></div></section>
    return null
  })}{page.body.length > 0 && <section className="texno-section"><div className="texno-container"><ContentBody nodes={page.body} /></div></section>}</>
}
