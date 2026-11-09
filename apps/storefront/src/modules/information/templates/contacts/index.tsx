import { getContentPage, getPageBlock, getSiteSettings, type ContentPage } from "@lib/data/content"
import { StoreIcon, type IconName } from "@modules/layout/components/storefront-shell/icons"
import CompanyDetails from "@modules/information/components/company-details"
import EmailForm from "./email-form"
import { getPublishedLegalDocuments } from "@lib/data/legal-documents"
import styles from "./contacts.module.css"

const departmentIcons: IconName[] = ["bag", "shield", "chat"]

/** The approved white review-page surface. Contacts left, compose form right.
 * Requisites use the unchanged shared About block and canonical company data.
 */
export default async function ContactsPage({ content, countryCode }: { content?: ContentPage; countryCode: string }) {
  const page = content ?? await getContentPage("contacts")
  const copy = getPageBlock<Record<string, string>>(page, "layout-copy") ?? {}
  const [settings, documents] = await Promise.all([getSiteSettings(), getPublishedLegalDocuments(countryCode)])
  const contacts = settings.contacts
  if (!contacts) return null
  return (
    <article className={styles.page}>
      <section className={`texno-section texno-reviews-page ${styles.main}`} aria-labelledby="contacts-title">
        <div className="texno-container">
          <div className="texno-section-heading"><h1 id="contacts-title">{copy.text_001}</h1></div>
          <div className={styles.mainGrid}>
            <div className={styles.departments}>
              {contacts.departments.map((department, index) => (
                <section key={department.extension} className={styles.department} aria-labelledby={`department-${department.extension}`}>
                  <div className={styles.departmentHeading}>
                    <StoreIcon name={departmentIcons[index] ?? "chat"} />
                    <h2 id={`department-${department.extension}`}>{department.name}</h2>
                  </div>
                  <div className={styles.departmentBody}>
                    <div className={styles.contactLinks}>
                      <a href={`tel:${contacts.phoneUri};ext=${department.extension}`}>
                        <StoreIcon name="phone" />
                        <span>{contacts.phone} <span className={styles.extension}>{copy.text_002}{department.extension}</span></span>
                      </a>
                      <a href={`mailto:${contacts.email}`}><StoreIcon name="mail" /><span>{contacts.email}</span></a>
                    </div>
                    <div className={styles.hours}>
                      <h3><StoreIcon name="clock" /><span>{copy.text_003}</span></h3>
                      <dl className={styles.schedule}>
                        <div><dt>{copy.text_004}</dt><dd>{department.weekdays}</dd></div>
                        <div><dt>{copy.text_005}</dt><dd>{department.weekend}</dd></div>
                      </dl>
                    </div>
                  </div>
                </section>
              ))}
            </div>
            <section className={styles.formPanel} aria-labelledby="contacts-form-title">
              <div className={styles.formHeading}>
                <StoreIcon name="mail" />
                <h2 id="contacts-form-title">{copy.text_006}</h2>
              </div>
              <EmailForm contactEmail={contacts.email} documents={documents} />
            </section>
          </div>
        </div>
      </section>
      <CompanyDetails idPrefix="contacts" />
    </article>
  )
}
