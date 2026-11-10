import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Globe } from "@medusajs/icons"
import { DropdownMenu, IconButton, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

// Native names and codes match Medusa 2.22.3's profile language selector.
// Keep this list aligned with the dashboard when upgrading Medusa.
const languages = [
  { code: "bs", name: "Bosanski" },
  { code: "bg", name: "Български" },
  { code: "en", name: "English" },
  { code: "enGB", name: "English (UK)" },
  { code: "es", name: "Español" },
  { code: "el", name: "Ελληνικά" },
  { code: "de", name: "Deutsch" },
  { code: "fi", name: "Suomi" },
  { code: "fr", name: "Français" },
  { code: "he", name: "עברית" },
  { code: "hr", name: "Hrvatski" },
  { code: "hu", name: "Magyar" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "pl", name: "Polski" },
  { code: "ptBR", name: "Português (Brasil)" },
  { code: "ptPT", name: "Português (Portugal)" },
  { code: "tr", name: "Türkçe" },
  { code: "th", name: "ไทย" },
  { code: "uk", name: "Українська" },
  { code: "ro", name: "Română" },
  { code: "mk", name: "Македонски" },
  { code: "mn", name: "Монгол" },
  { code: "ar", name: "العربية" },
  { code: "zhCN", name: "简体中文" },
  { code: "fa", name: "فارسی" },
  { code: "cs", name: "Čeština" },
  { code: "ru", name: "Русский" },
  { code: "lt", name: "Lietuviškai" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ko", name: "한국어" },
  { code: "nl", name: "Nederlands" },
  { code: "zhTW", name: "繁體中文(臺灣)" },
  { code: "sv", name: "Swedish" },
].sort((a, b) => a.name.localeCompare(b.name))

const AdminLanguageSwitcher = () => {
  const { t, i18n } = useTranslation()
  const [changing, setChanging] = useState(false)
  const available = languages.filter(({ code }) => i18n.hasResourceBundle(code, "translation"))
  const current = available.find(({ code }) => code === i18n.language)
    ?? available.find(({ code }) => code === i18n.resolvedLanguage)
  const label = t("profile.fields.languageLabel")
  const accessibleLabel = current ? `${label}: ${current.name}` : label

  const changeLanguage = async (code: string) => {
    if (changing || code === current?.code || !available.some((language) => language.code === code)) return
    setChanging(true)
    try {
      await i18n.changeLanguage(code)
    } catch {
      toast.error(t("general.error"))
    } finally {
      setChanging(false)
    }
  }

  return <DropdownMenu>
    <DropdownMenu.Trigger asChild>
      <IconButton size="small" variant="transparent" title={accessibleLabel} aria-label={accessibleLabel} aria-busy={changing} disabled={changing}>
        <Globe className="text-ui-fg-muted" aria-hidden="true" />
      </IconButton>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" style={{ maxHeight: "min(24rem, var(--radix-dropdown-menu-content-available-height, calc(100dvh - 5rem)))", overflowY: "auto" }}>
      <DropdownMenu.Label>{label}</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={current?.code} onValueChange={changeLanguage}>
        {available.map(({ code, name }) => <DropdownMenu.RadioItem key={code} value={code} disabled={changing}>
          <span lang={code.replace(/([a-z])([A-Z])/g, "$1-$2")}>{name}</span>
        </DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu>
}

export const config = defineWidgetConfig({ zone: "topbar" })
export default AdminLanguageSwitcher
