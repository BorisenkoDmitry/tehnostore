import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"
import "styles/texno.css"
import "styles/catalog.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-mode="light">
      <head>
        <link rel="ucp" href="/.well-known/ucp" />
      </head>
      <body>
        <noscript><p style={{ padding: "16px 20px", fontSize: "14px", lineHeight: 1.6 }}>Для просмотра корзины и оформления заказа включите JavaScript в браузере.</p></noscript>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
