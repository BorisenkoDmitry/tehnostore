import { Metadata } from "next"
import { getSiteOrigin, STORE_NAME } from "@lib/util/site"

export async function getFaqMetadata(countryCode: string): Promise<Metadata> {
  const url = `${await getSiteOrigin()}/${countryCode}/page/faq`
  const title = "Вопрос-ответ: о смартфонах и ценах — TEXNO STORE"
  const description =
    "Ответы TEXNO STORE на вопросы об оригинальности смартфонов, низких ценах и устройствах «как новый»: проверка поставок, Trade-In, диагностика и восстановление."

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: STORE_NAME,
      title,
      description,
      url,
    },
    twitter: { card: "summary", title, description },
  }
}
