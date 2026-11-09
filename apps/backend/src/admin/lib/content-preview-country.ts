export function contentPreviewCountry(data?: { profile: { region_id: string } | null; regions: { id: string; countries?: { iso_2: string }[] }[] }) {
  const code = data?.regions.find((region) => region.id === data.profile?.region_id)?.countries?.[0]?.iso_2
  return code && /^[a-z]{2}$/i.test(code) ? code.toLowerCase() : undefined
}
