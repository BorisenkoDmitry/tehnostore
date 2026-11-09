export type CatalogAttributeInput = {
  key: string
  label: string
  rawValues: string[]
  values: {
    value: string
    normalized: string
    numericValue: number | null
    unit: string | null
  }[]
  dataType: "text" | "number" | "boolean"
  public: boolean
  filterable: boolean
  legacyLabels?: string[]
  cmsManaged?: boolean
}

export type CatalogProductType = {
  code: string
  label: string
  enabled: boolean
  variant_axes: string[]
  filter_codes: string[]
}

export type CatalogAttributesInput = {
  product_id: string
  source_product_id: string
  source_hash: string
  source_data: Record<string, unknown>
  searchable_text: string
  attributes: CatalogAttributeInput[]
  variants: {
    variant_id: string
    source_variant_id: string
    source_data: Record<string, unknown>
    attributes: CatalogAttributeInput[]
  }[]
}

export type CatalogRecordInput = CatalogAttributesInput
