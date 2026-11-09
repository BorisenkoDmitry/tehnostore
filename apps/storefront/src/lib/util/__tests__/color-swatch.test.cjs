const assert = require("node:assert/strict")
const test = require("node:test")
const { isColorAttribute, resolveColorSwatch } = require("../../../../../backend/src/lib/catalog-color-swatches.ts")

test("recognizes bilingual marketing names, case/whitespace aliases, and meaningful finish distinctions", () => {
  assert.equal(resolveColorSwatch("  ROSE GOLD  -  Розовое Золото ").segments[0].color, "#d6a3a0")
  assert.equal(resolveColorSwatch("Чёрный").known, true)
  assert.equal(resolveColorSwatch("Золотой").segments[0].color, "#ccb468")
  assert.equal(resolveColorSwatch("Белый").segments[0].color, "#fafafa")
  assert.equal(resolveColorSwatch("Розовый").segments[0].color, "#e4a5bd")
  assert.equal(resolveColorSwatch("Жёлтый").segments[0].color, "#e4cb59")
  assert.equal(resolveColorSwatch("Green - Темно-зеленый").segments[0].color, "#365845")
  assert.equal(resolveColorSwatch("Green - Зеленый").segments[0].color, "#4f8b63")
  assert.equal(resolveColorSwatch("Peach - Розовый").segments[0].color, "#efb8a2")
  assert.equal(resolveColorSwatch("Phantom Black - Темно-серый").segments[0].color, "#53575a")
  assert.equal(resolveColorSwatch("Crafted Black - Черный").segments[0].pattern, "crafted")
})

test("uses one circle for bilingual names and segmented circles only for explicit combinations", () => {
  assert.equal(resolveColorSwatch("Black - Черный").segments.length, 1)
  assert.equal(resolveColorSwatch("Rose Gold - Розовое Золото").segments.length, 1)
  const composite = resolveColorSwatch("Rose Gold / Black")
  assert.equal(composite.kind, "multi")
  assert.equal(composite.known, true)
  assert.deepEqual(composite.segments.map((segment) => segment.color), ["#d6a3a0", "#262626"])
  assert.equal(resolveColorSwatch("красный + прозрачный").segments[1].pattern, "transparent")
})

test("gives transparent and unknown colors distinct neutral patterns without arbitrary hues or URL styles", () => {
  assert.deepEqual(resolveColorSwatch("Transparent - Прозрачный"), { kind: "transparent", segments: [{ color: null, pattern: "transparent" }], known: true })
  for (const value of ["Неизвестный оттенок", "url(https://evil.test/pixel)", "<script>alert(1)</script>", ""]) {
    const swatch = resolveColorSwatch(value)
    assert.equal(swatch.known, false)
    assert.equal(swatch.kind, "unknown")
    assert.deepEqual(swatch.segments, [{ color: null, pattern: "unknown" }])
    assert.equal(JSON.stringify(swatch).includes("https://"), false)
  }
})

test("shares color detection across catalog groups and variant/specification labels", () => {
  for (const label of ["Цвет", "Цвет варианта", "Цвет корпуса", " COLOR ", "Variant Colour"]) assert.equal(isColorAttribute(label), true)
  for (const label of ["Объем памяти", "Количество ядер", "Цветовая температура"]) assert.equal(isColorAttribute(label), false)
})

test("uses the saved library shade without changing the color label or legacy fallback", () => {
  const graphite = "Graphite - Темно-серый"
  const palette = { [graphite]: "#7351a6", "Чёрный": "#151923", "Ирис": "#6d2acf" }
  assert.equal(resolveColorSwatch(graphite, palette).segments[0].color, "#7351a6")
  assert.equal(resolveColorSwatch(graphite).segments[0].color, "#555658")
  assert.equal(resolveColorSwatch("черный", palette).segments[0].color, "#151923")
  assert.equal(resolveColorSwatch("Ирис", palette).segments[0].color, "#6d2acf")
  assert.equal(resolveColorSwatch(graphite, { [graphite]: "url(https://invalid.test)" }).segments[0].color, "#555658")
})
