import { Help } from "./Help";
import { useState } from "react";
import type { Run, Savings, SavingsDraft, SavingsKind } from "../types";
import { currency, parseMoney } from "../lib/money";
import { saveSavings, saveSavingsAccount, signedCents } from "../lib/features";
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
  const [selected, setSelected] = useState("");
  const [accountForm, setAccountForm] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);
  const accounts = data.accounts ?? [];
  const account = accounts.find((a) => a.id === selected) ?? accounts[0];
  const entries = data.entries.filter((e) => e.account_id === account?.id);
  const [draft, setDraft] = useState<SavingsDraft | null>(null);
  function create(kind: SavingsKind) {
    setDraft({
      id: crypto.randomUUID(),
      version: 0,
      kind,
      account_id: account?.id,
      amount: "",
      occurred_on: today().startsWith(month) ? today() : month + "-01",
      comment: "",
    });
  }
  return (
    <section>
      <h2>
        Накопительные счета{" "}
        <Help label="Накопительный счёт">
          Пополнение уменьшает свободные деньги месяца, снятие возвращает их.
          Переводы и начальный остаток не входят в доходы и расходы.
        </Help>
      </h2>
      <div className="account-toolbar">
        <label>
          Накопительный счёт
          <select
            value={account?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setDraft(null);
            }}
          >
            {!accounts.length && <option value="">Создайте счёт</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="tiny"
          onClick={() =>
            setAccountForm({ id: crypto.randomUUID(), name: "", version: 0 })
          }
        >
          Новый счёт
        </button>
        {account && (
          <button className="tiny" onClick={() => setAccountForm(account)}>
            Переименовать
          </button>
        )}
      </div>
      {accountForm && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveSavingsAccount(
                family,
                accountForm.id,
                accountForm.name,
                accountForm.version,
              );
            }, "Счёт сохранён").then((ok) => {
              if (ok) {
                setSelected(accountForm.id);
                setAccountForm(null);
                setDraft(null);
              }
            });
          }}
        >
          <label>
            Название счёта
            <input
              autoFocus
              required
              maxLength={60}
              value={accountForm.name}
              onChange={(e) =>
                setAccountForm({ ...accountForm, name: e.target.value })
              }
            />
          </label>
          <div className="actions">
            <button disabled={busy}>Сохранить счёт</button>
            <button
              type="button"
              className="ghost"
              onClick={() => setAccountForm(null)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {account && (
        <>
          <article className="hero compact-hero">
            <small>
              {account.name} · на конец {month}
            </small>
            <h2>{currency(signedCents(account.balance_cents))}</h2>
            <small>
              Переводы за месяц: {currency(signedCents(account.transfer_cents))}
            </small>
          </article>

          <div className="actions">
            {!account.has_opening && (
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
                  Счёт движения
                  <select
                    required
                    value={draft.account_id ?? account.id}
                    onChange={(e) =>
                      setDraft({ ...draft, account_id: e.target.value })
                    }
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Сумма перевода, ₽
                  <input
                    autoFocus
                    inputMode="decimal"
                    required
                    value={draft.amount}
                    onChange={(e) =>
                      setDraft({ ...draft, amount: e.target.value })
                    }
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
          {!entries.length && (
            <p className="hint">
              В этом месяце движений нет. Начальный остаток и старые переводы
              доступны в своих месяцах.
            </p>
          )}
          {entries.map((e) => (
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
                      if (
                        confirm("Удалить это движение по накопительному счёту?")
                      )
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
        </>
      )}
    </section>
  );
}
