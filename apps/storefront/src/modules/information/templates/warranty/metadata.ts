import type { Metadata } from "next"
import { getSiteOrigin } from "@lib/util/site"

export async function getWarrantyMetadata(countryCode: string): Promise<Metadata> {
  const origin = await getSiteOrigin()
  const url = `${origin}/${countryCode}/page/warranty`
  const title = "Гарантия и возврат — условия обслуживания | TEXNO STORE"
  const description = "Гарантия и возврат в TEXNO STORE: условия обмена товара в течение 14 рабочих дней, бесплатное гарантийное обслуживание и контакты службы контроля качества."
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "TEXNO STORE",
      locale: "ru_RU",
      images: [{
        url: `${origin}/images/warranty/warranty-service.webp`,
        width: 1400,
        height: 1050,
        alt: "Иллюстрация диагностики смартфона — гарантия и сервис TEXNO STORE",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/images/warranty/warranty-service.webp`],
    },
  }
}
