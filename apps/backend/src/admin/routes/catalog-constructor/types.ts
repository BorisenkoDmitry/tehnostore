import type { ConstructorCategory, ConstructorFamily } from "../../../lib/catalog-constructor"
import type { CatalogNode } from "../../../modules/navigation/types"
import type { CatalogAttributeInput } from "../../../modules/catalog-attributes/types"

export type Profile = {
  scope: string
  currency_code: string
  product_types: { code: string; label: string; enabled: boolean; filter_codes: string[]; variant_axes: string[] }[]
}
export type Folder = ConstructorCategory & { published: boolean; public: boolean; updated_at: string }
export type ProductCard = {
  id: string; title: string; handle: string; status: string; thumbnail: string | null
  created_at?: string
  categories: { id: string; name: string }[]
}
export type GraphData = { profile: Profile; nodes: CatalogNode[]; categories: Folder[] }
export type ProductFamily = ConstructorFamily
export type ProductPage = { products: ProductCard[]; count: number; families?: ProductFamily[] }
export type Stock = { known: boolean; levels: { location_id: string; stocked_quantity: number; reserved_quantity: number }[] }
export type Variant = {
  id: string; title: string; sku: string | null; price: number | null; old_price: number | null
  stock: Stock; attributes: CatalogAttributeInput[]; choices: Record<string, string>
  imported_choices?: string[]
}
export type ProductDetail = Omit<ProductCard, "thumbnail"> & {
  revision: string; visible: boolean; images: string[]; description_html: string; kind?: string; brand?: string
  family_id?: string; imported?: boolean; seo?: { title: string; description: string }; attributes: CatalogAttributeInput[]
  axes: { code: string; title: string; id: string }[]; variants: Variant[]; locations: { id: string; name: string }[]
  variant_spec_fields?: string[]
}
export type VariantPage = { variants: (Pick<Variant, "id" | "title" | "sku" | "price" | "stock"> & { created_at: string; product: { id: string; title: string } })[]; count: number; currency: string }
export type CardRef = { kind: "folder" | "product"; id: string }
export const constructorKey = ["catalog-constructor"] as const
export const constructorPath = "/admin/catalog-constructor"
