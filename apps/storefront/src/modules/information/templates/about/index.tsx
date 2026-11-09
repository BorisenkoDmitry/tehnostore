import { getContentPage, getPageBlock, type ContentPage } from "@lib/data/content"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HeroRelief from "@modules/home/components/hero/hero-relief"
import {
  StoreIcon,
  type IconName,
} from "@modules/layout/components/storefront-shell/icons"
import InformationMotion from "@modules/information/components/page-motion"
import CompanyDetails from "@modules/information/components/company-details"
import styles from "./about.module.css"

/** The approved homepage is the visual system: shared blue, relief and type. */
export default async function AboutPage({ content }: { content?: ContentPage } = {}) {
  const page = content ?? await getContentPage("about-us")
  const copy = getPageBlock<Record<string, string>>(page, "layout-copy") ?? {}
  const benefits = getPageBlock<{ items: { title: string; icon: IconName; paragraphs: string[] }[] }>(page, "benefits")?.items ?? []
  return (
    <InformationMotion className={styles.page}>
      <section
        className={`texno-hero texno-carousel ${styles.hero}`}
        aria-labelledby="about-title"
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
              <h1 id="about-title" className="texno-slide-title">{copy.text_003}<br />{copy.text_004}</h1>
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

      <section
        id="about-store"
        className={`texno-section ${styles.story}`}
        aria-labelledby="about-store-title"
      >
        <div className="texno-container">
          <div className="texno-rich-content">
            <div className="texno-story-row has-artwork">
              <h2 id="about-store-title" data-information-reveal>{copy.text_010}</h2>
              <div className="texno-story-row-copy" data-information-reveal>
                <p>{copy.text_011}</p>
                <p>{copy.text_012}</p>
              </div>
              <figure data-information-reveal data-delay="1">
                <Image
                src={copy.media_013_src}
                alt={copy.media_014_alt}
                width={1774}
                height={887}
                  sizes="(max-width: 900px) 100vw, 48vw"
                  loading="lazy"
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`texno-section ${styles.advantages}`}
        aria-labelledby="about-benefits-title"
      >
        <div className="texno-container">
          <div className="texno-section-heading">
            <h2 id="about-benefits-title" data-information-reveal>{copy.text_015}</h2>
          </div>
          <div className={styles.benefitGrid}>
            {benefits.map((benefit) => (
              <section
                className={styles.benefit}
                key={benefit.title}
                data-information-reveal
              >
                <StoreIcon name={benefit.icon} className="texno-benefit-icon" />
                <div>
                  <h3>{benefit.title}</h3>
                  {benefit.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <CompanyDetails />
    </InformationMotion>
  )
}
