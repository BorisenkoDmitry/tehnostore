import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import { ContentSettingsEditor } from "../../components/content-settings-editor"

const ContentSettings = () => <ContentSettingsEditor section="store" />

export const config = defineRouteConfig({ label: "Данные магазина", icon: CogSixTooth })
export default ContentSettings
