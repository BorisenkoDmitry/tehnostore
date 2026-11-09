import CopyCompanyDetails from "@modules/information/components/copy-company-details"
import { getSiteSettings } from "@lib/data/content"
import styles from "./company-details.module.css"

/** The approved About requisites block, shared without visual or data changes. */
export default async function CompanyDetails({ idPrefix = "about" }: { idPrefix?: string }) {
  const company = (await getSiteSettings()).company
  if (!company) return null
  const companyDetails = `${company.name}\nИНН/КПП: ${company.inn}/${company.kpp}\nОГРН: ${company.ogrn}\nЮридический адрес: ${company.address}\nЭлектронная почта для обращений: ${company.email}`
  return (
      <section
        className={`texno-section ${styles.details}`}
        aria-labelledby={`${idPrefix}-details-title`}
      >
        <div className="texno-container">
          <div className={styles.detailsHeading}>
            <div className="texno-section-heading">
              <h2 id={`${idPrefix}-details-title`}>Реквизиты</h2>
            </div>
            <p>{company.name}</p>
          </div>
          <dl className={styles.detailList}>
            <div>
              <dt>ИНН / КПП</dt>
              <dd>
                {company.inn} / {company.kpp}
              </dd>
            </div>
            <div>
              <dt>ОГРН</dt>
              <dd>{company.ogrn}</dd>
            </div>
            <div>
              <dt>Юридический адрес</dt>
              <dd>{company.address}</dd>
            </div>
            <div>
              <dt>Электронная почта для обращений</dt>
              <dd>
                <a href={`mailto:${company.email}`}>{company.email}</a>
              </dd>
            </div>
          </dl>
          <div className={styles.detailsBottom}>
            <p className={styles.published}>
              Дата публикации — <time dateTime={company.published_date}>{company.published_date ? new Date(company.published_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : ""} г.</time>
            </p>
            <CopyCompanyDetails className={styles.copyButton} details={companyDetails} />
          </div>
        </div>
      </section>
  )
}
