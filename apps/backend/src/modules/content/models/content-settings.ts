import { model } from "@medusajs/framework/utils"
import type { SiteSettingsData } from "../types"

const ContentSettings = model.define("content_settings", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  data: model.json<SiteSettingsData>().default({}),
  published_data: model.json<SiteSettingsData>().nullable(),
  revision: model.number().default(1),
  published_at: model.dateTime().nullable(),
  provenance: model.json().nullable(),
})

export default ContentSettings
