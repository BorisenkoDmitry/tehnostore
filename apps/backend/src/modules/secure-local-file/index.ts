import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SecureLocalFileService from "./service"

export default ModuleProvider(Modules.FILE, { services: [SecureLocalFileService] })
