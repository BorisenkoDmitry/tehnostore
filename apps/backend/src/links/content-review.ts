import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ContentModule from "../modules/content"

export default defineLink(ProductModule.linkable.product, {
  linkable: ContentModule.linkable.contentReview,
  isList: true,
})
