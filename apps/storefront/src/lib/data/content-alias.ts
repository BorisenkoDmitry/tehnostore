import "server-only"
import { notFound, redirect } from "next/navigation"
import { getContentPages } from "./content"

export async function redirectToPublishedPage(countryCode: string, aliases: string[]) {
  const slugs = new Set((await getContentPages()).map((page) => page.slug))
  const slug = aliases.find((alias) => slugs.has(alias))
  if (!slug) notFound()
  redirect(`/${countryCode}/page/${encodeURIComponent(slug)}`)
}
