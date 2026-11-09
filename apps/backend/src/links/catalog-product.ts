import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import CatalogAttributesModule from "../modules/catalog-attributes"

export default defineLink(
  ProductModule.linkable.product,
  CatalogAttributesModule.linkable.catalogRecord
)
