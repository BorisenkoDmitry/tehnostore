import { Fragment } from "react"

// Link only explicit source addresses. Keep every original character visible;
// punctuation remains outside the anchor and is never rewritten in the copy.
export default function InlineText({ text }: { text: string }) {
  const pattern = /https?:\/\/[^\s<>"'«»]+|[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of Array.from(text.matchAll(pattern))) {
    const start = match.index!
    const value = match[0].replace(/[.,;:!?]+$/, "").replace(/\)+$/, (tail) => {
      const open = (match[0].match(/\(/g) ?? []).length
      const close = (match[0].match(/\)/g) ?? []).length
      return tail.slice(0, Math.max(0, tail.length - Math.max(0, close - open)))
    })
    if (!value) continue
    parts.push(text.slice(cursor, start))
    const email = !/^https?:\/\//i.test(value)
    const href = email ? `mailto:${value}` : value
    let valid = true
    if (!email) {
      try { const url = new URL(value); valid = ["https:", "http:"].includes(url.protocol) && !url.username && !url.password }
      catch { valid = false }
    }
    parts.push(valid ? <a key={start} href={href} rel="noopener noreferrer">{value}</a> : value)
    cursor = start + value.length
  }
  parts.push(text.slice(cursor))
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>
}
