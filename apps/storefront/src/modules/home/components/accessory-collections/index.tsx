import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import source from "../../data/source-preview.json"

export default function AccessoryCollections() {
  return <section className="texno-accessories texno-section" aria-labelledby="accessories-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="accessories-heading">Для вашего смартфона</h2></div>
      <ul className="texno-accessory-grid">{source.categories.map((category) => <li key={category.id}>
        <LocalizedClientLink href={`/catalog?category=${category.id}`} className={`texno-accessory-card texno-accessory-${category.id}`}>
          <h3>{category.title}</h3><span className="texno-accessory-arrow"><StoreIcon name="arrow" /></span>
          <Image src={category.image} alt="" fill loading="lazy" sizes="(max-width: 600px) 90vw, (max-width: 1023px) 45vw, 440px" />
        </LocalizedClientLink>
      </li>)}</ul>
    </div>
  </section>
}
