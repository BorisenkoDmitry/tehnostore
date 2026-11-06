import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getNavigation } from "@lib/data/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ReviewsList } from "@modules/home/components/store-reviews"

export const metadata: Metadata = { robots: { index: false, follow: true } }

export default async function InformationPlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const navigation = await getNavigation()
  const item = navigation?.items.find((entry) => entry.kind === "link" && entry.href === `/page/${slug}`)
  if (!item) notFound()
  if (slug === "reviews") return <section className="texno-section texno-reviews-page"><div className="texno-container">
    <LocalizedClientLink href="/" className="texno-text-link">На главную</LocalizedClientLink>
    <div className="texno-section-heading"><h1>Отзывы покупателей</h1></div>
    <ReviewsList />
  </div></section>
  return <section className="texno-information">
    <LocalizedClientLink href="/" className="texno-back-link">← На главную</LocalizedClientLink>
    <h1>{item.label}</h1><p>Содержимое этого раздела готовится.</p>
    {slug === "contacts" && navigation && <div className="texno-information-contacts"><a href={`tel:${navigation.phone.replace(/[^+\d]/g, "")}`}>{navigation.phone}</a><a href={navigation.telegram_url} target="_blank" rel="noopener noreferrer">Написать в Telegram ↗</a></div>}
  </section>
}
