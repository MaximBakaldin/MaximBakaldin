import { useState } from "react";
import type { FinancialGoal, SavingsAccountData, Run } from "../types";
import { Modal } from "./Modal";
import { Help } from "./Help";
import { goalPlan } from "../lib/goals";
import { saveGoal, captureBaseline } from "../lib/planning";
import { currency, parseMoney } from "../lib/money";
import { currentMonth, monthBounds, monthLabel, today } from "../lib/dates";
const shortMonth = (date: string) =>
  new Date(date.slice(0, 7) + "-01T12:00:00Z")
    .toLocaleDateString("ru-RU", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    })
    .replace(" г.", "");
export function Goals({
  family,
  goals,
  accounts,
  month,
  busy,
  run,
  compact = false,
}: {
  family: string;
  goals: FinancialGoal[];
  accounts: SavingsAccountData[];
  month: string;
  busy: boolean;
  run: Run;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState<FinancialGoal | null>(null),
    [error, setError] = useState("");
  const active = goals.filter((g) => !g.archived);
  const g = goals.find((g) => g.id === selected);
  const plan = g ? goalPlan(g, accounts, month) : null;
  const historical = month < currentMonth();
  const fresh = () => {
    setError("");
    setEdit({
      id: crypto.randomUUID(),
      household_id: family,
      name: "",
      target_amount: "",
      monthly_amount: "",
      deadline: new Date(
        Date.UTC(
          Number(currentMonth().slice(0, 4)) + 1,
          Number(currentMonth().slice(5, 7)),
          0,
        ),
      )
        .toISOString()
        .slice(0, 10),
      version: 0,
      archived: false,
    });
  };
  if (compact && !active.length) return null;
  return (
    <section className={`goals-section${compact ? " dashboard-panel" : ""}`}>
      <div className="section-heading">
        <h3>
          Цели семьи{" "}
          <Help label="План и прогноз целей">
            Плановый срок задаёте вы. Необходимый взнос рассчитывается для этого
            срока; прогноз строится по сумме «Планируем откладывать».
            Начисленные проценты уже в остатке; будущие проценты в прогноз не
            включены. Текущий месяц считается незавершённым.
          </Help>
        </h3>
        {!compact && !historical && (
          <button className="tiny" onClick={fresh}>
            Новая цель
          </button>
        )}
      </div>
      {!active.length && (
        <p className="hint">
          Создайте цель и привяжите к ней накопительный счёт в его настройках.
        </p>
      )}
      <div className="goals-list">
        {active.map((g) => {
          const p = goalPlan(g, accounts, month);
          return (
            <button
              className="goal-row"
              key={g.id}
              onClick={() => {
                setError("");
                setSelected(g.id);
              }}
              aria-label={`Цель ${g.name}`}
            >
              <span className="line progress-heading">
                <span className="progress-name">{g.name}</span>
                <span className="progress-amount">
                  <span>{currency(p.balance + p.paid)}</span> /{" "}
                  <span>{currency(p.target)}</span>
                </span>
              </span>
              <span
                className="goal-track"
                role="progressbar"
                aria-label={g.name}
                aria-valuenow={Math.round(p.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: p.percent + "%" }} />
              </span>
              <span className="goal-facts">
                <span>
                  <small>Плановый срок</small>
                  <b>{shortMonth(g.deadline)}</b>
                </span>
                <span>
                  <small>Прогноз</small>
                  <b className={p.late ? "danger" : ""}>
                    {p.remaining === 0
                      ? "Достигнута"
                      : p.forecast
                        ? shortMonth(p.forecast)
                        : "Нет взноса"}
                    {p.late && " ↑"}
                  </b>
                </span>
                <span>
                  <small>Нужно в месяц</small>
                  <b>{currency(p.required)}</b>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {g && plan && !edit && (
        <Modal title={g.name} onClose={() => setSelected(null)}>
          <div className="goal-details">
            <dl>
              <div>
                <dt>На связанных счетах</dt>
                <dd>{currency(plan.balance)}</dd>
              </div>
              {plan.paid > 0 && (
                <div>
                  <dt>Оплачено на цель</dt>
                  <dd>{currency(plan.paid)}</dd>
                </div>
              )}
              <div>
                <dt>Осталось</dt>
                <dd>{currency(plan.remaining)}</dd>
              </div>
              <div>
                <dt>Плановый срок</dt>
                <dd>{monthLabel(g.deadline.slice(0, 7))}</dd>
              </div>
              <div>
                <dt>Прогноз</dt>
                <dd>
                  {plan.forecast
                    ? monthLabel(plan.forecast)
                    : "Задайте месячный взнос"}
                </dd>
              </div>
              <div>
                <dt>Нужно в месяц</dt>
                <dd>{currency(plan.required)}</dd>
              </div>
              <div>
                <dt>Планируем откладывать</dt>
                <dd>{currency(plan.monthly)}</dd>
              </div>
              <div>
                <dt>Изменение остатка за {shortMonth(month)}</dt>
                <dd>{currency(plan.fact)}</dd>
              </div>
              {plan.open && (
                <div>
                  <dt>Осталось внести в этом месяце</dt>
                  <dd>{currency(plan.thisMonthLeft)}</dd>
                </div>
              )}
            </dl>
            <p className="hint">
              Факт — изменение остатка за месяц, включая начисленные проценты.
              Начальный остаток и смена привязки задают базу и не считаются
              взносом. В текущем месяце показан промежуточный факт. Прогноз
              предполагает выполнение месячного плана, без будущих процентов.
              Снятие уменьшает накопления; оплата покупки, связанная с целью,
              учитывается как выполненная часть цели.
            </p>
            <h4>Связанные счета</h4>
            {accounts
              .filter((a) => a.goal_id === g.id)
              .map((a) => (
                <div className="line" key={a.id}>
                  <span>{a.name}</span>
                  <b>{currency(Number(a.balance_cents))}</b>
                </div>
              ))}
            {!accounts.some((a) => a.goal_id === g.id) && (
              <p className="hint">
                Выберите эту цель в настройках накопительного счёта.
              </p>
            )}
            {g.baseline ? (
              <details>
                <summary>Исходный план · {g.baseline.captured_on}</summary>
                <dl>
                  <div>
                    <dt>Необходимый взнос</dt>
                    <dd>
                      {currency(parseMoney(g.baseline.required_amount, true))}
                    </dd>
                  </div>
                  <div>
                    <dt>Срок</dt>
                    <dd>{monthLabel(g.baseline.deadline.slice(0, 7))}</dd>
                  </div>
                  <div>
                    <dt>Целевая сумма</dt>
                    <dd>{currency(parseMoney(g.baseline.target_amount))}</dd>
                  </div>
                </dl>
              </details>
            ) : (
              !historical && (
                <button
                  className="tiny"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await captureBaseline(g, plan.required, plan.balance);
                    }, "Исходный план зафиксирован")
                  }
                >
                  Зафиксировать исходный план
                </button>
              )
            )}
            {!historical && (
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setError("");
                    setEdit({ ...g });
                  }}
                >
                  Редактировать цель
                </button>
                <button
                  className="ghost danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Удалить цель? Деньги, счета и история операций сохранятся.",
                      )
                    )
                      void run(async () => {
                        await saveGoal({ ...g, archived: true });
                      }, "Цель удалена").then((ok) => {
                        if (ok) setSelected(null);
                      });
                  }}
                >
                  Удалить цель
                </button>
              </div>
            )}
            {historical && (
              <p className="hint">
                История за выбранный месяц. Для изменения цели перейдите к
                текущему месяцу.
              </p>
            )}
          </div>
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit.version ? "Редактировать цель" : "Новая цель"}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              void run(async () => {
                try {
                  await saveGoal(edit);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Не удалось сохранить",
                  );
                  throw e;
                }
              }, "Цель сохранена").then((ok) => {
                if (ok) setEdit(null);
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Название цели
                <input
                  required
                  maxLength={60}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <div className="twocol">
                <label>
                  Целевая сумма, ₽
                  <input
                    inputMode="decimal"
                    required
                    value={edit.target_amount}
                    onChange={(e) =>
                      setEdit({ ...edit, target_amount: e.target.value })
                    }
                  />
                </label>
                <label>
                  Плановый месяц
                  <input
                    type="month"
                    required
                    min={currentMonth()}
                    max="9998-12"
                    value={edit.deadline.slice(0, 7)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const end = monthBounds(e.target.value).end;
                        const d = new Date(end + "T12:00:00Z");
                        d.setUTCDate(0);
                        setEdit({
                          ...edit,
                          deadline: d.toISOString().slice(0, 10),
                        });
                      }
                    }}
                  />
                </label>
              </div>
              <label>
                Планируем откладывать, ₽/мес.
                <input
                  inputMode="decimal"
                  required
                  value={edit.monthly_amount}
                  onChange={(e) =>
                    setEdit({ ...edit, monthly_amount: e.target.value })
                  }
                />
              </label>
              <p className="hint">
                Общая цель для семьи. Изменения действуют с {today()}; привязка
                задаётся в настройках счёта.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="actions">
                <button>Сохранить цель</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEdit(null)}
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
