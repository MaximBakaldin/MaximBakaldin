import type { Category } from "../types";
export type CategoryUsage = { category_id: string; uses: number | string };
export function rankedCategories(cats: Category[], usage: CategoryUsage[]) {
  const counts = new Map(usage.map((u) => [u.category_id, Number(u.uses)]));
  return cats
    .filter((c) => !c.archived)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
}

export const popularCategories = (cats: Category[], usage: CategoryUsage[]) =>
  rankedCategories(cats, usage).slice(0, 5);
