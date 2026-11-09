import { Module } from "@medusajs/framework/utils"
import InsalesImportModuleService from "./service"

export const INSALES_IMPORT_MODULE = "insalesImport"
export default Module(INSALES_IMPORT_MODULE, { service: InsalesImportModuleService })
