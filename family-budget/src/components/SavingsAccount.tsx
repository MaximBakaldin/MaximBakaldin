import { AccountTransfer } from "./AccountTransfer";
import { Help } from "./Help";
import { Modal } from "./Modal";
import { useState } from "react";
import type {
  Run,
  FinancialGoal,
  AccountTransfer as Transfer,
  Savings,
  SavingsDraft,
  SavingsKind,
  SavingsAccountData,
} from "../types";
import { currency, parseMoney } from "../lib/money";
import { saveSavings, saveSavingsAccount, signedCents } from "../lib/features";
import { today } from "../lib/dates";
const labels = {
  opening: "Начальный остаток",
  deposit: "Пополнение",
  withdrawal: "Снятие",
  interest: "Проценты",
};
type AccountForm = {
  id: string;
  name: string;
  version: number;
  rate: string;
  start: string;
  frequency: "daily" | "monthly";
  goal: string;
};
export function SavingsAccount({
  family,
  month,
  data,
  busy,
  run,
  goals = [],
  transfers = [],
}: {
  family: string;
  month: string;
  data: Savings;
  busy: boolean;
  run: Run;
  goals?: FinancialGoal[];
  transfers?: Transfer[];
}) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);
  const [draft, setDraft] = useState<SavingsDraft | null>(null);
  const [formError, setFormError] = useState("");
  const accounts = data.accounts ?? [];
  function editAccount(a?: SavingsAccountData) {
    setFormError("");
    setAccountForm({
      id: a?.id ?? crypto.randomUUID(),
      name: a?.name ?? "",
      version: a?.version ?? 0,
      rate: a?.annual_rate == null ? "" : String(a.annual_rate),
      start: a?.interest_start ?? today(),
      frequency: a?.interest_frequency ?? "monthly",
      goal: a?.goal_id ?? "",
    });
  }
  function create(a: SavingsAccountData, kind: SavingsKind) {
    setFormError("");
    setDraft({
      id: crypto.randomUUID(),
      version: 0,
      kind,
      account_id: a.id,
      amount: "",
      occurred_on: today().startsWith(month) ? today() : month + "-01",
      comment: "",
    });
  }
  return (
    <section>
      <div className="section-heading">
        <h2>
          Накопления{" "}
          <Help label="Накопления и проценты">
            Показаны все счета на конец выбранного месяца. Пополнения и снятия
            меняют остаток на картах. Цель определяется настройками счёта.
            Автопроценты увеличивают баланс накоплений; начисляются за
            завершённые дни или месяцы, без будущих начислений. Ставка
            применяется к остатку на конец дня, год — 365 или 366 дней.
            Изменение ставки, даты начала или прошлых движений пересчитает
            проценты.
          </Help>
        </h2>
        <button className="tiny" onClick={() => editAccount()}>
          Новый счёт
        </button>
      </div>
      <div className="line savings-total">
        <small>Всего на счетах</small>
        <b>{currency(signedCents(data.balance_cents))}</b>
      </div>
      {!accounts.length && (
        <p className="empty">Создайте первый накопительный счёт.</p>
      )}
      {accounts.map((a) => (
        <article
          className="savings-card"
          key={a.id}
          aria-label={`Счёт ${a.name}`}
        >
          <div className="line">
            <h3>{a.name}</h3>
            <button
              className="tiny"
              aria-label={`Настроить счёт ${a.name}`}
              onClick={() => editAccount(a)}
            >
              Настроить
            </button>
          </div>
          <small className="account-goal">
            Цель: {goals.find((g) => g.id === a.goal_id)?.name ?? "Без цели"}
          </small>
          <div className="line">
            <strong className="account-balance">
              {currency(signedCents(a.balance_cents))}
            </strong>
            <small>
              {a.annual_rate != null && Number(a.annual_rate) > 0
                ? `${Number(a.annual_rate)}% годовых · ${a.interest_frequency === "daily" ? "ежедневно" : "ежемесячно"}`
                : "Без процентов"}
            </small>
          </div>
          {Number(a.interest_cents ?? 0) > 0 && (
            <small className="green">
              Начислено за месяц: +{currency(signedCents(a.interest_cents!))}
            </small>
          )}
          <div className="actions">
            <button
              className="tiny"
              aria-label={`Пополнить ${a.name}`}
              onClick={() => create(a, "deposit")}
            >
              Пополнить
            </button>
            <button
              className="tiny"
              aria-label={`Снять со счёта ${a.name}`}
              onClick={() => create(a, "withdrawal")}
            >
              На карту
            </button>
            {!a.has_opening && (
              <button
                className="tiny"
                aria-label={`Начальный остаток: ${a.name}`}
                onClick={() => create(a, "opening")}
              >
                Начальный остаток
              </button>
            )}
          </div>
          <details className="savings-history">
            <summary>История</summary>
            {!data.entries.some((e) => e.account_id === a.id) && (
              <p className="hint">За этот месяц движений нет.</p>
            )}
            {data.entries
              .filter((e) => e.account_id === a.id)
              .map((e) => (
                <div className="saving-entry" key={e.id}>
                  <div className="line">
                    <div>
                      <b>{labels[e.kind]}</b>
                      <small>{e.occurred_on}</small>
                    </div>
                    <b>
                      {e.kind === "withdrawal" ? "−" : "+"}
                      {currency(parseMoney(e.amount))}
                    </b>
                  </div>
                  {e.comment && e.kind !== "interest" && (
                    <p className="comment">{e.comment}</p>
                  )}
                  {e.kind !== "interest" && (
                    <div className="actions">
                      <button
                        className="tiny"
                        disabled={busy}
                        onClick={() => {
                          if (e.transfer_id) {
                            setTransfer(
                              transfers.find((t) => t.id === e.transfer_id) ??
                                null,
                            );
                            return;
                          }
                          setFormError("");
                          setDraft({
                            ...e,
                            kind: e.kind as SavingsKind,
                            amount: String(e.amount),
                            comment: e.comment ?? "",
                          });
                        }}
                      >
                        Изменить перевод
                      </button>
                      <button
                        className="tiny danger"
                        disabled={busy}
                        onClick={() => {
                          if (e.transfer_id) {
                            setTransfer(
                              transfers.find((t) => t.id === e.transfer_id) ??
                                null,
                            );
                            return;
                          }
                          if (
                            confirm(
                              "Удалить движение? Автопроценты будут пересчитаны.",
                            )
                          )
                            void run(async () => {
                              await saveSavings(
                                family,
                                {
                                  ...e,
                                  kind: e.kind as SavingsKind,
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
                  )}
                </div>
              ))}
          </details>
        </article>
      ))}
      {accounts.length > 1 && (
        <button
          className="tiny secondary"
          onClick={() =>
            setTransfer({
              id: crypto.randomUUID(),
              household_id: family,
              version: 0,
              from_account: accounts[0].id,
              to_account: accounts[1].id,
              amount: "",
              occurred_on: today(),
              comment: "",
            })
          }
        >
          Между счетами
        </button>
      )}
      {transfer && (
        <AccountTransfer
          initial={transfer}
          accounts={accounts}
          busy={busy}
          run={run}
          onClose={() => setTransfer(null)}
        />
      )}
      {accountForm && (
        <Modal
          title={accountForm.version ? "Настройки счёта" : "Новый счёт"}
          onClose={() => {
            if (!busy) setAccountForm(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFormError("");
              void run(async () => {
                try {
                  await saveSavingsAccount(
                    family,
                    accountForm.id,
                    accountForm.name,
                    accountForm.version,
                    {
                      annual_rate: accountForm.rate.trim()
                        ? accountForm.rate.replace(",", ".")
                        : null,
                      interest_start: accountForm.start || null,
                      interest_frequency: accountForm.frequency,
                    },
                    accountForm.goal || null,
                  );
                } catch (e) {
                  setFormError(
                    e instanceof Error ? e.message : "Не удалось сохранить",
                  );
                  throw e;
                }
              }, "Счёт сохранён").then((ok) => {
                if (ok) setAccountForm(null);
              });
            }}
          >
            <fieldset disabled={busy}>
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
              <label>
                Связанная цель
                <select
                  value={accountForm.goal}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, goal: e.target.value })
                  }
                >
                  <option value="">Без цели</option>
                  {goals
                    .filter((g) => !g.archived)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </label>
              <small className="hint">
                Весь баланс относится к цели. Привязку можно менять; прошлые
                движения сохраняются.
              </small>
              <label>
                Годовая ставка, %
                <input
                  inputMode="decimal"
                  placeholder="Без процентов"
                  value={accountForm.rate}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, rate: e.target.value })
                  }
                />
              </label>
              <div className="twocol">
                <label>
                  Начисление
                  <select
                    value={accountForm.frequency}
                    onChange={(e) =>
                      setAccountForm({
                        ...accountForm,
                        frequency: e.target.value as "daily" | "monthly",
                      })
                    }
                  >
                    <option value="monthly">Ежемесячно</option>
                    <option value="daily">Ежедневно</option>
                  </select>
                </label>
                <label>
                  Начало расчёта
                  <input
                    type="date"
                    min="1900-01-01"
                    max="9998-12-31"
                    required={Boolean(accountForm.rate)}
                    value={accountForm.start}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, start: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="hint">
                Проценты увеличивают баланс автоматически. Изменение этих
                условий пересчитает начисления с даты начала. Расчёт по остатку
                на конец дня; условия банка могут отличаться.
              </p>
              {formError && (
                <p role="alert" className="error">
                  {formError}
                </p>
              )}
              <div className="actions">
                <button>Сохранить счёт</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setAccountForm(null)}
                >
                  Отмена
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal
          title={`${labels[draft.kind]} · ${accounts.find((a) => a.id === draft.account_id)?.name ?? ""}`}
          onClose={() => {
            if (!busy) setDraft(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFormError("");
              void run(async () => {
                try {
                  await saveSavings(family, draft);
                } catch (e) {
                  setFormError(
                    e instanceof Error ? e.message : "Не удалось сохранить",
                  );
                  throw e;
                }
              }, "Накопления обновлены").then((ok) => {
                if (ok) setDraft(null);
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Счёт движения
                <select
                  value={draft.account_id}
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
              {draft.kind !== "opening" && (
                <p className="hint">
                  {draft.kind === "deposit"
                    ? "С карт → накопления"
                    : "Накопления → карты. Расхода пока нет."}{" "}
                  · Цель:{" "}
                  {goals.find(
                    (g) =>
                      g.id ===
                      accounts.find((a) => a.id === draft.account_id)?.goal_id,
                  )?.name ?? "Без цели"}
                </p>
              )}
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
              {formError && (
                <p role="alert" className="error">
                  {formError}
                </p>
              )}
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
        </Modal>
      )}
    </section>
  );
}
