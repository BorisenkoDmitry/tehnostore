import { catalogBranchIds, categoryShortcuts, hasCategoryShortcutCycle, resolveCategoryNavigation } from "../catalog-hierarchy"
import type { NavigationItem } from "../../modules/navigation/types"

const folders = Array.from({ length: 5 }, (_, index) => ({
  id: `branch-${index}`, handle: `branch-${index}`, parent_category_id: null as string | null, is_active: true, is_internal: false,
}))
const categories = [...folders,
  { ...folders[0], id: "headphones", handle: "headphones", parent_category_id: "branch-0" },
  { ...folders[0], id: "wireless", handle: "wireless", parent_category_id: "headphones" },
]
const shortcuts = folders.slice(1).map(({ id }) => ({ parent_id: id, category_id: "headphones" }))

describe("additional catalog branches", () => {
  it("shares one category and its subtree across five parents", () => {
    for (const { id } of folders) {
      expect([...catalogBranchIds(categories, shortcuts, id)]).toEqual([id, "headphones", "wireless"])
    }
    const overlapping = [...shortcuts, { parent_id: "branch-0", category_id: "branch-1" }]
    expect([...catalogBranchIds(categories, overlapping, "branch-0")].filter((id) => id === "headphones")).toHaveLength(1)
    expect([...catalogBranchIds(categories, shortcuts.slice(1), "branch-1")]).toEqual(["branch-1"])
  })

  it("rejects a cycle spanning primary and additional links", () => {
    expect(hasCategoryShortcutCycle(categories, shortcuts)).toBe(false)
    expect(hasCategoryShortcutCycle(categories, [...shortcuts, { parent_id: "wireless", category_id: "branch-1" }])).toBe(true)
  })

  it("resolves both menu entries to the same category under their own parents", () => {
    const nodes = categories.map(({ id, parent_category_id }) => ({ id: `menu-${id}`, parent_id: parent_category_id && `menu-${parent_category_id}`,
      category_id: id, label: id, visible: true, href: "/old" }))
    const menu: NavigationItem = { id: "catalog", kind: "catalog", label: "Каталог", visible: true, href: "", children: [
      ...nodes, { ...nodes[5], id: "shortcut", parent_id: "menu-branch-4", category_shortcut: true },
    ] }
    const [{ children = [] }] = resolveCategoryNavigation([menu], categories)
    expect(children.filter(({ category_id }) => category_id === "headphones").map(({ parent_id, href }) => [parent_id, href]))
      .toEqual([["menu-branch-0", "/collection/headphones"], ["menu-branch-4", "/collection/headphones"]])
    expect(categoryShortcuts(children)).toEqual([{ parent_id: "branch-4", category_id: "headphones" }])
  })
})
