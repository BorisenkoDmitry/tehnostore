export function constructorSlug(value: string): string {
  const cyrillic = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
  const latin = ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya"]
  return Array.from(value.toLowerCase(), (letter) => latin[cyrillic.indexOf(letter)] ?? letter)
    .join("").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160).replace(/-$/, "")
}
