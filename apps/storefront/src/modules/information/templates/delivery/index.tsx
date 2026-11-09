import { getContentPage, getPageBlock, type ContentPage } from "@lib/data/content"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HeroRelief from "@modules/home/components/hero/hero-relief"
import InformationMotion from "@modules/information/components/page-motion"
import styles from "./delivery.module.css"
import { retrieveCartConfiguration } from "@lib/data/texno-cart"
import type { DeliveryMethod } from "@lib/data/texno-cart-types"

export default async function DeliveryPage({ content }: { content?: ContentPage } = {}) {
  const page = content ?? await getContentPage("delivery")
  const copy = getPageBlock<Record<string, string>>(page, "layout-copy") ?? {}
  const configuration = await retrieveCartConfiguration().catch(() => null)
  const known = ["moscow", "express", "metro", "outside_mkad", "pickup", "transport", "pickup_point", "none", "cdek"]
  const moscowRates = configuration?.delivery_methods.filter((method) => ["moscow", "express", "metro", "outside_mkad"].includes(method.id) || !known.includes(method.id)) ?? []
  const transport = configuration?.delivery_methods.find((method) => method.id === "transport")
  const cdek = configuration?.delivery_methods.find((method) => method.id === "cdek")
  const money = (price: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: configuration?.currency_code || "RUB", maximumFractionDigits: 2 }).format(price)
  const rateText = (rate?: DeliveryMethod) => !rate || rate.pricing === "unconfirmed" ? "Стоимость уточняется" : rate.pricing === "range" ? `${money(rate.min ?? 0)}–${money(rate.max ?? 0)}` : money(rate.price ?? 0)
  return (
    <InformationMotion className={styles.page}>
      <section className={`texno-hero texno-carousel ${styles.hero}`} aria-labelledby="delivery-title">
        <HeroRelief />
        <div className={`texno-container ${styles.heroInner}`}>
          <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
            <LocalizedClientLink href="/">{copy.text_001}</LocalizedClientLink>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{copy.text_002}</span>
          </nav>
          <div className={styles.heroGrid}>
            <div className={`texno-hero-content ${styles.heroCopy}`}>
              <h1 id="delivery-title" className="texno-slide-title">{copy.text_003}<br />{copy.text_004}</h1>
              <p className="texno-hero-description">{copy.text_005}<br />{copy.text_006}</p>
            </div>
            <picture className={styles.heroArtwork}>
              <source media="(max-width: 600px)" srcSet={copy.media_007_srcset} type="image/webp" />
              <img src={copy.media_008_src} alt={copy.media_009_alt} width="1400" height="1050" fetchPriority="high" />
            </picture>
          </div>
        </div>
      </section>

      <section className={`texno-section ${styles.moscow}`} aria-labelledby="delivery-moscow-title">
        <div className="texno-container">
          <div className="texno-section-heading" data-information-reveal>
            <h2 id="delivery-moscow-title">{copy.text_010}</h2>
          </div>
          <div className={styles.intro} data-information-reveal>
            <p>{copy.text_011}</p>
            <p className={styles.hours}>{copy.text_012}<strong>{copy.text_013}</strong></p>
          </div>
          <table className={styles.rates} data-information-reveal aria-label="Стоимость доставки по Москве и Московской области">
            <thead><tr><th scope="col">{copy.text_014}</th><th scope="col">{copy.text_015}</th></tr></thead>
            <tbody>{moscowRates.map((rate) => (
              <tr key={rate.id}>
                <th scope="row">{rate.label}</th>
                <td><strong>{rateText(rate)}</strong>{rate.pricing === "range" && <span className={styles.extra}>{copy.text_016}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className={styles.note} data-information-reveal>{configuration ? "Тарифы совпадают с расчётом в корзине. Стоимость доставки за МКАД и сроки согласовываются с менеджером." : "Тарифы временно недоступны. Уточните стоимость доставки у менеджера."}</p>
        </div>
      </section>

      {(transport || cdek) && <section className={`texno-section ${styles.russia}`} aria-labelledby="delivery-russia-title">
        <div className="texno-container">
          <div className="texno-section-heading" data-information-reveal><h2 id="delivery-russia-title">{copy.text_017}</h2></div>
          <div className={styles.russiaGrid}>
            {transport && <section className={styles.russiaOption} data-information-reveal>
              <h3>{copy.text_018}</h3>
              <p className={styles.russiaPrice}>{rateText(transport)}</p>
              <p className={styles.optionLead}>{copy.text_019}</p>
              <p>{copy.text_020}</p>
              <p>{copy.text_021}</p>
            </section>}
            {cdek && <section className={styles.russiaOption} data-information-reveal data-delay="1">
              <h3>{copy.text_022}</h3>
              <p className={styles.russiaPrice}>{rateText(cdek)}</p>
              <p className={styles.optionLead}>{copy.text_024}</p>
              <p>{copy.text_025}</p>
              <p>{copy.text_026}</p>
            </section>}
          </div>
        </div>
      </section>}

      <section className={`texno-section ${styles.payment}`} aria-labelledby="delivery-payment-title">
        <div className="texno-container">
          <div className="texno-section-heading" data-information-reveal><h2 id="delivery-payment-title">{copy.text_027}</h2></div>
          <ul className={styles.paymentMethods} data-information-reveal>
            <li>{copy.text_028}</li>
            <li>{copy.text_029}<span>{copy.text_030}</span></li>
          </ul>
          <p className={styles.paymentNote} data-information-reveal>{copy.text_031}</p>
        </div>
      </section>
    </InformationMotion>
  )
}
