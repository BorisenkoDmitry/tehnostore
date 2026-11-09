export function safeDescriptionHref(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return undefined
  if (/^\/(?!\/)/.test(value) || /^#[\w-]+$/.test(value)) return value
  try {
    const url = new URL(value)
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
