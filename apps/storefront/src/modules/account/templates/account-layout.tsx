import React from "react"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AccountNav from "../components/account-nav"
import styles from "./account.module.css"

const AccountLayout = ({ customer, children }: { customer: HttpTypes.StoreCustomer | null; children: React.ReactNode }) => <div className={`texno-container ${styles.layout}`} data-testid="account-page">
  <div className={customer ? styles.columns : styles.login}>
    {customer && <AccountNav customer={customer} />}
    <div className={styles.main}>{children}</div>
  </div>
  <div className={styles.help}><p>Нужна помощь с заказом или личным кабинетом?</p><LocalizedClientLink href="/page/faq">Вопросы и ответы</LocalizedClientLink></div>
</div>
export default AccountLayout
