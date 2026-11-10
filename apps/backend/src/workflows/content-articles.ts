import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { saveContentArticleStep, type ArticleOperation } from "./steps/save-content-article"

export const contentArticlesWorkflow = createWorkflow("content-articles", function (input: ArticleOperation) {
  const result = saveContentArticleStep(input)
  return new WorkflowResponse(result)
})
