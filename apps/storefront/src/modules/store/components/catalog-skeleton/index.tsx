export default function CatalogSkeleton() {
  return <div className="texno-catalog-skeleton" role="status">
    <span className="sr-only">Загружаем товары каталога</span>
    <ul className="texno-product-grid texno-skeleton-grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <li key={index}><article className="texno-product-card">
        <div className="texno-product-photo texno-skeleton-part" />
        <div className="texno-skeleton-name"><span className="texno-skeleton-part" /><span className="texno-skeleton-part" /></div>
        <div className="texno-skeleton-price texno-skeleton-part" />
        <div className="texno-buy-button texno-skeleton-part" />
      </article></li>)}
    </ul>
  </div>
}
