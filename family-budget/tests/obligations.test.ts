import { expect, it } from "vitest";
import { obligations } from "../src/lib/obligations";
import { bulletScale } from "../src/components/Bullet";
import type { Recurring } from "../src/types";
it("оплаченные обязательные входят в факт, неоплаченные стоят после него", () => {
  const rules = [
    { active: true, category_id: "food", amount: "100", payment: null },
    {
      active: false,
      category_id: "food",
      amount: "500",
      payment: { kind: "expense", category_id: "home", amount: "400" },
    },
    { active: false, category_id: "food", amount: "200", payment: null },
  ] as Recurring[];
  expect(obligations(rules)).toEqual({ paid: 40000, pending: 10000 });
  expect(obligations(rules, "food")).toEqual({ paid: 0, pending: 10000 });
  expect(obligations(rules, "home")).toEqual({ paid: 40000, pending: 0 });
  const s = bulletScale(60000, 50000, undefined, 40000, 10000);
  expect(s.over).toBe(true);
  expect(s.paid).toBeLessThan(s.fill);
  expect(s.fill + s.pending).toBe(100);
});
