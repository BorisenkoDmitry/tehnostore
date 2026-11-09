"use client"
import { useState } from "react"
import { useParams, usePathname } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { signout } from "@lib/data/customer"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "../../templates/account.module.css"

const links = [{ href: "/account", label: "Обзор", test: "overview-link" }, { href: "/account/profile", label: "Личные данные", test: "profile-link" }, { href: "/account/addresses", label: "Адреса", test: "addresses-link" }, { href: "/account/orders", label: "Заказы", test: "orders-link" }]
const AccountNav = ({ customer: _customer }: { customer: HttpTypes.StoreCustomer | null }) => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  return <nav aria-label="Личный кабинет" className={styles.nav} data-testid="account-nav">
    {links.map((link) => <LocalizedClientLink key={link.href} href={link.href} aria-current={route === `/${countryCode}${link.href}` ? "page" : undefined} data-testid={link.test}>{link.label}</LocalizedClientLink>)}
    <button type="button" disabled={pending} data-testid="logout-button" onClick={async () => { setPending(true); setError(""); try { await signout(countryCode) } catch { setError("Не удалось выйти. Повторите попытку."); setPending(false) } }}>{pending ? "Выходим…" : "Выйти"}</button>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
  </nav>
}
export default AccountNav
