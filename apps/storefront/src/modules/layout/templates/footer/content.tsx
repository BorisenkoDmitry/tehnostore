import Image from "next/image"
import type { ReactNode } from "react"
import type { SiteNavigation } from "@lib/data/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "./footer.module.css"

type FooterItem = { label: string; href?: string; page_slug?: string; category_id?: string; navigation_node_id?: string; enabled: boolean }
export type FooterSettings = {
  brand?: { name: string; logo_url?: string; logo_alt?: string }
  contacts?: { phone?: unknown; email?: unknown }
  social?: { label: string; url: string; enabled: boolean }[]
  footer?: { text?: string; columns?: { title: string; items: FooterItem[] }[] }
  footer_display?: {
    phone_label?: string; email_label?: string; logo_src?: string; logo_alt?: string
    copyright_prefix?: string; unavailable_social_label?: string
    payment_logos?: { src: string; alt: string; width: number; height: number }[]
  }
}

// CMS values never become unchecked href/src attributes.
function webUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null } catch { return null }
}
function localUrl(value: string) {
  return /^\/(?!\/)[^\\\s]*$/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ? value : null
}
function mediaUrl(value?: string) {
  if (!value) return null
  if (localUrl(value)) return value
  try {
    const url = new URL(value)
    return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ? url.href : null
  } catch { return null }
}
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  if (localUrl(href)) return <LocalizedClientLink href={href}>{children}</LocalizedClientLink>
  const safe = webUrl(href)
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a> : null
}

export default function FooterContent({ settings, navigation, categories }: { settings: FooterSettings; navigation: SiteNavigation | null; categories: { id: string; handle: string }[] }) {
  const display = settings.footer_display ?? {}
  const phone = typeof settings.contacts?.phone === "string" ? settings.contacts.phone : navigation?.phone
  const email = typeof settings.contacts?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contacts.email) ? settings.contacts.email : null
  const nodes = navigation?.items.flatMap((item) => item.kind === "catalog" ? item.children ?? [] : []) ?? []
  function itemHref(item: FooterItem) {
    const nodeId = item.navigation_node_id ?? categories.find((category) => category.id === item.category_id)?.handle
    if (nodeId) return nodes.some((node) => node.id === nodeId && node.visible) ? `/store?category=${encodeURIComponent(nodeId)}` : null
    if (item.page_slug) return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.page_slug) ? `/page/${item.page_slug}` : null
    return item.href && (localUrl(item.href) || webUrl(item.href))
  }
  const columns = settings.footer?.columns ?? []
  const logo = mediaUrl(display.logo_src) || mediaUrl(settings.brand?.logo_url)
  return <footer className={`texno-footer ${styles.footer}`}>
    <div className={`texno-container ${styles.main}`}>
      <div className={styles.contacts}>
        {logo && <LocalizedClientLink className={styles.logo} href="/" aria-label={display.logo_alt || settings.brand?.logo_alt || settings.brand?.name}><Image src={logo} alt={display.logo_alt || settings.brand?.logo_alt || settings.brand?.name || ""} width={174} height={22} unoptimized={!logo.startsWith("/")} style={{ width: 174, height: 22 }} /></LocalizedClientLink>}
        {phone && <div className={styles.contactGroup}><p className={styles.label}>{display.phone_label}</p><a className={styles.phone} href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a></div>}
        {!!settings.social?.length && <div className={styles.socials}>{settings.social.filter((social) => social.enabled && webUrl(social.url)).map((social, index) =>
          <FooterLink key={index} href={social.url}>{social.label}<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M4 12 12 4M4 4h8v8" /></svg></FooterLink>)}</div>}
        {email && <div className={styles.contactGroup}><p className={styles.label}>{display.email_label}</p><a className={styles.email} href={`mailto:${email}`}>{email}</a></div>}
      </div>
      {columns.map((column, index) => <nav key={index} className={`${styles.column} ${index === 0 ? styles.menu : styles.catalog}`} aria-label={column.title}>
        <h2>{column.title}</h2>
        <ul>{column.items.filter((item) => item.enabled).map((item, itemIndex) => {
          const href = itemHref(item)
          return href ? <li key={itemIndex}><FooterLink href={href}>{item.label}</FooterLink></li> : null
        })}</ul>
      </nav>)}
    </div>
    <div className={styles.bottom}><div className={`texno-container ${styles.bottomInner}`}>
      <p>{display.copyright_prefix} {new Date().getFullYear()} {settings.footer?.text}</p>
      <div className={styles.payments}>{display.payment_logos?.map((mark, index) => {
        const width = Math.min(80, Math.max(20, mark.width))
        const height = Math.min(40, Math.max(16, mark.height))
        const src = mediaUrl(mark.src)
        return src && <Image key={index} src={src} alt={mark.alt} width={width} height={height} unoptimized={!src.startsWith("/")} style={{ width, height }} />
      })}</div>
    </div></div>
  </footer>
}
