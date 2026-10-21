import { currency } from "../lib/money";
export function bulletScale(
  actual: number,
  limit: number | null,
  maximum?: number,
) {
  const max = Math.max(
    1,
    maximum ?? 0,
    actual,
    limit === null ? 0 : limit * 1.25,
  );
  return {
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
}: {
  actual: number;
  limit: number | null;
  label: string;
  maximum?: number;
}) {
  const s = bulletScale(actual, limit, maximum);
  return (
    <div
      className={`bullet ${s.over ? "over" : ""}`}
      role="img"
      aria-label={`${label}: факт ${currency(actual)}; ${limit === null ? "лимит не задан" : `лимит ${currency(limit)}${s.over ? "; превышен" : ""}`}`}
    >
      <span className="bullet-fill" style={{ width: `${s.fill}%` }} />
      {s.marker !== null && (
        <span className="bullet-marker" style={{ left: `${s.marker}%` }} />
      )}
    </div>
  );
}
