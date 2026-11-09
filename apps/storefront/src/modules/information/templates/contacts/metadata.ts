import type { Metadata } from "next"
import { getSiteOrigin } from "@lib/util/site"

export async function getContactsMetadata(countryCode: string): Promise<Metadata> {
  const title = "Контакты TEXNO STORE — телефон, почта и реквизиты"
  const description = "Контакты TEXNO STORE: +7 (495) 104-59-90, info@texno.store. Часы работы отдела продаж, службы качества и оптовых закупок. Реквизиты ООО «АУРА»."
  const url = `${await getSiteOrigin()}/${countryCode}/page/contacts`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "TEXNO STORE",
      type: "website",
      locale: "ru_RU",
    },
    twitter: { card: "summary", title, description },
  }
}
