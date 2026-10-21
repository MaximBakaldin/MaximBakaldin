import { useState } from "react";
import type { Category, Draft } from "../types";
import { parseMoney } from "../lib/money";
import { validDate } from "../lib/dates";
export function TransactionForm({
  initial,
  cats,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  cats: Category[];
  busy: boolean;
  onSave: (draft: Draft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
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
    <section>
      <h2>{draft.version ? "Редактирование" : "Новая операция"}</h2>
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
          <span className="fieldlabel" id="category-label">
            Категория
          </span>
          <div className="chips" role="group" aria-labelledby="category-label">
            {cats
              .filter((c) => c.kind === draft.kind)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={draft.category_id === c.id}
                  className={draft.category_id === c.id ? "active" : ""}
                  onClick={() => change({ category_id: c.id })}
                >
                  {c.name}
                </button>
              ))}
          </div>
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
          <label>
            Комментарий
            <input
              maxLength={2000}
              value={draft.comment}
              placeholder="Например, продукты на неделю"
              onChange={(e) => change({ comment: e.target.value })}
            />
          </label>
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
        </fieldset>
      </form>
    </section>
  );
}
