import source from "../../data/source-preview.json"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"

type Review = (typeof source.reviews)[number]

function ReviewCard({ review }: { review: Review }) {
  const [day, month, year] = review.date.split(".")
  return <li><figure className="texno-review-card">
    <figcaption><span className="texno-review-avatar" aria-hidden="true">{review.initials}</span><div><span className="texno-review-name">{review.name}</span><time dateTime={`${year}-${month}-${day}`}>{review.date}</time></div></figcaption>
    <span className="texno-review-stars" role="img" aria-label={`Оценка ${review.rating} из 5`}>{Array.from({ length: 5 }, (_, index) => <svg key={index} viewBox="0 0 20 20" aria-hidden="true" className={index < review.rating ? "is-filled" : ""}><path d="m10 2 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" /></svg>)}</span>
    <blockquote>{review.text}</blockquote>
  </figure></li>
}

export function ReviewsList({ limit }: { limit?: number }) {
  const reviews = limit === undefined ? source.reviews : source.reviews.slice(0, limit)
  return <ul className="texno-review-grid">{reviews.map((review) => <ReviewCard key={`${review.name}-${review.date}`} review={review} />)}</ul>
}

export default function StoreReviews() {
  return <section id="reviews" className="texno-reviews texno-section" aria-labelledby="reviews-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="reviews-heading">Отзывы покупателей</h2></div>
      <ReviewsList limit={3} />
      <div className="texno-all-reviews"><LocalizedClientLink href="/page/reviews" className="texno-text-link">Все отзывы <StoreIcon name="arrow" /></LocalizedClientLink></div>
    </div>
  </section>
}
