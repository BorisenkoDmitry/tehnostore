import { StoreIcon, type IconName } from "@modules/layout/components/storefront-shell/icons"

export default function StoreBenefits({ items: benefits }: { items: { icon: IconName; title: string; detail: string }[] }) {
  return <section className="texno-benefits" aria-label="Преимущества магазина">
    <ul className="texno-benefits-list texno-container">
      {benefits.map((benefit) => <li key={benefit.icon}>
        <StoreIcon name={benefit.icon} className="texno-benefit-icon" />
        <div className="texno-benefit-copy"><h2>{benefit.title}</h2><p>{benefit.detail}</p></div>
      </li>)}
    </ul>
  </section>
}
