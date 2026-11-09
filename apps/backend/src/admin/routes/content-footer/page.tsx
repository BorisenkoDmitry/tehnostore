import { defineRouteConfig } from "@medusajs/admin-sdk"
import { LayoutBottom } from "@medusajs/icons"
import { ContentSettingsEditor } from "../../components/content-settings-editor"

const ContentFooter = () => <ContentSettingsEditor section="footer" />

export const config = defineRouteConfig({ label: "Подвал", icon: LayoutBottom })
export default ContentFooter
