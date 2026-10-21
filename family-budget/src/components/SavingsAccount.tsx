import { useState } from "react";
import type { Run, Savings, SavingsDraft, SavingsKind } from "../types";
import { currency, parseMoney } from "../lib/money";
import { saveSavings, signedCents } from "../lib/features";
import { today } from "../lib/dates";
const labels: Record<SavingsKind, string> = {
  opening: "Начальный остаток",
  deposit: "Пополнение",
  withdrawal: "Снятие",
};
export function SavingsAccount({
  family,
  month,
  data,
  busy,
  run,
}: {
  family: string;
  month: string;
  data: Savings;
  busy: boolean;
  run: Run;
}) {
  const [draft, setDraft] = useState<SavingsDraft | null>(null);
  function create(kind: SavingsKind) {
    setDraft({
      id: crypto.randomUUID(),
      version: 0,
      kind,
      amount: "",
      occurred_on: today().startsWith(month) ? today() : month + "-01",
      comment: "",
    });
  }
  return (
    <section>
      <h2>Накопительный счёт</h2>
      <article className="hero compact-hero">
        <small>Баланс на конец {month}</small>
        <h2>{currency(signedCents(data.balance_cents))}</h2>
        <small>
          Переводы за месяц: {currency(signedCents(data.transfer_cents))}
        </small>
      </article>
      <p className="hint">
        Пополнение уменьшает свободные деньги месяца, снятие возвращает их.
        Переводы и начальный остаток не входят в доходы и расходы.
      </p>
      <div className="actions">
        {!data.has_opening && (
          <button className="secondary" onClick={() => create("opening")}>
            Задать начальный остаток
          </button>
        )}
        <button onClick={() => create("deposit")}>Пополнить</button>
        <button className="secondary" onClick={() => create("withdrawal")}>
          Снять
        </button>
      </div>
      {draft && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveSavings(family, draft);
            }, "Накопления обновлены").then((ok) => {
              if (ok) setDraft(null);
            });
          }}
        >
          <fieldset disabled={busy}>
            <h3>{labels[draft.kind]}</h3>
            <label>
              Сумма перевода, ₽
              <input
                autoFocus
                inputMode="decimal"
                required
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </label>
            <label>
              Дата перевода
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
              Комментарий перевода
              <input
                maxLength={2000}
                value={draft.comment}
                onChange={(e) =>
                  setDraft({ ...draft, comment: e.target.value })
                }
              />
            </label>
            <div className="actions">
              <button>Сохранить перевод</button>
              <button
                type="button"
                className="ghost"
                onClick={() => setDraft(null)}
              >
                Отмена
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <h3>Движения за {month}</h3>
      {!data.entries.length && (
        <p className="hint">
          В этом месяце движений нет. Начальный остаток и старые переводы
          доступны в своих месяцах.
        </p>
      )}
      {data.entries.map((e) => (
        <article key={e.id} className="entry">
          <div>
            <b>{labels[e.kind]}</b>
            <small>{e.occurred_on}</small>
            {e.comment && <p className="comment">{e.comment}</p>}
          </div>
          <div className="entryright">
            <b>
              {e.kind === "withdrawal" ? "−" : "+"}
              {currency(parseMoney(e.amount))}
            </b>
            <div>
              <button
                className="tiny"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    ...e,
                    amount: String(e.amount),
                    comment: e.comment ?? "",
                  })
                }
              >
                Изменить перевод
              </button>
              <button
                className="tiny danger"
                disabled={busy}
                onClick={() => {
                  if (confirm("Удалить это движение по накопительному счёту?"))
                    void run(async () => {
                      await saveSavings(
                        family,
                        {
                          ...e,
                          amount: String(e.amount),
                          comment: e.comment ?? "",
                        },
                        true,
                      );
                    }, "Движение удалено");
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
