import { useState } from "react";
import type { CardBalance, Run } from "../types";
import { today } from "../lib/dates";
import { currency } from "../lib/money";
import { signedCents } from "../lib/features";
import { saveCards } from "../lib/planning";
export function CardSettings({
  family,
  data,
  busy,
  run,
}: {
  family: string;
  data?: CardBalance;
  busy: boolean;
  run: Run;
}) {
  const [amount, setAmount] = useState(String(data?.opening_amount ?? ""));
  const [date, setDate] = useState(data?.opening_on ?? today());
  const [error, setError] = useState("");
  return (
    <article className="card-settings">
      <h3>Остаток на картах</h3>
      <p className="hint">
        Укажите общую сумму на картах на начало выбранного дня, до операций
        этого дня. Более ранние операции повторно не учитываются. Остаток
        переносится между месяцами.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          void run(async () => {
            try {
              await saveCards(family, amount, date, data?.version ?? 0);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Не удалось сохранить");
              throw e;
            }
          }, "Начальный остаток сохранён");
        }}
      >
        <fieldset disabled={busy}>
          <div className="twocol">
            <label>
              Начальный остаток, ₽
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              На начало дня
              <input
                type="date"
                min="1900-01-01"
                max="9998-12-31"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          {data?.balance_cents != null && (
            <p className="hint">
              Остаток за выбранный период:{" "}
              {currency(signedCents(data.balance_cents))}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button>Сохранить остаток</button>
        </fieldset>
      </form>
    </article>
  );
}
