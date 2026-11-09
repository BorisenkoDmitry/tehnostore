import { MedusaService } from "@medusajs/framework/utils"
import InsalesImportJob from "./models/import-job"
import InsalesImportPayload from "./models/import-payload"

export default class InsalesImportModuleService extends MedusaService({ InsalesImportJob, InsalesImportPayload }) {}
