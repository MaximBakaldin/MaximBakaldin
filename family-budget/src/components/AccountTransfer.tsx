import { useState } from "react";
import { Modal } from "./Modal";
import type {
  AccountTransfer as Transfer,
  SavingsAccountData,
  Run,
} from "../types";
import { saveAccountTransfer } from "../lib/planning";
export function AccountTransfer({
  initial,
  accounts,
  busy,
  run,
  onClose,
}: {
  initial: Transfer;
  accounts: SavingsAccountData[];
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  async function save(remove = false) {
    setError("");
    const ok = await run(
      async () => {
        try {
          await saveAccountTransfer(draft, remove);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Не удалось сохранить");
          throw e;
        }
      },
      remove ? "Перевод удалён" : "Перевод между счетами сохранён",
    );
    if (ok) onClose();
  }
  return (
    <Modal
      title="Перевод между счетами"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          <div className="twocol">
            {(["from_account", "to_account"] as const).map((field, i) => (
              <label key={field}>
                {i ? "На счёт" : "Со счёта"}
                <select
                  value={draft[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="twocol">
            <label>
              Сумма, ₽
              <input
                required
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
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
                onChange={(e) =>
                  setDraft({ ...draft, occurred_on: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Комментарий
            <input
              maxLength={2000}
              value={draft.comment ?? ""}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            />
          </label>
          <p className="hint">
            Общая сумма накоплений и остаток на картах не меняются. Если цели
            счетов различаются, деньги переходят к другой цели.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button>Сохранить перевод</button>
            <button type="button" className="ghost" onClick={onClose}>
              Отмена
            </button>
          </div>
          {!!draft.version && (
            <button
              type="button"
              className="tiny danger"
              onClick={() => {
                if (confirm("Удалить перевод между счетами целиком?"))
                  void save(true);
              }}
            >
              Удалить перевод
            </button>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
