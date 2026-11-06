import Image from "next/image"
import { getNavigation } from "@lib/data/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { MenuLink } from "@modules/layout/components/storefront-shell"

export default async function Footer() {
  const navigation = await getNavigation()
  return <footer className="texno-footer">
    <div className="texno-container texno-footer-inner">
    <LocalizedClientLink href="/" aria-label="TEXNO STORE — главная"><Image src="/images/texno-logo.svg" alt="TEXNO STORE" width={174} height={22} /></LocalizedClientLink>
    <nav aria-label="Информация о магазине">{navigation?.items.filter((item) => item.kind === "link").map((item) => <MenuLink key={item.id} item={item} />)}</nav>
    <span>© {new Date().getFullYear()} TEXNO STORE</span>
    </div>
  </footer>
}
