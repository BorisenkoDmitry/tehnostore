import { MedusaService } from "@medusajs/framework/utils"
import ContentPage from "./models/content-page"
import ContentSettings from "./models/content-settings"
import ContentReview from "./models/content-review"
import ContentLead from "./models/content-lead"

class ContentModuleService extends MedusaService({ ContentPage, ContentSettings, ContentReview, ContentLead }) {}

export default ContentModuleService
