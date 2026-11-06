import { StoreIcon, type IconName } from "@modules/layout/components/storefront-shell/icons"

const benefits: { icon: IconName; title: string; detail: string }[] = [
  { icon: "truck", title: "Доставим сегодня!", detail: "от 299 руб." },
  { icon: "wallet", title: "Оплата по факту", detail: "после проверки" },
  { icon: "shield", title: "Гарантия качества", detail: "12 месяцев" },
  { icon: "pin", title: "Удобный самовывоз", detail: "5 мин. от метро" },
]

export default function StoreBenefits() {
  return <section className="texno-benefits" aria-label="Преимущества магазина">
    <ul className="texno-benefits-list texno-container">
      {benefits.map((benefit) => <li key={benefit.icon}>
        <StoreIcon name={benefit.icon} className="texno-benefit-icon" />
        <div className="texno-benefit-copy"><h2>{benefit.title}</h2><p>{benefit.detail}</p></div>
      </li>)}
    </ul>
  </section>
}
