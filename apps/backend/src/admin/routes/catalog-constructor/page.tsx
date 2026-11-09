import { defineRouteConfig } from "@medusajs/admin-sdk"
import { SquaresPlus } from "@medusajs/icons"
import { CatalogConstructorScreen } from "./catalog-screen"
import { Navigate, useSearchParams } from "react-router-dom"

const paths: Record<string, string> = { products: "products", variants: "variants", fields: "attributes", folders: "categories" }

const CatalogConstructorPage = () => {
  const [params] = useSearchParams()
  const legacy = paths[params.get("tab") ?? ""]
  if (legacy) {
    const next = new URLSearchParams(params)
    next.delete("tab")
    return <Navigate to={`/catalog-constructor/${legacy}${next.size ? `?${next}` : ""}`} replace />
  }
  return <CatalogConstructorScreen section="graph" />
}

export const config = defineRouteConfig({ label: "Конструктор каталога", icon: SquaresPlus, rank: 1, permissions: ["product:read", "product_category:read"] })
export default CatalogConstructorPage
