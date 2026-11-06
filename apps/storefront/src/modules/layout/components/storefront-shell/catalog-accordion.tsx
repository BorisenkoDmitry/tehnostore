"use client"

import { ReactNode, useId, useState } from "react"

export default function CatalogAccordion({ label, children, className, defaultOpen = false }: {
  label: ReactNode
  children: ReactNode
  className: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return <div className={`${className} texno-accordion ${open ? "is-open" : ""}`}>
    <button type="button" className="texno-accordion-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}</button>
    <div id={id} className="texno-accordion-reveal" aria-hidden={!open} inert={!open}>
      <div className="texno-accordion-clip"><div className="texno-accordion-content">{children}</div></div>
    </div>
  </div>
}
