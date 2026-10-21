import { Help } from "./Help";
import { useEffect, useRef, useState } from "react";
import type {
  Category,
  Recurring,
  RecurringDraft,
  Run,
  Transaction,
} from "../types";
import { currency, parseMoney, total } from "../lib/money";
import { dueDate, payRecurring, saveRecurring } from "../lib/features";
import { today } from "../lib/dates";
export function RecurringPayments({
  family,
  month,
  items,
  cats,
  busy,
  run,
  onEdit,
  onDelete,
}: {
  family: string;
  month: string;
  items: Recurring[];
  cats: Category[];
  busy: boolean;
  run: Run;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RecurringDraft | null>(null);
  const [pay, setPay] = useState<Recurring | null>(null);
  const [payError, setPayError] = useState("");
  const [date, setDate] = useState(today());
  const [inactive, setInactive] = useState(false);
  const paymentForm = useRef<HTMLFormElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pay) return;
    paymentForm.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "instant",
    });
    confirmButton.current?.focus({ preventScroll: true });
  }, [pay]);
  const visible = items.filter((r) => r.active || r.payment);
  const unpaid = visible.filter((r) => !r.payment);
  const paid = visible.filter((r) => r.payment);
  const amount = (r: Recurring) => parseMoney(r.payment?.amount ?? r.amount);
  const sum = total(visible.map(amount)),
    done = total(paid.map(amount));
  function startPay(r: Recurring) {
    setPayError("");
    setPay(r);
    setDate(today().startsWith(month) ? today() : dueDate(month, r.due_day));
  }
  return (
    <section>
      <div className="section-heading">
        <h2>
          Обязательные платежи{" "}
          <Help label="Обязательные платежи">
            Отметка оплаты создаёт расход. Эти суммы входят в факт категорий;
            учитывайте их при назначении лимитов бюджета.
          </Help>
        </h2>
        <button
          className="tiny"
          onClick={() =>
            setDraft({
              id: crypto.randomUUID(),
              version: 0,
              name: "",
              category_id: "",
              amount: "",
              due_day: 1,
              active: true,
            })
          }
        >
          Добавить платёж
        </button>
      </div>
      <article className="hero compact-hero">
        <small>Обязательно в этом месяце</small>
        <h2>{currency(sum)}</h2>
        <div className="bar">
          <span style={{ width: `${sum ? (done / sum) * 100 : 0}%` }} />
        </div>
        <div className="twocol">
          <div>
            <small>Оплачено</small>
            <b>{currency(done)}</b>
          </div>
          <div>
            <small>Осталось</small>
            <b>{currency(sum - done)}</b>
          </div>
        </div>
      </article>

      {draft && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveRecurring(family, month, draft);
            }, "Обязательный платёж сохранён").then((ok) => {
              if (ok) setDraft(null);
            });
          }}
        >
          <fieldset disabled={busy}>
            <h3>{draft.version ? "Изменить платёж" : "Новый платёж"}</h3>
            <p className="hint">
              Шаблон действует с {month}. Оплаченные операции сохранят свои
              суммы. День 29–31 в коротком месяце переносится на последний день.
            </p>
            <label>
              Название платежа
              <input
                autoFocus
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="twocol">
              <label>
                Сумма платежа, ₽
                <input
                  required
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.value })
                  }
                />
              </label>
              <label>
                День месяца
                <input
                  required
                  type="number"
                  min="1"
                  max="31"
                  value={draft.due_day}
                  onChange={(e) =>
                    setDraft({ ...draft, due_day: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              Категория платежа
              <select
                required
                value={draft.category_id}
                onChange={(e) =>
                  setDraft({ ...draft, category_id: e.target.value })
                }
              >
                <option value="">Выберите категорию</option>
                {cats
                  .filter((c) => c.kind === "expense" && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="actions">
              <button>Сохранить платёж</button>
              <button
                className="ghost"
                type="button"
                onClick={() => setDraft(null)}
              >
                Отмена
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {(
        [
          ["Ещё оплатить", unpaid],
          ["Оплачено", paid],
        ] as [string, Recurring[]][]
      ).map(([label, list]) => (
        <div key={label}>
          <h3>
            {label} · {list.length}
          </h3>
          {list
            .sort((a, b) => a.due_day - b.due_day)
            .map((r) => (
              <article
                key={r.id}
                className={`payment-row ${r.payment ? "paid" : ""}`}
              >
                <div className="line">
                  <div>
                    <b>{r.name}</b>
                    <small>
                      {r.payment
                        ? `Оплачено ${r.payment.occurred_on}`
                        : `До ${dueDate(month, r.due_day)}`}{" "}
                      · {cats.find((c) => c.id === r.category_id)?.name}
                    </small>
                  </div>
                  <b>{currency(amount(r))}</b>
                </div>
                <div className="actions">
                  <button
                    className={r.payment ? "secondary" : "primary"}
                    disabled={busy}
                    aria-label={
                      r.payment
                        ? `Отменить оплату ${r.name}`
                        : `Оплатить ${r.name}`
                    }
                    onClick={() => {
                      if (r.payment) {
                        if (
                          confirm("Отменить оплату и удалить связанный расход?")
                        )
                          void onDelete(r.payment);
                      } else startPay(r);
                    }}
                  >
                    {r.payment ? "✓ Оплачено · отменить" : "Отметить оплату"}
                  </button>
                  {r.payment && (
                    <button className="tiny" onClick={() => onEdit(r.payment!)}>
                      Изменить операцию
                    </button>
                  )}
                  <button
                    className="tiny"
                    disabled={busy}
                    onClick={() => setDraft(r)}
                  >
                    Шаблон
                  </button>
                  <button
                    className="tiny danger"
                    disabled={busy || !r.active}
                    onClick={() => {
                      if (
                        confirm(
                          `Отключить «${r.name}» с ${month}? Прошлые месяцы и оплаченные операции сохранятся.`,
                        )
                      )
                        void run(async () => {
                          await saveRecurring(family, month, {
                            ...r,
                            active: false,
                          });
                        }, "Повторение отключено");
                    }}
                  >
                    Отключить
                  </button>
                </div>
                {pay?.id === r.id && !r.payment && (
                  <form
                    className="editor inline-payment"
                    ref={paymentForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        try {
                          await payRecurring(family, month, pay, date);
                        } catch (e) {
                          setPayError(
                            e instanceof Error
                              ? e.message
                              : "Не удалось оплатить",
                          );
                          throw e;
                        }
                      }, "Оплата учтена в расходах").then((ok) => {
                        if (ok) setPay(null);
                      });
                    }}
                  >
                    <h3>Оплата: {pay.name}</h3>
                    {payError && (
                      <p className="error" role="alert">
                        {payError}
                      </p>
                    )}
                    <b>{currency(parseMoney(pay.amount))}</b>
                    <label>
                      Дата оплаты
                      <input
                        required
                        type="date"
                        min={month + "-01"}
                        max={dueDate(month, 31)}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button ref={confirmButton} disabled={busy}>
                        Подтвердить оплату
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setPay(null)}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
        </div>
      ))}
      {!visible.length && (
        <p className="empty">
          Добавьте ипотеку, аренду, подписки или другие ежемесячные платежи.
        </p>
      )}
      <button className="tiny" onClick={() => setInactive(!inactive)}>
        {inactive ? "Скрыть отключённые" : "Отключённые платежи"}
      </button>
      {inactive &&
        items
          .filter((r) => !r.active)
          .map((r) => (
            <div className="setting-row" key={r.id}>
              <span>{r.name}</span>
              <button
                className="tiny"
                onClick={() => setDraft({ ...r, active: true })}
              >
                Возобновить
              </button>
            </div>
          ))}
    </section>
  );
}
