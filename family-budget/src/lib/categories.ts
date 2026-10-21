import type { Category } from "../types";
export type CategoryUsage = { category_id: string; uses: number | string };
export function popularCategories(cats: Category[], usage: CategoryUsage[]) {
  const counts = new Map(usage.map((u) => [u.category_id, Number(u.uses)]));
  return cats
    .filter((c) => !c.archived)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .slice(0, 6);
}
