import { MedusaService } from "@medusajs/framework/utils"
import CatalogRecord from "./models/catalog-record"
import CatalogVariant from "./models/catalog-variant"
import CatalogAttribute from "./models/catalog-attribute"
import CatalogDefinition from "./models/catalog-definition"
import CatalogChange from "./models/catalog-change"
import CatalogProfile from "./models/catalog-profile"

class CatalogAttributesModuleService extends MedusaService({
  CatalogRecord,
  CatalogVariant,
  CatalogAttribute,
  CatalogDefinition,
  CatalogChange,
  CatalogProfile,
}) {}

export default CatalogAttributesModuleService
