import { getContentReviews } from "@lib/data/content"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"

type Review = { id: string; date: string; name: string; initials: string; rating: number; text: string }

function ReviewCard({ review }: { review: Review }) {
  const [day, month, year] = review.date.split(".")
  return <li><figure className="texno-review-card">
    <figcaption><span className="texno-review-avatar" aria-hidden="true">{review.initials}</span><div><span className="texno-review-name">{review.name}</span><time dateTime={`${year}-${month}-${day}`}>{review.date}</time></div></figcaption>
    <span className="texno-review-stars" role="img" aria-label={`Оценка ${review.rating} из 5`}>{Array.from({ length: 5 }, (_, index) => <svg key={index} viewBox="0 0 20 20" aria-hidden="true" className={index < review.rating ? "is-filled" : ""}><path d="m10 2 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" /></svg>)}</span>
    <blockquote>{review.text}</blockquote>
  </figure></li>
}

export async function ReviewsList({ limit }: { limit?: number }) {
  const entries = await getContentReviews("shop", undefined, limit)
  const reviews = entries.map((review) => ({ id: review.id, name: review.author, initials: review.author.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""), rating: review.rating, text: review.body, date: /^\d{4}-\d{2}-\d{2}/.test(review.review_date) ? new Date(review.review_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : review.review_date }))
  return <ul className="texno-review-grid">{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</ul>
}

export default function StoreReviews({ title, link_label }: { title: string; link_label: string }) {
  return <section id="reviews" className="texno-reviews texno-section" aria-labelledby="reviews-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="reviews-heading">{title}</h2></div>
      <ReviewsList limit={3} />
      <div className="texno-all-reviews"><LocalizedClientLink href="/page/reviews" className="texno-text-link">{link_label} <StoreIcon name="arrow" /></LocalizedClientLink></div>
    </div>
  </section>
}
