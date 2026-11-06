import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { NavigationInput } from "../api/admin/navigation/validators"
import { saveNavigationStep } from "./steps/save-navigation"

export const saveNavigationWorkflow = createWorkflow(
  "save-navigation",
  function (input: NavigationInput) {
    const navigation = saveNavigationStep(input)
    return new WorkflowResponse({ navigation })
  }
)
