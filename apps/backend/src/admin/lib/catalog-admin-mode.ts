export const LEGACY_CATALOG_KEY = "catalog-constructor:legacy-admin"
export const showLegacyCatalogAdmin = () => globalThis.localStorage?.getItem(LEGACY_CATALOG_KEY) === "1"
