"use client"

import { useState } from "react"
import Image from "next/image"
import StoreButton from "@modules/common/components/store-button"
import styles from "../product-details/product-details.module.css"

// Supply only published reviews belonging to this product when a review source is connected.
export type ProductReview = {
  id: string
  productId: string
  author: string
  date: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  photos?: { url: string; alt: string }[]
}

function Stars({ rating }: { rating: number }) {
  return <span className={styles.stars} role="img" aria-label={`${rating.toLocaleString("ru-RU")} из 5`}>
    {Array.from({ length: 5 }, (_, index) => <svg key={index} viewBox="0 0 24 24" aria-hidden="true" data-filled={index < Math.round(rating)}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z" /></svg>)}
  </span>
}

export function ProductReviewCard({ review }: { review: ProductReview }) {
  return <article className={styles.reviewCard}>
    <header><div><h3>{review.author}</h3><time dateTime={review.date}>{new Date(review.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" })}</time></div><Stars rating={review.rating} /></header>
    <p>{review.text}</p>
    {!!review.photos?.length && <div className={styles.reviewPhotos}>{review.photos.map((photo, index) => <a key={`${photo.url}-${index}`} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть фото: ${photo.alt}`}><Image src={photo.url} alt={photo.alt} width={88} height={112} loading="lazy" /></a>)}</div>}
  </article>
}

export default function ProductReviews({ productId, reviews }: { productId: string; reviews: ProductReview[] }) {
  const [expanded, setExpanded] = useState(false)
  const productReviews = reviews.filter((review) => review.productId === productId)
  const photos = productReviews.flatMap((review) => review.photos ?? [])
  const average = productReviews.length ? productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length : null

  return <section aria-labelledby="product-reviews-heading" data-testid="product-reviews">
    <h2 id="product-reviews-heading">Оценки{productReviews.length > 0 && <sup>{productReviews.length}</sup>}</h2>
    {average === null ? <div className={styles.emptyReviews}><h3>У этого товара пока нет отзывов</h3><p>Здесь появятся оценки, фотографии и впечатления покупателей об этом товаре.</p></div> : <>
      <div className={styles.reviewSummary}><strong>{average.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</strong><Stars rating={average} /><span>Оценок: {productReviews.length}</span></div>
      {photos.length > 0 && <div className={styles.reviewPhotos} aria-label="Фотографии покупателей">{photos.map((photo, index) => <a key={`${photo.url}-${index}`} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть фото: ${photo.alt}`}><Image src={photo.url} alt={photo.alt} width={88} height={112} loading="lazy" /></a>)}</div>}
      <div className={styles.reviewGrid} id="product-review-cards">{(expanded ? productReviews : productReviews.slice(0, 3)).map((review) => <ProductReviewCard key={review.id} review={review} />)}</div>
      {!expanded && productReviews.length > 3 && <StoreButton fill="blue" onClick={() => setExpanded(true)}>Смотреть все отзывы</StoreButton>}
    </>}
  </section>
}
