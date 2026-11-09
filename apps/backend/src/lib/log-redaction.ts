import { logger } from "@medusajs/framework/logger"

export function redactLogText(text: string): string {
  return text
    // Strip query values before decoding so an encoded space cannot split a
    // value and leave its suffix in an error message.
    .replace(/([?&][^=\s&#]+)=([^\s&#"<>]*)/g, "$1=[REDACTED]")
    .replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
      try { return decodeURIComponent(encoded) } catch { return "[ENCODED]" }
    })
    .replace(/(\/preview\/)[^\s/?#"<>]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[JWT]")
    .replace(/((?:token|password|secret|capability|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]")
}

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactLogText(value)
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[CIRCULAR]"
  seen.add(value)
  if (value instanceof Error) {
    const safe = new Error(redactLogText(value.message))
    safe.name = value.name
    safe.stack = value.stack ? redactLogText(value.stack) : undefined
    return safe
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /token|password|secret|capability|authorization|cookie|email/i.test(key) ? "[REDACTED]" : redact(item, seen)]))
}

// Configure this before modules boot, so errors and workflow logs share the
// same redaction boundary. Morgan's production stdout is patched separately.
export const redactedLogger = new Proxy(logger, {
  get(target, property) {
    const method = Reflect.get(target, property)
    if (typeof method !== "function") return method
    if (property === "shouldLog") return method.bind(target)
    return (...args: unknown[]) => method.apply(target, args.map((arg) => redact(arg)))
  },
})
