import { currency } from "../lib/money";
export function bulletScale(
  actual: number,
  limit: number | null,
  maximum?: number,
  paid = 0,
  pending = 0,
) {
  const max = Math.max(
    1,
    maximum ?? 0,
    actual + pending,
    limit === null ? 0 : limit * 1.25,
  );
  return {
    paid: (Math.min(actual, Math.max(0, paid)) / max) * 100,
    pending: (Math.max(0, pending) / max) * 100,
    fill: Math.min(100, (actual / max) * 100),
    marker: limit === null ? null : Math.min(100, (limit / max) * 100),
    over: limit !== null && actual > limit,
  };
}
export function Bullet({
  actual,
  limit,
  label,
  maximum,
  paid = 0,
  pending = 0,
}: {
  actual: number;
  limit: number | null;
  label: string;
  maximum?: number;
  paid?: number;
  pending?: number;
}) {
  const s = bulletScale(actual, limit, maximum, paid, pending);
  return (
    <div
      className={`bullet ${s.over ? "over" : ""}`}
      role="img"
      aria-label={`${label}: факт ${currency(actual)}; обязательные оплачено ${currency(paid)}, к оплате ${currency(pending)}; ${limit === null ? "лимит не задан" : `лимит ${currency(limit)}${s.over ? "; превышен" : ""}`}`}
    >
      <span className="bullet-fill" style={{ width: `${s.fill}%` }} />
      {s.paid > 0 && (
        <span className="bullet-paid" style={{ width: `${s.paid}%` }} />
      )}
      {s.pending > 0 && (
        <span
          className="bullet-pending"
          style={{ left: `${s.fill}%`, width: `${s.pending}%` }}
        />
      )}
      {s.marker !== null && (
        <span className="bullet-marker" style={{ left: `${s.marker}%` }} />
      )}
    </div>
  );
}
