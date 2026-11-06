"use client"

import { PointerEvent, ReactNode } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type StoreButtonProps = {
  children: ReactNode
  href?: string
  onClick?: () => void
  className?: string
  fill?: "light" | "blue"
}

export default function StoreButton({ children, href, onClick, className = "", fill = "light" }: StoreButtonProps) {
  const pointerEnter = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    const diameter = Math.ceil(2 * Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y)) + 4)
    event.currentTarget.style.setProperty("--button-fill-x", `${x}px`)
    event.currentTarget.style.setProperty("--button-fill-y", `${y}px`)
    event.currentTarget.style.setProperty("--button-fill-size", `${diameter}px`)
  }
  const props = { className: `texno-primary-button ${className}`, "data-fill": fill, onClick, onPointerEnter: pointerEnter }
  const label = <span>{children}</span>
  return href ? <LocalizedClientLink href={href} {...props}>{label}</LocalizedClientLink> : <button type="button" {...props}>{label}</button>
}
