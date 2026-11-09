export type SwatchSegment = { color: string | null; pattern?: "transparent" | "unknown" | "crafted" }
export type ColorSwatchAppearance = { kind: "solid" | "multi" | "transparent" | "unknown"; segments: SwatchSegment[]; known: boolean }

const normalizeColorName = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/ё/g, "е").replace(/[–—‑]/g, "-").replace(/\s+/g, " ").trim()

// Approximate visual hints for the audited source finishes. Original names and
// backend filter identities remain untouched, including marketing distinctions.
const sourceShades: [string, string | null, SwatchSegment["pattern"]?][] = [
  ["Amber Yellow - Желтый", "#e2d4a4"], ["Black - Черный", "#262626"],
  ["Black Titanium - Черный", "#434343"], ["Blue - Синий", "#3679c5"],
  ["Bora Purple - Фиолетовый", "#b5a5ce"], ["Bronze - Бронзовый", "#b28b67"],
  ["Brown - Коричневый", "#8c674d"], ["Cobalt Violet - Фиолетовый", "#66617f"],
  ["Cosmic Orange - Оранжевый", "#d97843"], ["Crafted Black - Черный", "#343537", "crafted"],
  ["Cream - Белый", "#e9dfca"], ["Deep Blue - Синий", "#273b52"],
  ["Desert Titanium - Золотой", "#cbb59c"], ["Gold - Золотой", "#ccb468"],
  ["Graphite - Темно-серый", "#555658"], ["Gray - Серый", "#888f94"],
  ["Green - Зеленый", "#4f8b63"], ["Green - Темно-зеленый", "#365845"],
  ["Lavender - Фиолетовый", "#b5a7cc"], ["Lime - Светло-зеленый", "#d2dda3"],
  ["Marble Gray - Серый", "#c4c5bf"], ["Mint - Светло-зеленый", "#bed5ca"],
  ["Natural Titanium - Серый", "#a6a39a"], ["Onyx Black - Черный", "#414247"],
  ["Orange - Оранжевый", "#e39452"], ["Peach - Розовый", "#efb8a2"],
  ["Phantom Black - Темно-серый", "#53575a"], ["Phantom Black - Черный", "#303134"],
  ["Pink - Розовый", "#e4a5bd"], ["Pink Gold - Розовое золото", "#d6a3a0"],
  ["Pink Gold - Розовый", "#d6a3a0"], ["Purple - Пурпурный", "#8d5da8"],
  ["Red - Красный", "#c93d45"], ["Rose Gold - Розовое Золото", "#d6a3a0"],
  ["Silver - Серебристый", "#c7cbcf"], ["Silver Shadow - Серебристый", "#b9bec5"],
  ["Space Gray - Серый Космос", "#64656a"], ["Teal - Зеленый", "#7caaa3"],
  ["Titanium Black - Черный", "#4b4b4f"], ["Titanium Gray - Серый", "#a49e91"],
  ["Titanium Violet - Фиолетовый", "#70697e"], ["Titanium Yellow - Желтый", "#d5c598"],
  ["Transparent - Прозрачный", null, "transparent"], ["Ultramarine - Синий", "#6b75cf"],
  ["White - Белый", "#fafafa"], ["White Titanium - Белый", "#e7e4dc"],
  ["Yellow - Желтый", "#e4cb59"],
]

const exact = new Map<string, SwatchSegment>()
const aliases = new Map<string, SwatchSegment>()
for (const [name, color, pattern] of sourceShades) {
  const segment = { color, ...(pattern ? { pattern } : {}) }
  exact.set(normalizeColorName(name), segment)
  for (const part of name.split(" - ")) {
    const alias = normalizeColorName(part)
    if (!aliases.has(alias)) aliases.set(alias, segment)
  }
}
for (const [name, reference] of [
  ["черный", "Black"], ["белый", "White"], ["синий", "Blue"], ["зеленый", "Green"],
  ["красный", "Red"], ["розовый", "Pink"], ["золотой", "Gold"], ["серебристый", "Silver"],
  ["серый", "Gray"], ["желтый", "Yellow"], ["оранжевый", "Orange"], ["фиолетовый", "Purple"],
  ["пурпурный", "Purple"], ["коричневый", "Brown"], ["бронзовый", "Bronze"],
  ["графитовый", "Graphite"], ["титановый", "Natural Titanium"], ["бирюзовый", "Teal"],
  ["мятный", "Mint"], ["лавандовый", "Lavender"], ["персиковый", "Peach"],
  ["grey", "Gray"], ["бежевый", "Cream"], ["beige", "Cream"],
  ["голубой", "Blue"], ["dark blue", "Deep Blue"], ["темно-синий", "Deep Blue"],
  ["светло-зеленый", "Lime"], ["темно-зеленый", "Green - Темно-зеленый"],
  ["розовое золото", "Rose Gold"], ["rose-gold", "Rose Gold"],
  ["clear", "Transparent"], ["прозрачный", "Transparent"],
] as const) {
  const segment = exact.get(normalizeColorName(reference)) ?? aliases.get(normalizeColorName(reference))
  if (segment) aliases.set(normalizeColorName(name), segment)
}

const unknownSegment: SwatchSegment = { color: null, pattern: "unknown" }

function singleColor(value: string): SwatchSegment {
  const normalized = normalizeColorName(value)
  const resolved = exact.get(normalized) ?? aliases.get(normalized)
  if (resolved) return { ...resolved }
  // A bilingual label is one color, not an automatic two-color combination.
  const bilingual = normalized.split(/\s+-\s+/).map((part) => aliases.get(part)).filter((part): part is SwatchSegment => Boolean(part))
  if (bilingual.length && bilingual.every((part) => part.color === bilingual[0].color && part.pattern === bilingual[0].pattern)) return { ...bilingual[0] }
  return { ...unknownSegment }
}

export const defaultColorNames = ["Белый", "Чёрный", "Серый", "Красный", "Оранжевый", "Жёлтый", "Зелёный", "Синий", "Фиолетовый", "Розовый", "Коричневый", "Бежевый"]

export function resolveColorSwatch(value: string, overrides?: Record<string, string>): ColorSwatchAppearance {
  const normalized = normalizeColorName(value)
  const override = overrides?.[value] ?? Object.entries(overrides ?? {}).find(([name]) => normalizeColorName(name) === normalized)?.[1]
  if (typeof override === "string" && /^#[\da-f]{6}$/i.test(override)) return { kind: "solid", segments: [{ color: override }], known: true }
  const parts = value.split(/\s*(?:##|\/|\+|&|,|;)\s*|\s+(?:and|и)\s+/i).filter(Boolean)
  const segments = (parts.length > 1 ? parts.map(singleColor) : [singleColor(value)])
    .filter((segment, index, all) => all.findIndex((other) => other.color === segment.color && other.pattern === segment.pattern) === index)
  const known = segments.every((segment) => segment.pattern !== "unknown")
  const kind = segments.length > 1 ? "multi" : !known ? "unknown" : segments[0]?.pattern === "transparent" ? "transparent" : "solid"
  return { kind, segments: segments.length ? segments : [{ ...unknownSegment }], known }
}

export function isColorAttribute(label: string): boolean {
  return /^(?:цвет(?:\s+.+)?|(?:(?:variant|product)\s+)?colou?r)$/.test(normalizeColorName(label))
}
