import { Button, Input, Label, Text } from "@medusajs/ui"
import { useState } from "react"
import { defaultColorNames, resolveColorSwatch } from "../../../lib/catalog-color-swatches"

export function ChoiceSwatch({ name, colors }: { name: string; colors?: Record<string, string> | null }) {
  const { segments } = resolveColorSwatch(name, colors ?? undefined)
  return <span aria-hidden="true" className="flex size-6 shrink-0 overflow-hidden rounded-full border border-ui-border-base bg-ui-bg-subtle" title={name}>
    {segments.map(({ color, pattern }, index) => <span key={index} className="flex-1" style={color
      ? { backgroundColor: color }
      : { backgroundImage: pattern === "transparent" ? "repeating-conic-gradient(#d1d5db 0% 25%, #fff 0% 50%)" : "repeating-linear-gradient(135deg, #d1d5db 0 2px, transparent 2px 5px)", backgroundSize: pattern === "transparent" ? "8px 8px" : undefined }} />)}
  </span>
}

function ColorPicker({ name, colors, change }: { name: string; colors: Record<string, string>; change: (color: string) => void }) {
  const shade = resolveColorSwatch(name, colors).segments[0].color ?? "#888888"
  return <span className="relative shrink-0 rounded-full focus-within:ring-2 focus-within:ring-ui-border-interactive">
    <ChoiceSwatch name={name} colors={colors} />
    <input aria-label={`Оттенок «${name}»`} title="Выбрать оттенок" type="color" value={shade} onChange={(event) => change(event.target.value)}
      className="absolute inset-0 size-full cursor-pointer opacity-0" />
  </span>
}

const normalizeChoice = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim()

export function ChoiceValuesEditor({ values, colorField, colors, onValuesChange, onColorsChange }: {
  values: string[]
  colorField: boolean
  colors: Record<string, string>
  onValuesChange: (values: string[]) => void
  onColorsChange: (colors: Record<string, string>) => void
}) {
  const [input, setInput] = useState("")
  const [shade, setShade] = useState<string>()
  const hasValue = (name: string) => values.some((value) => normalizeChoice(value) === normalizeChoice(name))
  const add = (raw: string, hex?: string) => {
    const name = raw.trim()
    if (!name || hasValue(name) || values.length >= 100) return
    onValuesChange([...values, name])
    if (colorField && hex) onColorsChange({ ...colors, [name]: hex })
    setInput("")
    setShade(undefined)
  }
  const remove = (name: string) => {
    onValuesChange(values.filter((value) => value !== name))
    onColorsChange(Object.fromEntries(Object.entries(colors).filter(([value]) => value !== name)))
  }
  const draftName = input.trim() || "Новый цвет"
  const draftShade = shade ?? resolveColorSwatch(draftName).segments[0].color ?? "#888888"
  return <fieldset className="flex min-w-0 flex-col gap-2">
    <legend className="mb-1"><Text size="small" weight="plus">Допустимые значения</Text></legend>
    {colorField && <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-2">
      <Text size="xsmall" className="text-ui-fg-subtle">Готовая палитра</Text>
      <div className="flex flex-wrap gap-1">
        {defaultColorNames.map((name) => <Button key={name} type="button" size="small" variant="transparent" className="px-1"
          disabled={hasValue(name) || values.length >= 100} aria-label={`Добавить цвет «${name}»`} title={name} onClick={() => add(name)}>
          <ChoiceSwatch name={name} />
        </Button>)}
      </div>
    </div>}
    <div className="flex items-center gap-2">
      {colorField && <ColorPicker name={draftName} colors={{ [draftName]: draftShade }} change={setShade} />}
      <Label className="sr-only" htmlFor="field-new-choice">{colorField ? "Название нового цвета" : "Новое значение"}</Label>
      <Input id="field-new-choice" value={input} maxLength={250} placeholder={colorField ? "Название нового цвета" : "Новое значение"}
        onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add(input, draftShade)
          }
        }} />
      <Button type="button" size="small" variant="secondary" aria-label="Добавить значение"
        disabled={!input.trim() || hasValue(input) || values.length >= 100} onClick={() => add(input, draftShade)}>+</Button>
    </div>
    {input.trim() && hasValue(input) && <Text size="xsmall" className="text-ui-fg-subtle">Это значение уже в списке.</Text>}
    {values.length > 0 && <ul className="max-h-64 divide-y overflow-y-auto rounded-md border border-ui-border-base">
      {values.map((name) => <li key={name} className="flex items-center gap-2 px-2 py-1">
        {colorField && <ColorPicker name={name} colors={colors} change={(hex) => onColorsChange({ ...colors, [name]: hex })} />}
        <Text size="small" className="min-w-0 flex-1 break-words">{name}</Text>
        <Button type="button" size="small" variant="transparent" aria-label={`Убрать значение «${name}»`} onClick={() => remove(name)}>Убрать</Button>
      </li>)}
    </ul>}
  </fieldset>
}
