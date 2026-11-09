import { SVGProps } from "react"

export type IconName = "catalog" | "close" | "bag" | "phone" | "mail" | "clock" | "telegram" | "arrow" | "plus" | "info" | "truck" | "shield" | "pin" | "chat" | "question" | "account" | "wallet"

export function StoreIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {name === "catalog" && <path d="M4 6h16M4 12h16M4 18h10" />}
    {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    {name === "bag" && <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M8 8V7a4 4 0 0 1 8 0v1" /></>}
    {name === "phone" && <path d="M7.5 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3.5l-5-2-2 2a14 14 0 0 1-6.5-6.5l2-2-2-5Z" />}
    {name === "mail" && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>}
    {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === "telegram" && <><path d="m3 11 18-7-4 17-6-5-4 3v-6l10-6-8 7-6-3Z" /><path d="m11 16 6-9" /></>}
    {name === "arrow" && <path d="M4 12h15m-6-6 6 6-6 6" />}
    {name === "plus" && <path d="M12 5v14M5 12h14" />}
    {name === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>}
    {name === "truck" && <><path d="M3 6h11v11H3V6Zm11 4h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>}
    {name === "shield" && <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>}
    {name === "pin" && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    {name === "chat" && <><path d="M4 4h16v12H9l-5 4V4Z" /><path d="M8 8h8M8 12h5" /></>}
    {name === "question" && <><circle cx="12" cy="12" r="9" /><path d="M9.5 8.5a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2.5M12 17h.01" /></>}
    {name === "account" && <><circle cx="12" cy="7" r="3.5" /><path d="M5 20.5v-2a7 7 0 0 1 14 0v2" /></>}
    {name === "wallet" && <><path d="M20 7V5a2 2 0 0 0-2-2L5 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h15V7H5a2 2 0 0 1 0-4" /><path d="M20 11h-5v6h5M17 14h.01" /></>}
  </svg>
}
