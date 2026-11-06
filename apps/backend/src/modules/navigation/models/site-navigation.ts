import { model } from "@medusajs/framework/utils"
import { NavigationItem } from "../types"

const SiteNavigation = model.define("site_navigation", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  items: model.json<NavigationItem[]>(),
  phone: model.text(),
  telegram_url: model.text(),
})

export default SiteNavigation
