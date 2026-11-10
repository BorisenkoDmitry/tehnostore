"use strict"

// Collect only positive equality conjuncts. PostgreSQL JSONB containment is
// compositional for distinct scalar leaves and contains-all array predicates.
// OR, NOT, null/absence, ranges, and conflicting scalar values stay separate.
module.exports = function combineContainment(branch, plan, castScalar) {
  const merged = Object.create(null)
  const leaves = new Map()
  const rest = []
  const terms = []
  const flatten = (input) => {
    for (const [field, raw] of Object.entries(input)) {
      if (field === "q") continue
      if (field === "$and" && Array.isArray(raw)) raw.forEach(flatten)
      else terms.push([field, raw])
    }
  }
  flatten(branch)
  for (const [path, raw] of terms) {
    const field = plan.fields.get(path)
    let values
    if (raw != null && typeof raw !== "object") values = [raw]
    else if (Array.isArray(raw) && raw.length === 1) values = raw
    else if (raw && !Array.isArray(raw) && typeof raw === "object") {
      const keys = Object.keys(raw)
      if (keys.length === 1 && keys[0] === "$eq") values = [raw.$eq]
      else if (keys.length === 1 && keys[0] === "$in" && Array.isArray(raw.$in) && raw.$in.length === 1) values = raw.$in
      else if (keys.length === 1 && keys[0] === "$contains" && field?.is_array) values = Array.isArray(raw.$contains) ? raw.$contains : [raw.$contains]
    }
    if (!field || !values?.length || values.some((value) => value == null || typeof value === "object")) { rest.push([path, raw]); continue }
    const cast = values.map((value) => castScalar(field, value))
    const previous = leaves.get(path)
    if (!field.is_array && previous && previous[0] !== cast[0]) { rest.push([path, raw]); continue }
    const leaf = field.is_array ? [...new Set([...(previous || []), ...cast])] : cast
    leaves.set(path, leaf)
    let target = merged
    const segments = path.split(".")
    for (const segment of segments.slice(0, -1)) {
      if (!Object.prototype.hasOwnProperty.call(target, segment)) target[segment] = Object.create(null)
      target = target[segment]
    }
    target[segments[segments.length - 1]] = field.is_array ? leaf : leaf[0]
  }
  return { merged, rest }
}
