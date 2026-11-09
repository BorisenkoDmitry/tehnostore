export type CatalogNode = {
  id: string
  parent_id: string | null
  label: string
  href: string
  visible: boolean
  category_id?: string
  category_shortcut?: boolean
}

export type NavigationItem = {
  id: string
  label: string
  kind: "link" | "catalog"
  href: string
  visible: boolean
  children?: CatalogNode[]
}
