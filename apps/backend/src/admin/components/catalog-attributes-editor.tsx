import { Button, Input, Label, Select, Text } from "@medusajs/ui"
import type { CatalogDefinitionData } from "../../lib/catalog-cms"
import type { CatalogAttributeInput } from "../../modules/catalog-attributes/types"
import { isProductSpecificationCode } from "../../lib/product-specification"

export type EditableAttribute = { code: string; label?: string; values: string[] }
export function editableAttributes(attributes: CatalogAttributeInput[] = []): EditableAttribute[] {
  return attributes.map((attribute) => ({
    code: attribute.key,
    ...(isProductSpecificationCode(attribute.key) ? { label: attribute.label } : {}),
    values: attribute.values.map((value) => attribute.dataType === "number" && value.numericValue !== null ? String(value.numericValue) : value.value),
  }))
}

export const CatalogAttributesEditor = ({ value, onChange, definitions, prefix }: { value: EditableAttribute[]; onChange: (rows: EditableAttribute[]) => void; definitions: CatalogDefinitionData[]; prefix: string }) => {
  const update = (index: number, row: EditableAttribute) => onChange(value.map((item, position) => position === index ? row : item))
  const available = definitions.filter((definition) => definition.enabled && !value.some((row) => row.code === definition.code))
  return <div className="flex flex-col gap-3">
    {value.map((row, index) => {
      const definition = definitions.find((item) => item.code === row.code)
      return <div key={row.code} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1"><Label htmlFor={`${prefix}-${row.code}`}>{row.label ?? definition?.label ?? row.code}{definition?.unit ? ` (${definition.unit})` : ""}</Label><Input id={`${prefix}-${row.code}`} value={row.values.join(" | ")} required onChange={(event) => update(index, { ...row, values: event.target.value.split("|").map((part) => part.trim()) })} /></div>
        <Button type="button" variant="secondary" size="small" onClick={() => onChange(value.filter((_, position) => position !== index))}>Убрать</Button>
      </div>
    })}
    {available.length > 0 && <Select value="" onValueChange={(code) => onChange([...value, { code, values: [""] }])}><Select.Trigger aria-label="Добавить характеристику"><Select.Value placeholder="Добавить характеристику" /></Select.Trigger><Select.Content>{available.map((definition) => <Select.Item value={definition.code} key={definition.code}>{definition.label}</Select.Item>)}</Select.Content></Select>}
    <Text size="small" className="text-ui-fg-subtle">Несколько значений разделяйте знаком |. Числа вводите без единицы измерения. Новые характеристики доступны в разделе «CMS каталога».</Text>
  </div>
}
