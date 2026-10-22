import { useEffect, useState } from "react";
import type { Category, Kind } from "../types";
import {
  buildTrend,
  combineSummary,
  dateLabel,
  monthRange,
  weekRange,
  type AnalysisRow,
  type DateRange,
} from "../lib/analysis";
import { currency, summaryCents, total } from "../lib/money";
import { currentMonth, today, validDate, validMonth } from "../lib/dates";
import { configured } from "../db";
import * as api from "../lib/api";
import { localAnalysis } from "../lib/demo";
import { Help } from "./Help";
export function Analysis({
  family,
  month,
  revision,
  cats,
  onOperations,
}: {
  family: string;
  month: string;
  revision: number;
  cats: Category[];
  onOperations: (category: string, range: DateRange) => void;
}) {
  const [mode, setMode] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(month || currentMonth());
  const [week, setWeek] = useState(today());
  const [custom, setCustom] = useState(monthRange(month));
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const [result, setResult] = useState<{ key: string; rows: AnalysisRow[] }>({
    key: "",
    rows: [],
  });
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  let range: DateRange | null = null;
  let valid = true;
  if (mode === "month") {
    valid = validMonth(selectedMonth);
    if (valid) range = monthRange(selectedMonth);
  }
  if (mode === "week") {
    valid = validDate(week);
    if (valid) range = weekRange(week);
  }
  if (mode === "custom") {
    valid =
      validDate(custom.from) &&
      validDate(custom.to) &&
      custom.from <= custom.to;
    range = custom;
  }
  const from = range?.from ?? null,
    to = range?.to ?? null;
  const daily =
    !!range &&
    valid &&
    (Date.parse(range.to) - Date.parse(range.from)) / 86400000 < 62;
  const requestKey = JSON.stringify([
    family,
    revision,
    mode,
    from,
    to,
    daily,
    retry,
  ]);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    setError("");
    setSelected("");
    void (
      configured
        ? api.analysis(family, from && to ? { from, to } : null, daily)
        : Promise.resolve(
            localAnalysis(from && to ? { from, to } : null, daily),
          )
    )
      .then((rows) => {
        if (active) setResult({ key: requestKey, rows });
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить анализ",
          );
      });
    return () => {
      active = false;
    };
  }, [family, from, to, daily, requestKey, valid]);
  const loading = result.key !== requestKey;
  const points = valid && !loading ? buildTrend(result.rows, range, daily) : [];
  const point = points.find((p) => p.key === selected);
  const summary = point?.summary ?? combineSummary(loading ? [] : result.rows);
  const earned =
    point?.earned ??
    total(
      summary
        .filter((s) => s.kind === "income")
        .map((s) => summaryCents(s.cents)),
    );
  const spent =
    point?.spent ??
    total(
      summary
        .filter((s) => s.kind === "expense")
        .map((s) => summaryCents(s.cents)),
    );
  const activeRange =
    point?.range ??
    range ??
    (points.length
      ? { from: points[0].range.from, to: points[points.length - 1].range.to }
      : null);
  const label = !valid
    ? ""
    : (point?.label ??
      (range
        ? `${dateLabel(range.from)} — ${dateLabel(range.to)}`
        : "Всё время"));
  const sum = kind === "expense" ? spent : earned;
  const rows = cats
    .filter((c) => c.kind === kind)
    .map((c) => ({
      category: c,
      amount: summaryCents(
        summary.find((s) => s.category_id === c.id && s.kind === kind)?.cents ??
          "0",
      ),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...points.flatMap((p) => [p.spent, p.earned]));
  return (
    <div className="analysis-content">
      <div className="analysis-period">
        <label>
          Период анализа
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="all">За всё время</option>
            <option value="month">За месяц</option>
            <option value="week">За неделю</option>
            <option value="custom">Произвольный период</option>
          </select>
        </label>
        {mode === "month" && (
          <label>
            Месяц анализа
            <input
              type="month"
              min="1900-01"
              max="9998-12"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </label>
        )}
        {mode === "week" && (
          <label>
            День выбранной недели
            <input
              type="date"
              min="1900-01-01"
              max="9998-12-25"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
          </label>
        )}
        {mode === "custom" && (
          <div className="twocol">
            <label>
              С
              <input
                type="date"
                min="1900-01-01"
                max="9998-12-31"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <label>
              По
              <input
                type="date"
                min="1900-01-01"
                max="9998-12-31"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
      {!valid ? (
        <p className="error" role="alert">
          Укажите корректный период: начало не позже окончания.
        </p>
      ) : error ? (
        <p className="error" role="alert">
          {error}{" "}
          <button className="tiny" onClick={() => setRetry((n) => n + 1)}>
            Повторить
          </button>
        </p>
      ) : loading ? (
        <p role="status">Загружаем динамику…</p>
      ) : (
        <>
          <div className="section-heading">
            <h2>Динамика</h2>
            <Help label="Динамика">
              Неделя — с понедельника по воскресенье. Короткие периоды показаны
              по дням, длинные — по месяцам. Нажмите столбцы, чтобы посмотреть
              категории за выбранный день или месяц. Переводы накоплений не
              входят в доходы и расходы.
            </Help>
          </div>
          <article className="trend-chart-card combined-trend">
            <div className="line">
              <small>{label}</small>
              {point && (
                <button className="tiny" onClick={() => setSelected("")}>
                  Весь период
                </button>
              )}
            </div>
            <div className="trend-legend">
              <span>
                <i className="expense-bar" />
                Расходы<b>{currency(spent)}</b>
              </span>
              <span>
                <i className="income-bar" />
                Доходы<b>{currency(earned)}</b>
              </span>
            </div>
            <div
              className="interactive-month-chart period-chart"
              role="group"
              aria-label="Доходы и расходы за период"
            >
              {points.map((p) => (
                <button
                  type="button"
                  className={`chart-month ${p.key === selected ? "selected" : ""}`}
                  key={p.key}
                  aria-pressed={p.key === selected}
                  aria-label={`${p.label}: расходы ${currency(p.spent)}, доходы ${currency(p.earned)}`}
                  onClick={() => setSelected(p.key)}
                >
                  <span className="chart-bar-space" aria-hidden="true">
                    <span
                      className="expense-bar"
                      style={{ height: `${(p.spent / max) * 100}%` }}
                    />
                    <span
                      className="income-bar"
                      style={{ height: `${(p.earned / max) * 100}%` }}
                    />
                  </span>
                  <span>{daily ? p.key.slice(8) : p.label.split(" ")[0]}</span>
                  <small>
                    {daily ? p.label.split(" ")[1] : p.key.slice(0, 4)}
                  </small>
                </button>
              ))}
            </div>
            {!points.length && (
              <p className="hint">За этот период операций нет.</p>
            )}
          </article>
          <section
            className="category-detail"
            aria-label={`Категории за ${label}`}
          >
            <h3>Категории</h3>
            <div className="subnav" role="group" aria-label="Тип детализации">
              {(["expense", "income"] as const).map((type) => (
                <button
                  key={type}
                  aria-pressed={kind === type}
                  className={kind === type ? "selected" : ""}
                  onClick={() => setKind(type)}
                >
                  {type === "expense" ? "Расходы" : "Доходы"}
                </button>
              ))}
            </div>
            <small>
              {label} · {currency(sum)}
            </small>
            {rows.map((r) => (
              <button
                type="button"
                className="analysis-category category-drilldown"
                key={r.category.id}
                aria-label={`Операции: ${r.category.name}`}
                onClick={() => {
                  if (activeRange) onOperations(r.category.id, activeRange);
                }}
              >
                <span className="line">
                  <b>
                    {r.category.name}
                    {r.category.archived ? " · удалена" : ""}
                  </b>
                  <b>{currency(r.amount)}</b>
                </span>
                <span
                  className="category-share"
                  role="img"
                  aria-label={`${r.category.name}: ${Math.round((r.amount / sum) * 100)}% от ${kind === "expense" ? "расходов" : "доходов"}`}
                >
                  <span
                    className={
                      kind === "expense" ? "expense-bar" : "income-bar"
                    }
                    style={{ width: `${(r.amount / sum) * 100}%` }}
                  />
                </span>
                <span className="line">
                  <small>{Math.round((r.amount / sum) * 100)}%</small>
                  <small>Операции →</small>
                </span>
              </button>
            ))}
            {!rows.length && (
              <p className="hint">
                За выбранный период операций этого типа нет.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
