"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react"
import type { SiteNavigation, NavigationItem } from "@lib/data/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon, type IconName } from "./icons"
import CatalogPanel from "./catalog-panel"
import { CART_UPDATED_EVENT } from "@lib/util/cart-events"

const CatalogContext = createContext({ openCatalog: () => {}, closeCatalog: () => {}, catalogOpen: false, navigationOpen: false })
export const useCatalog = () => useContext(CatalogContext)

const menuIcons: Record<string, IconName> = { about: "info", delivery: "truck", warranty: "shield", contacts: "pin", reviews: "chat", faq: "question" }

export function MenuLink({ item, onClick, className, icon }: { item: NavigationItem; onClick?: () => void; className?: string; icon?: IconName }) {
  const content = icon ? <><StoreIcon name={icon} className="texno-mobile-menu-icon" /><span>{item.label}</span><StoreIcon name="arrow" className="texno-mobile-tile-arrow" /></> : <span className="texno-menu-label">{item.label}</span>
  const pointerEnter: React.PointerEventHandler<HTMLAnchorElement> = (event) => {
    if (!icon) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty("--tile-x", `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty("--tile-y", `${event.clientY - bounds.top}px`)
  }
  return item.href.startsWith("https://")
    ? <a href={item.href} onClick={onClick} className={className} onPointerEnter={pointerEnter}>{content}</a>
    : <LocalizedClientLink href={item.href} onClick={onClick} className={className} onPointerEnter={pointerEnter}>{content}</LocalizedClientLink>
}

export default function StorefrontShell({ navigation, cartCount, children, brand, homeHeroOverlay }: {
  navigation: SiteNavigation | null; cartCount: number; children: React.ReactNode
  brand?: { name: string; logo_url?: string; logo_alt?: string; catalog_image?: string; catalog_tagline?: string }
  homeHeroOverlay?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [catalogPending, startCatalogNavigation] = useTransition()
  const { countryCode } = useParams()
  const storePage = pathname === `/${countryCode}/store`
  const cartPage = pathname === `/${countryCode}/cart`
  const home = pathname === `/${countryCode}` || pathname === "/"
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [shellReady, setShellReady] = useState(false)
  const requestedCatalog = useRef(false)
  const [desktopMenuReady, setDesktopMenuReady] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const header = useRef<HTMLElement>(null)
  const headerMarker = useRef<HTMLSpanElement>(null)
  const catalogTrigger = useRef<HTMLAnchorElement>(null)
  const desktopNav = useRef<HTMLElement>(null)
  const navDot = useRef<HTMLSpanElement>(null)
  const hoveredNavItem = useRef<HTMLElement | null>(null)
  const navDotVisible = useRef(false)
  const catalogReturn = useRef<HTMLElement | null>(null)
  const catalogFocusPending = useRef(false)
  const catalogClose = useRef<HTMLButtonElement>(null)
  const catalogPanel = useRef<HTMLElement>(null)
  const mobileMenu = useRef<HTMLDivElement>(null)
  const mobileClose = useRef<HTMLButtonElement>(null)
  const mobileTrigger = useRef<HTMLButtonElement>(null)
  const contactRoot = useRef<HTMLDivElement>(null)
  const contactTrigger = useRef<HTMLButtonElement>(null)
  const catalogNodes = navigation?.items.find((item) => item.kind === "catalog")?.children ?? []
  const fullScreenOpen = compact && (mobileMenuOpen || catalogOpen)
  useEffect(() => {
    const refreshCart = () => router.refresh()
    window.addEventListener(CART_UPDATED_EVENT, refreshCart)
    return () => window.removeEventListener(CART_UPDATED_EVENT, refreshCart)
  }, [router])
  useEffect(() => setShellReady(true), [])

  useEffect(() => {
    if (storePage) {
      if (requestedCatalog.current || window.matchMedia("(min-width: 1200px)").matches) setCatalogOpen(true)
    } else {
      setCatalogOpen(false)
    }
    setMobileMenuOpen(false)
    requestedCatalog.current = false
  }, [pathname, storePage])

  useEffect(() => {
    const element = header.current
    const marker = headerMarker.current
    if (!element || !marker) return
    element.classList.toggle("is-scrolled", window.scrollY > 24)
    // Scrolling must not re-render the shell and the hidden catalog tree.
    const observer = new IntersectionObserver(([entry]) => {
      element.classList.toggle("is-scrolled", entry.boundingClientRect.top < 0)
    }, { threshold: 0 })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [pathname])
  const hideNavDot = () => {
    navDotVisible.current = false
    hoveredNavItem.current = null
    if (desktopNav.current) desktopNav.current.dataset.hoverVisible = "false"
  }
  const pointNavDot = (target: EventTarget | null) => {
    const nav = desktopNav.current
    const dot = navDot.current
    const item = target instanceof Element ? target.closest<HTMLElement>("a, button") : null
    if (!nav || !dot || !item || !nav.contains(item)) return
    if (hoveredNavItem.current === item && navDotVisible.current) return
    const itemBounds = item.getBoundingClientRect()
    const center = itemBounds.left + itemBounds.width / 2 - nav.getBoundingClientRect().left - 3
    if (!navDotVisible.current) {
      dot.style.transition = "none"
      dot.style.transform = `translateX(${center}px)`
      dot.getBoundingClientRect()
      dot.style.transition = ""
    } else {
      dot.style.transform = `translateX(${center}px)`
    }
    hoveredNavItem.current = item
    navDotVisible.current = true
    nav.dataset.hoverVisible = "true"
  }
  const restoreFocus = () => {
    const origin = catalogReturn.current
    const visibleOrigin = origin?.isConnected && !origin.closest(".texno-mobile-overlay") && origin.getClientRects().length ? origin : null
    const target = compact ? visibleOrigin ?? mobileTrigger.current : origin
    if (!compact && target?.closest(".texno-desktop-nav")) {
      catalogFocusPending.current = true
      return
    }
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }
  // Release the outgoing control before its ancestor becomes aria-hidden/inert.
  // The destination panel receives focus after React commits its visible state.
  const releaseFocus = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  const closeCatalog = () => { releaseFocus(); setCatalogOpen(false); restoreFocus() }
  const closeMobileMenu = () => { releaseFocus(); setMobileMenuOpen(false); restoreFocus() }
  const openMobileMenu = () => { releaseFocus(); setCatalogOpen(false); setContactOpen(false); setMobileMenuOpen(true) }
  const openCatalog = () => {
    if (!storePage) {
      requestedCatalog.current = true
      setContactOpen(false)
      setMobileMenuOpen(false)
      startCatalogNavigation(() => router.push(`/${countryCode}/store`))
      return
    }
    hideNavDot()
    catalogReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    releaseFocus()
    catalogFocusPending.current = false
    setDesktopMenuReady(false)
    setContactOpen(false)
    setMobileMenuOpen(false)
    setCatalogOpen(true)
  }

  useEffect(() => {
    if (catalogOpen || desktopMenuReady) return
    // The timeout covers interrupted transitions, reduced motion and resizes.
    const immediate = compact || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const timer = setTimeout(() => setDesktopMenuReady(true), immediate ? 0 : 720)
    return () => clearTimeout(timer)
  }, [catalogOpen, compact, desktopMenuReady])

  useEffect(() => {
    if (!desktopMenuReady || catalogOpen || !catalogFocusPending.current) return
    const frame = requestAnimationFrame(() => {
      catalogReturn.current?.focus({ preventScroll: true })
      catalogFocusPending.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [desktopMenuReady, catalogOpen])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)")
    const update = () => {
      setCompact(media.matches)
      if (!media.matches) setMobileMenuOpen(false)
    }
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!fullScreenOpen) return
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = rootOverflow
    }
  }, [fullScreenOpen])

  useEffect(() => {
    if (!fullScreenOpen) return
    const panel = catalogOpen ? catalogPanel.current : mobileMenu.current
    const first = catalogOpen ? catalogClose.current : mobileClose.current
    const frame = requestAnimationFrame(() => first?.focus({ preventScroll: true }))
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panel) return
      const elements = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0)
      const start = elements[0]
      const end = elements[elements.length - 1]
      if (!start) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === start || !panel.contains(document.activeElement))) {
        event.preventDefault()
        end.focus()
      } else if (!event.shiftKey && (document.activeElement === end || !panel.contains(document.activeElement))) {
        event.preventDefault()
        start.focus()
      }
    }
    document.addEventListener("keydown", trapFocus)
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", trapFocus) }
  }, [fullScreenOpen, catalogOpen])

  useEffect(() => {
    if (!catalogOpen) return
    const frame = requestAnimationFrame(() => catalogClose.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [catalogOpen])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (document.querySelector("dialog[open]")) return
      if (document.querySelector('[role="listbox"]')) return
      if (catalogOpen || mobileMenuOpen) releaseFocus()
      if (catalogOpen) {
        setCatalogOpen(false)
        if (!compact && catalogReturn.current?.closest(".texno-desktop-nav")) catalogFocusPending.current = true
        else restoreFocus()
      }
      if (mobileMenuOpen) { setMobileMenuOpen(false); requestAnimationFrame(() => mobileTrigger.current?.focus()) }
      if (contactOpen) { setContactOpen(false); contactTrigger.current?.focus() }
    }
    const outside = (event: PointerEvent) => {
      if (contactRoot.current && !contactRoot.current.contains(event.target as Node)) setContactOpen(false)
    }
    document.addEventListener("keydown", keydown)
    document.addEventListener("pointerdown", outside)
    return () => { document.removeEventListener("keydown", keydown); document.removeEventListener("pointerdown", outside) }
  }, [catalogOpen, contactOpen, compact, mobileMenuOpen])

  return <CatalogContext.Provider value={{ openCatalog, closeCatalog, catalogOpen, navigationOpen: fullScreenOpen }}>
    <div className={`texno-shell ${shellReady ? "is-hydrated" : ""} ${storePage ? "texno-store-shell" : ""} ${catalogOpen ? "catalog-is-open" : ""} ${fullScreenOpen ? "mobile-overlay-is-open" : ""}`}>
      <aside ref={catalogPanel} id="catalog-panel" className="texno-catalog" role={compact ? "dialog" : undefined} aria-modal={compact && catalogOpen ? true : undefined} aria-label="Каталог товаров" aria-hidden={!catalogOpen} inert={!catalogOpen}>
        <div className="texno-catalog-top"><button type="button" className="texno-catalog-back texno-icon-button" onClick={openMobileMenu} aria-label="Вернуться в основное меню"><StoreIcon name="arrow" /></button><h2>Каталог</h2><button ref={catalogClose} className="texno-icon-button" onClick={closeCatalog} aria-label="Закрыть каталог"><StoreIcon name="close" /></button></div>
        <CatalogPanel nodes={catalogNodes} onSelect={compact ? closeCatalog : undefined} />
      </aside>
      <div ref={mobileMenu} id="mobile-navigation" className={`texno-mobile-overlay ${mobileMenuOpen ? "is-open" : ""}`} role="dialog" aria-modal={compact && mobileMenuOpen ? true : undefined} aria-label="Основное меню" aria-hidden={!compact || !mobileMenuOpen} inert={!compact || !mobileMenuOpen}>
        <div className="texno-mobile-overlay-top"><LocalizedClientLink href="/" aria-label={`${brand?.name || "Магазин"} — главная`} onClick={closeMobileMenu}>{brand?.logo_url ? <Image src={brand.logo_url} alt={brand.logo_alt || brand.name} width={174} height={22} /> : <span>{brand?.name || "Магазин"}</span>}</LocalizedClientLink><button ref={mobileClose} type="button" className="texno-icon-button" aria-label="Закрыть меню" onClick={closeMobileMenu}><StoreIcon name="close" /></button></div>
        <nav className="texno-mobile-overlay-links" aria-label="Разделы магазина">{navigation?.items.map((item) => item.kind === "catalog"
          ? <Link key={item.id} prefetch={false} href={`/${countryCode}/store`} className="texno-mobile-catalog-card" onClick={(event) => { event.preventDefault(); openCatalog() }} aria-controls="catalog-panel">{brand?.catalog_image && <Image className="texno-mobile-catalog-image" src={brand.catalog_image} alt="" fill sizes="(max-width: 1199px) 100vw, 0px" />}<span className="texno-mobile-catalog-copy"><strong>{item.label}</strong>{brand?.catalog_tagline && <span>{brand.catalog_tagline}</span>}</span><span className="texno-mobile-catalog-arrow"><StoreIcon name="arrow" /></span></Link>
          : <MenuLink key={item.id} item={item} className="texno-mobile-info-link" icon={menuIcons[item.id] ?? "info"} onClick={closeMobileMenu} />)}</nav>
        {navigation && <div className="texno-mobile-overlay-footer">{navigation.phone && <a href={`tel:${navigation.phone.replace(/[^+\d]/g, "")}`}><StoreIcon name="phone" /><span>{navigation.phone}</span></a>}{navigation.telegram_url && <a href={navigation.telegram_url} target="_blank" rel="noopener noreferrer"><StoreIcon name="telegram" /><span>Telegram</span></a>}</div>}
      </div>
      <div className="texno-canvas" data-testid="storefront-content" inert={fullScreenOpen} aria-hidden={fullScreenOpen ? true : undefined} onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "width" && !catalogOpen) setDesktopMenuReady(true)
      }}>
        <a href="#storefront-main" className="texno-skip-link">К содержимому</a>
        <span ref={headerMarker} className="texno-header-marker" aria-hidden="true" />
        <header ref={header} className={`texno-header ${home && homeHeroOverlay ? "is-home" : ""}`}>
          <div className="texno-container texno-header-inner">
          <LocalizedClientLink href="/" className="texno-logo" aria-label={`${brand?.name || "Магазин"} — главная`}>{brand?.logo_url ? <Image src={brand.logo_url} alt={brand.logo_alt || brand.name} width={190} height={24} priority /> : <span>{brand?.name || "Магазин"}</span>}</LocalizedClientLink>
          <nav ref={desktopNav} className={`texno-desktop-nav ${desktopMenuReady && !catalogOpen ? "is-ready" : ""}`} aria-label="Основное меню" hidden={catalogOpen || !desktopMenuReady} inert={catalogOpen || !desktopMenuReady} onPointerMove={(event) => pointNavDot(event.target)} onPointerLeave={hideNavDot} onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) pointNavDot(event.target) }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hideNavDot() }}>
            {navigation?.items.map((item) => item.kind === "catalog"
              ? <Link key={item.id} prefetch={false} href={`/${countryCode}/store`} ref={catalogTrigger} className={`texno-catalog-trigger ${catalogPending ? "is-pending" : ""}`} onClick={(event) => { event.preventDefault(); openCatalog() }} aria-busy={catalogPending} aria-expanded={catalogOpen} aria-controls="catalog-panel"><span className="texno-menu-label">{item.label}</span>{catalogPending && <span className="texno-catalog-pending-mark" aria-hidden="true" />}</Link>
              : <MenuLink key={item.id} item={item} />)}
            {!navigation && <span className="texno-nav-error">Меню временно недоступно</span>}
            <span ref={navDot} className="texno-nav-dot" aria-hidden="true" />
          </nav>
          <div className="texno-header-actions">
            <LocalizedClientLink href="/cart" className="texno-cart" aria-label={`Корзина, товаров: ${cartCount}`}><StoreIcon name="bag" /><span className="texno-cart-count" aria-live="polite">{cartCount}</span></LocalizedClientLink>
            <LocalizedClientLink href="/account" className="texno-account texno-icon-button" aria-label="Личный кабинет"><StoreIcon name="account" /></LocalizedClientLink>
            <button ref={mobileTrigger} type="button" className="texno-mobile-menu texno-icon-button" aria-label="Открыть меню" aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" onClick={openMobileMenu}><StoreIcon name="catalog" /></button>
          </div>
          </div>
        </header>
        {children}
      </div>
      {navigation && (navigation.phone || navigation.telegram_url) && !cartPage && <div ref={contactRoot} className="texno-contact" inert={fullScreenOpen} aria-hidden={fullScreenOpen ? true : undefined}>
        <div id="contact-options" className={`texno-contact-options ${contactOpen ? "is-open" : ""}`} aria-hidden={!contactOpen} inert={!contactOpen}>
          {navigation.telegram_url && <a href={navigation.telegram_url} aria-label="Написать в Telegram" target="_blank" rel="noopener noreferrer"><StoreIcon name="telegram" /></a>}
          {navigation.phone && <a href={`tel:${navigation.phone.replace(/[^+\d]/g, "")}`} aria-label={`Позвонить: ${navigation.phone}`}><StoreIcon name="phone" /></a>}
        </div>
        <button ref={contactTrigger} className={`texno-contact-trigger ${contactOpen ? "is-open" : ""}`} aria-label={contactOpen ? "Закрыть способы связи" : "Связаться с нами"} aria-expanded={contactOpen} aria-controls="contact-options" onClick={() => setContactOpen(!contactOpen)}><StoreIcon name={contactOpen ? "close" : "phone"} width="23" height="23" /></button>
      </div>}
    </div>
  </CatalogContext.Provider>
}
