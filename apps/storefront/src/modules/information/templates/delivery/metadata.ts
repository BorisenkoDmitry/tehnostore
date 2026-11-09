import type { Metadata } from "next"

export function getDeliveryMetadata(countryCode: string): Metadata {
  const title = "Доставка и оплата в Москве и по России — TEXNO STORE"
  const description = "Доставка TEXNO STORE по Москве, Московской области и России: актуальные тарифы, интервалы получения и согласование условий. Заказ без оплаты на сайте."
  const url = `/${countryCode}/page/delivery`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "ru_RU",
      siteName: "TEXNO STORE",
      images: [{ url: "/images/delivery/delivery-packaging.webp", width: 1400, height: 1050, alt: "Смартфон в защитной упаковке и посылка с синей лентой" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/images/delivery/delivery-packaging.webp"] },
  }
}
