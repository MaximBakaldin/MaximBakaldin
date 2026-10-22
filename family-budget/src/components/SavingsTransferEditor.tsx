import { useState } from "react";
import { Modal } from "./Modal";
import { saveSavings } from "../lib/features";
import type { Run, SavingsDraft } from "../types";
export function SavingsTransferEditor({
  family,
  initial,
  accountName,
  busy,
  run,
  onClose,
}: {
  family: string;
  initial: SavingsDraft;
  accountName: string;
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  return (
    <Modal
      title="Изменить движение счёта"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <small>
        {accountName} ·{" "}
        {draft.kind === "deposit"
          ? "Пополнение"
          : draft.kind === "withdrawal"
            ? "Снятие"
            : "Начальный остаток"}
      </small>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          void run(async () => {
            try {
              await saveSavings(family, draft);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Не удалось сохранить");
              throw e;
            }
          }, "Движение сохранено").then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Сумма перевода, ₽
            <input
              autoFocus
              required
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
          </label>
          <label>
            Дата движения
            <input
              type="date"
              min="1900-01-01"
              max="9998-12-31"
              required
              value={draft.occurred_on}
              onChange={(e) =>
                setDraft({ ...draft, occurred_on: e.target.value })
              }
            />
          </label>
          <label>
            Комментарий
            <input
              maxLength={2000}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button>Сохранить перевод</button>
            <button type="button" className="ghost" onClick={onClose}>
              Отмена
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
