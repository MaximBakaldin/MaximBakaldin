import type { Recurring } from "../types";
import { parseMoney, total } from "./money";
export function obligations(items: Recurring[], category?: string) {
  return {
    paid: total(
      items
        .filter(
          (r) =>
            r.payment?.kind === "expense" &&
            (!category || r.payment.category_id === category),
        )
        .map((r) => parseMoney(r.payment!.amount)),
    ),
    pending: total(
      items
        .filter(
          (r) =>
            r.active && !r.payment && (!category || r.category_id === category),
        )
        .map((r) => parseMoney(r.amount)),
    ),
  };
}
