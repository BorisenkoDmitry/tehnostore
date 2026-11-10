import { validateAndTransformBody } from "@medusajs/framework/http"
import { ContentLeadInput, ContentLeadUpdate, ContentPageInput, ContentReviewInput, ContentSettingsInput } from "../modules/content/validation"
import { ArticleIndexSettingsInput, ContentArticleInput } from "../modules/content/article-validation"

export const contentMiddlewares = [
  { matcher: "/admin/content/article-settings", method: "POST" as const, middlewares: [validateAndTransformBody(ArticleIndexSettingsInput)] },
  { matcher: "/admin/content/articles", method: "POST" as const, middlewares: [validateAndTransformBody(ContentArticleInput)] },
  { matcher: "/admin/content/articles/:id", method: "POST" as const, middlewares: [validateAndTransformBody(ContentArticleInput)] },
  { matcher: "/admin/content/pages", method: "POST" as const, middlewares: [validateAndTransformBody(ContentPageInput)] },
  { matcher: "/admin/content/pages/:id", method: "POST" as const, middlewares: [validateAndTransformBody(ContentPageInput)] },
  { matcher: "/admin/content/settings", method: "POST" as const, middlewares: [validateAndTransformBody(ContentSettingsInput)] },
  { matcher: "/admin/content/reviews", method: "POST" as const, middlewares: [validateAndTransformBody(ContentReviewInput)] },
  { matcher: "/admin/content/reviews/:id", method: "POST" as const, middlewares: [validateAndTransformBody(ContentReviewInput)] },
  { matcher: "/admin/content/leads/:id", method: "POST" as const, middlewares: [validateAndTransformBody(ContentLeadUpdate)] },
  { matcher: "/store/content/leads", method: "POST" as const, middlewares: [validateAndTransformBody(ContentLeadInput)] },
]
