import { Modal } from "./Modal";
import { currency, parseMoney } from "../lib/money";
import type { Recurring } from "../types";
export function SpendingDetails({
  name,
  spent,
  limit,
  paid,
  pending,
  items,
  onClose,
  onOperations,
}: {
  name: string;
  spent: number;
  limit: number | null;
  paid: number;
  pending: number;
  items: Recurring[];
  onClose: () => void;
  onOperations: () => void;
}) {
  return (
    <Modal title={name} onClose={onClose}>
      <h3>Бюджет и факт</h3>
      <dl className="detail-values">
        <dt>Лимит</dt>
        <dd>{limit === null ? "Не задан" : currency(limit)}</dd>
        <dt>Потрачено</dt>
        <dd>{currency(spent)}</dd>
        {limit !== null && (
          <>
            <dt>{spent > limit ? "Превышение" : "Остаток лимита"}</dt>
            <dd className={spent > limit ? "danger" : ""}>
              {currency(Math.abs(limit - spent))}
            </dd>
          </>
        )}
      </dl>
      <h3>Состав расходов</h3>
      <dl className="detail-values">
        <dt>Обязательные оплачены</dt>
        <dd>{currency(paid)}</dd>
        <dt>Остальные расходы</dt>
        <dd>{currency(Math.max(0, spent - paid))}</dd>
        <dt>Обязательные к оплате</dt>
        <dd>{currency(pending)}</dd>
        <dt>Факт + предстоящие</dt>
        <dd>{currency(spent + pending)}</dd>
      </dl>
      {!!items.length && (
        <>
          <h3>Обязательные платежи</h3>
          <ul className="detail-payments">
            {items.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.name}</b>
                  <small>
                    {r.payment
                      ? `Оплачено ${r.payment.occurred_on}`
                      : "Ещё не оплачен"}
                  </small>
                </div>
                <b>{currency(parseMoney(r.payment?.amount ?? r.amount))}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button onClick={onOperations}>Посмотреть операции</button>
      </div>
    </Modal>
  );
}
