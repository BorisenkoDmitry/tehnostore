"use client"

import { useState } from "react"

export default function CopyCompanyDetails({
  className,
  details,
}: {
  className?: string
  details: string
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details)
      setStatus("copied")
    } catch {
      setStatus("failed")
    }
  }
  return (
    <div>
      <button type="button" onClick={copy} className={className}>
        Скопировать реквизиты
      </button>
      <span
        role="status"
        aria-live="polite"
        style={{ display: "block", fontSize: 13 }}
      >
        {status === "copied"
          ? "Реквизиты скопированы"
          : status === "failed"
          ? "Выделите и скопируйте реквизиты выше вручную."
          : ""}
      </span>
    </div>
  )
}
