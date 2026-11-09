import { Module } from "@medusajs/framework/utils"
import CatalogAttributesModuleService from "./service"

export const CATALOG_ATTRIBUTES_MODULE = "catalogAttributes"

export default Module(CATALOG_ATTRIBUTES_MODULE, {
  service: CatalogAttributesModuleService,
})
