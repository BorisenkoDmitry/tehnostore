import CatalogSkeleton from "@modules/store/components/catalog-skeleton"

export default function StoreLoading() {
  return <section className="texno-store texno-section" aria-busy="true"><div className="texno-container">
    <div className="texno-section-heading"><h1>Каталог</h1></div>
    <div className="texno-store-toolbar texno-skeleton-toolbar" aria-hidden="true"><span className="texno-skeleton-part" /><span className="texno-skeleton-part" /><span className="texno-skeleton-part" /></div>
    <CatalogSkeleton />
  </div></section>
}
