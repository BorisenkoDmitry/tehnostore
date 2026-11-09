import { resolveColorSwatch } from "@lib/util/color-swatch"

export function ColorSwatch({ value, swatches, decorative = false }: { value: string; swatches?: Record<string, string>; decorative?: boolean }) {
  const appearance = resolveColorSwatch(value, swatches)
  return <span className="texno-color-sample" data-color-kind={appearance.kind} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : value} aria-hidden={decorative || undefined} title={value}>
    {appearance.segments.map((segment, index) => <span key={index} className={segment.pattern ? `texno-color-segment is-${segment.pattern}` : "texno-color-segment"} style={segment.color ? { backgroundColor: segment.color } : undefined} />)}
  </span>
}

export function ColorSwatchButton({ value, swatches, selected, onClick }: { value: string; swatches?: Record<string, string>; selected: boolean; onClick: () => void }) {
  return <button type="button" className="texno-catalog-swatch" aria-label={value} title={value} aria-pressed={selected} onClick={onClick}>
    <ColorSwatch value={value} swatches={swatches} decorative />
    {selected && <svg className="texno-swatch-selected-mark" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" /><path d="m3.2 6 1.8 1.8 3.8-3.6" /></svg>}
  </button>
}
