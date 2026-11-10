import { MedusaService } from "@medusajs/framework/utils"
import ContentPage from "./models/content-page"
import ContentSettings from "./models/content-settings"
import ContentReview from "./models/content-review"
import ContentLead from "./models/content-lead"
import ContentArticle from "./models/content-article"

class ContentModuleService extends MedusaService({ ContentPage, ContentSettings, ContentReview, ContentLead, ContentArticle }) {}

export default ContentModuleService
