import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"

export type AccessoryData = { title: string; items: { id: string; title: string; image: string; category_id?: string; href?: string }[] }
export default function AccessoryCollections({ title, items }: AccessoryData) {
  return <section className="texno-accessories texno-section" aria-labelledby="accessories-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="accessories-heading">{title}</h2></div>
      <ul className="texno-accessory-grid">{items.map((category) => <li key={category.id}>
        <LocalizedClientLink href={category.href || `/catalog?category=${encodeURIComponent(category.category_id || category.id)}`} className={`texno-accessory-card texno-accessory-${category.id}`}>
          <h3>{category.title}</h3><span className="texno-accessory-arrow"><StoreIcon name="arrow" /></span>
          <Image src={category.image} alt="" fill loading="lazy" sizes="(max-width: 600px) 90vw, (max-width: 1023px) 45vw, 440px" />
        </LocalizedClientLink>
      </li>)}</ul>
    </div>
  </section>
}
