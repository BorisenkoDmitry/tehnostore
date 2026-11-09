import { getContentPage, getPageBlock, type ContentPage } from "@lib/data/content"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HeroRelief from "@modules/home/components/hero/hero-relief"
import InformationMotion from "@modules/information/components/page-motion"
import styles from "./faq.module.css"

/** Read-first FAQ in the approved store system; native controls work without JS. */
export default async function FaqPage({ content }: { content?: ContentPage } = {}) {
  const page = content ?? await getContentPage("faq")
  const copy = getPageBlock<Record<string, string>>(page, "layout-copy") ?? {}
  const faqItems = getPageBlock<{ items: { id: string; question: string; answer: string }[] }>(page, "questions")?.items ?? []
  return (
    <InformationMotion className={styles.page}>
      <section
        className={`texno-hero texno-carousel ${styles.hero}`}
        aria-labelledby="faq-title"
      >
        <HeroRelief />
        <div className={`texno-container ${styles.heroInner}`}>
          <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
            <LocalizedClientLink href="/">{copy.text_001}</LocalizedClientLink>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{copy.text_002}</span>
          </nav>
          <div className={`texno-hero-content ${styles.heroCopy}`}>
            <h1 id="faq-title" className="texno-slide-title">{copy.text_003}</h1>
            <p className="texno-hero-description">{copy.text_004}<br className={styles.desktopBreak} />{copy.text_005}</p>
          </div>
        </div>
      </section>

      <section className={`texno-section ${styles.answers}`} aria-label="Вопросы о смартфонах">
        <div className="texno-container">
          <div className={styles.list}>
            {faqItems.map(({ id, question, answer }) => (
              <details key={id} open className={styles.item} data-information-reveal>
                <summary className={styles.question} aria-controls={`faq-answer-${id}`}>
                  <h2 id={`faq-question-${id}`}>{question}</h2>
                  <span className={styles.indicator} aria-hidden="true" />
                </summary>
                <div id={`faq-answer-${id}`} className={styles.answer}>
                  <p>{answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </InformationMotion>
  )
}
