"use strict"
const path = require("path")

// This is the canonical source of dist/http/logging-security.js in the pinned
// framework patch. Kept independently executable for patch regression tests.
function safeAccessPath(value) {
  let pathname = String(value || "").split(/[?#]/, 1)[0]
  try { pathname = decodeURIComponent(pathname) } catch { return "[INVALID_PATH]" }
  return pathname
    .replace(/(\/preview\/)[^/]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .replace(/[\r\n\t]/g, "")
}

function guardPublicStatic(req, res, next) {
  let pathname
  try { pathname = decodeURIComponent(req.path) } catch { return res.sendStatus(400) }
  const segments = pathname.replace(/\\/g, "/").split("/")
  // Protect existing exports too, before Express static can serve any bytes.
  if (segments.some((part) => part.startsWith(".") || part.toLowerCase().startsWith("private-")) ||
      ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico"].includes(path.extname(pathname).toLowerCase())) {
    return res.sendStatus(404)
  }
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'")
  next()
}

module.exports = { safeAccessPath, guardPublicStatic }
