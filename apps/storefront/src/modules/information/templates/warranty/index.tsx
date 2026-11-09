import { getContentPage, getPageBlock, type ContentPage } from "@lib/data/content"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HeroRelief from "@modules/home/components/hero/hero-relief"
import InformationMotion from "@modules/information/components/page-motion"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import styles from "./warranty.module.css"

/** Merchant wording transcribed from the supplied warranty screenshot. */
export default async function WarrantyPage({ content }: { content?: ContentPage } = {}) {
  const page = content ?? await getContentPage("warranty")
  const copy = getPageBlock<Record<string, string>>(page, "layout-copy") ?? {}
  return (
    <InformationMotion className={styles.page}>
      <section
        className={`texno-hero texno-carousel ${styles.hero}`}
        aria-labelledby="warranty-title"
      >
        <HeroRelief />
        <div className={`texno-container ${styles.heroInner}`}>
          <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
            <LocalizedClientLink href="/">{copy.text_001}</LocalizedClientLink>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{copy.text_002}</span>
          </nav>
          <div className={styles.heroGrid}>
            <div className={`texno-hero-content ${styles.heroCopy}`}>
              <h1 id="warranty-title" className="texno-slide-title">{copy.text_003}<br />{copy.text_004}</h1>
              <p className="texno-hero-description">{copy.text_005}<br />{copy.text_006}</p>
            </div>
            <picture className={styles.heroArtwork}>
              <source
                media="(max-width: 600px)"
                srcSet={copy.media_007_srcset}
                type="image/webp"
              />
              <img
                src={copy.media_008_src}
                alt={copy.media_009_alt}
                width="1400"
                height="1050"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </section>

      <div className={`texno-container ${styles.policies}`}>
        <section id="warranty-policy" className={styles.policy} aria-labelledby="warranty-policy-title" data-information-reveal>
          <StoreIcon name="shield" className={styles.policyIcon} />
          <h2 id="warranty-policy-title">{copy.text_010}</h2>
          <div className={styles.copy}>
            <p>{copy.text_011}</p>
            <p>{copy.text_012}</p>
          </div>
        </section>

        <section id="warranty-returns" className={styles.policy} aria-labelledby="warranty-returns-title" data-information-reveal data-delay="1">
          <StoreIcon name="arrow" className={styles.policyIcon} />
          <h2 id="warranty-returns-title">{copy.text_013}</h2>
          <div className={styles.copy}>
            <p>{copy.text_014}<strong>{copy.text_015}</strong>{copy.text_016}</p>
          </div>
        </section>

        <section id="warranty-service" className={styles.policy} aria-labelledby="warranty-service-title" data-information-reveal>
          <StoreIcon name="clock" className={styles.policyIcon} />
          <h2 id="warranty-service-title">{copy.text_017}</h2>
          <div className={styles.copy}>
            <p>{copy.text_018}</p>
            <p>{copy.text_019}</p>
          </div>
        </section>

        <section id="warranty-conditions" className={styles.policy} aria-labelledby="warranty-conditions-title" data-information-reveal data-delay="1">
          <StoreIcon name="info" className={styles.policyIcon} />
          <h2 id="warranty-conditions-title">{copy.text_020}</h2>
          <div className={styles.copy}>
            <p>{copy.text_021}<a href="https://texno.store/page/warranty" aria-label="Здесь: подробные условия бесплатного гарантийного обслуживания на texno.store">{copy.text_022}</a>{copy.text_023}</p>
          </div>
        </section>
      </div>

      <section id="warranty-quality" className={`texno-section ${styles.quality}`} aria-labelledby="warranty-quality-title">
        <div className={`texno-container ${styles.qualityGrid}`}>
          <div className="texno-section-heading">
            <h2 id="warranty-quality-title" data-information-reveal>{copy.text_024}</h2>
          </div>
          <div className={styles.qualityDetails} data-information-reveal data-delay="1">
            <dl className={styles.contacts}>
              <div>
                <dt>{copy.text_025}</dt>
                <dd><a href="tel:+74951045990">{copy.text_026}</a> <span>{copy.text_027}</span></dd>
              </div>
              <div>
                <dt>{copy.text_028}</dt>
                <dd><a href="mailto:help@texno-sale.ru">{copy.text_029}</a></dd>
              </div>
            </dl>
            <div className={styles.schedule}>
              <h3>{copy.text_030}</h3>
              <p>{copy.text_031}</p>
              <p>{copy.text_032}</p>
            </div>
          </div>
        </div>
      </section>
    </InformationMotion>
  )
}
