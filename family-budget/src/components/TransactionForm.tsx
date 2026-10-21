import { popularCategories, type CategoryUsage } from "../lib/categories";
import { useEffect, useRef, useState } from "react";
import type { Category, Draft } from "../types";
import { parseMoney } from "../lib/money";
import { CategorySelect } from "./CategorySelect";
import { validDate } from "../lib/dates";
export function TransactionForm({
  initial,
  cats,
  categoryUsage = [],
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  cats: Category[];
  categoryUsage?: CategoryUsage[];
  busy: boolean;
  onSave: (draft: Draft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [commentOpen, setCommentOpen] = useState(Boolean(initial.comment));
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const reposition = () => {
      // Mobile keyboards can shrink only the visual viewport, leaving fixed
      // elements behind the keyboard unless its inset is accounted for.
      const inset =
        viewport.scale === 1
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop,
            )
          : 0;
      section.current?.style.setProperty("--keyboard-inset", `${inset}px`);
    };
    reposition();
    viewport.addEventListener("resize", reposition);
    viewport.addEventListener("scroll", reposition);
    return () => {
      viewport.removeEventListener("resize", reposition);
      viewport.removeEventListener("scroll", reposition);
    };
  }, []);
  const change = (value: Partial<Draft>) =>
    setDraft((old) => ({ ...old, ...value }));
  async function submit() {
    setError("");
    try {
      parseMoney(draft.amount);
      if (!validDate(draft.occurred_on))
        throw new Error("Выберите корректную дату");
      if (
        !cats.some((c) => c.id === draft.category_id && c.kind === draft.kind)
      )
        throw new Error("Выберите категорию");
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте данные");
    }
  }
  return (
    <section className="transaction-form" ref={section}>
      <h2 className="sr-only">
        {draft.version ? "Редактирование операции" : "Новая операция"}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Операция</legend>
          <div className="toggle">
            {(["expense", "income"] as const).map((kind) => (
              <button
                type="button"
                key={kind}
                aria-pressed={draft.kind === kind}
                className={draft.kind === kind ? "selected" : ""}
                onClick={() => change({ kind, category_id: "" })}
              >
                {kind === "expense" ? "Расход" : "Доход"}
              </button>
            ))}
          </div>
          <div className="transaction-fields">
            <label>
              Сумма, ₽
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                required
                value={draft.amount}
                onChange={(e) => change({ amount: e.target.value })}
              />
            </label>
            <label>
              Дата
              <input
                type="date"
                min="1900-01-01"
                max="9998-12-31"
                required
                value={draft.occurred_on}
                onChange={(e) => change({ occurred_on: e.target.value })}
              />
            </label>
          </div>
          <div
            className="quick-categories"
            role="group"
            aria-label="Быстрый выбор категории"
          >
            {popularCategories(
              cats.filter((c) => c.kind === draft.kind),
              categoryUsage,
            ).map((c) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={draft.category_id === c.id}
                className={draft.category_id === c.id ? "selected" : ""}
                onClick={() => change({ category_id: c.id })}
              >
                {c.name}
              </button>
            ))}
          </div>
          <CategorySelect
            key={draft.kind}
            cats={cats.filter((c) => c.kind === draft.kind)}
            value={draft.category_id}
            onChange={(category_id) => change({ category_id })}
          />
          <button
            type="button"
            className="tiny comment-toggle"
            aria-expanded={commentOpen}
            aria-controls="transaction-comment"
            onClick={() => setCommentOpen(!commentOpen)}
          >
            {commentOpen
              ? "Скрыть комментарий"
              : draft.comment
                ? "Комментарий · заполнен"
                : "+ Комментарий"}
          </button>
          <label hidden={!commentOpen} id="transaction-comment">
            Комментарий
            <input
              maxLength={2000}
              value={draft.comment}
              placeholder="Например, продукты на неделю"
              onChange={(e) => change({ comment: e.target.value })}
            />
          </label>
          <div className="transaction-dock">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit">{busy ? "Сохраняем…" : "Сохранить"}</button>
              <button type="button" className="ghost" onClick={onCancel}>
                Отмена
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
