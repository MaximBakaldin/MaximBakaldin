import type { CategoryUsage } from "./lib/categories";
import { obligations } from "./lib/obligations";
import { Help } from "./components/Help";
import { Bullet } from "./components/Bullet";
import { Analysis } from "./components/Analysis";
import { monthPoint, type MonthPoint } from "./lib/analysis";
import {
  Appearance,
  CategorySettings,
  FamilySettings,
} from "./components/Settings";
import { RecurringPayments } from "./components/RecurringPayments";
import { SavingsAccount } from "./components/SavingsAccount";
import { signedCents } from "./lib/features";
import { watchTheme } from "./lib/theme";
import { InstallApp } from "./components/InstallApp";
import { useCallback, useEffect, useRef, useState } from "react";
import { client, configurationError, configured, supabase } from "./db";
import type { Draft, Snapshot, Transaction } from "./types";
import { Auth } from "./components/Auth";
import { BudgetRow } from "./components/BudgetRow";
import { TransactionForm } from "./components/TransactionForm";
import { currentMonth, monthLabel, shiftMonth, validMonth } from "./lib/dates";
import {
  currency,
  decimal,
  parseMoney,
  summaryCents,
  total,
} from "./lib/money";
import { downloadFile, transactionsCsv } from "./lib/csv";
import * as api from "./lib/api";
import * as local from "./lib/demo";

type Tab = "home" | "history" | "add" | "budget" | "settings";
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Не удалось выполнить действие. Попробуйте ещё раз";

export default function App() {
  useEffect(watchTheme, []);
  const [auth, setAuth] = useState<{
    ready: boolean;
    user: string | null;
    recovery: boolean;
    error: string;
  }>({ ready: !configured, user: null, recovery: false, error: "" });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let changed = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      changed = true;
      if (active)
        setAuth((previous) => ({
          ready: true,
          user: session?.user.id ?? null,
          recovery:
            event === "PASSWORD_RECOVERY" ||
            (previous.recovery && event !== "SIGNED_OUT"),
          error: "",
        }));
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !changed)
          setAuth({
            ready: true,
            user: data.session?.user.id ?? null,
            recovery: false,
            error: error?.message ?? "",
          });
      })
      .catch((e) => {
        if (active)
          setAuth({
            ready: true,
            user: null,
            recovery: false,
            error: message(e),
          });
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (configurationError)
    return (
      <main className="shell">
        <h1>Не завершена настройка</h1>
        <p role="alert">
          Заполните оба параметра Supabase в .env и перезапустите приложение.
        </p>
      </main>
    );
  if (!auth.ready)
    return (
      <main className="shell" role="status">
        Загрузка аккаунта…
      </main>
    );
  if (auth.error)
    return (
      <main className="shell">
        <p role="alert">{auth.error}</p>
        <button onClick={() => location.reload()}>Повторить</button>
      </main>
    );
  if (configured && (!auth.user || auth.recovery))
    return (
      <Auth
        key={auth.recovery ? "recovery" : "login"}
        recovery={auth.recovery}
        onRecovered={() => setAuth((a) => ({ ...a, recovery: false }))}
      />
    );
  // Keying the entire workspace drops all data, pending forms and requests on account changes.
  return (
    <Workspace key={auth.user ?? "local"} user={auth.user ?? local.DEMO_USER} />
  );
}

function Workspace({ user }: { user: string }) {
  const [tab, setTab] = useState<Tab>("home");
  const [budgetView, setBudgetView] = useState<
    "limits" | "recurring" | "savings"
  >("recurring");
  const [analysisView, setAnalysisView] = useState<"overview" | "operations">(
    "overview",
  );
  const [allCategories, setAllCategories] = useState(false);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => local.newDraft());
  const [familyName, setFamilyName] = useState("Наша семья");
  const [invite, setInvite] = useState("");
  const [newInvite, setNewInvite] = useState("");
  const [memberName, setMemberName] = useState("");
  const [categoryUsage, setCategoryUsage] = useState<{
    family: string;
    rows: CategoryUsage[];
  }>({ family: "", rows: [] });
  const [trend, setTrend] = useState<MonthPoint[]>([]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const snapshot = configured
        ? await api.snapshot(month)
        : local.localSnapshot(month);
      if (!alive.current || request !== generation.current) return;
      // Membership revocation must clear the old data even when subsequent queries fail.
      if (!snapshot) {
        setData(null);
        setRows([]);
        setCount(0);
        setReady(true);
        setError("");
        return;
      }
      const page = configured
        ? await api.history(
            snapshot.family.id,
            month,
            { category, search },
            offset,
          )
        : local.localHistory(month, { category, search }, offset);
      if (!alive.current || request !== generation.current) return;
      setData(snapshot);
      setRows(page.rows);
      setCount(page.count);
      setReady(true);
      setError("");
      setLastSync(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      if (offset > 0 && offset >= page.count)
        setOffset(Math.max(0, Math.floor((page.count - 1) / 30) * 30));
    } catch (e) {
      if (alive.current && request === generation.current) setError(message(e));
    } finally {
      if (alive.current && request === generation.current) setRefreshing(false);
    }
  }, [month, category, search, offset]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    };
    const connection = () => {
      setOnline(navigator.onLine);
      refreshVisible();
    };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("storage", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("storage", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);
  const familyId = data?.family.id;
  useEffect(() => {
    if (!supabase || !familyId) return;
    const channel = supabase
      .channel(`family-${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "households",
          filter: `id=eq.${familyId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "members",
          filter: `household_id=eq.${familyId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [familyId, refresh]);
  useEffect(() => {
    if (tab !== "add" || !familyId) return;
    let active = true;
    void (
      configured
        ? api.popularCategories(familyId)
        : Promise.resolve(local.localCategoryUsage())
    )
      .then((rows) => {
        if (active) setCategoryUsage({ family: familyId, rows });
      })
      .catch(() => {
        if (active) setCategoryUsage({ family: familyId, rows: [] });
      });
    return () => {
      active = false;
    };
  }, [tab, familyId, data?.revision]);

  useEffect(() => {
    if (tab !== "history" || !familyId) return;
    let active = true;
    setTrendLoading(true);
    setTrendError("");
    void Promise.all(
      Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))
        .filter(validMonth)
        .map(async (m) => {
          const snapshot = configured
            ? await api.snapshot(m)
            : local.localSnapshot(m);
          if (!snapshot || snapshot.family.id !== familyId)
            throw new Error("Доступ к семье изменился. Обновите данные");
          return monthPoint(m, snapshot);
        }),
    )
      .then((items) => {
        if (active) setTrend(items);
      })
      .catch((e) => {
        if (active) {
          setTrend([]);
          setTrendError(message(e));
        }
      })
      .finally(() => {
        if (active) setTrendLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, familyId, month, data?.revision]);

  async function run(
    action: () => Promise<void> | void,
    success = "",
  ): Promise<boolean> {
    if (lock.current) return false;
    if (configured && !navigator.onLine) {
      setError(
        "Нет связи. Введённые данные остаются в форме. Подключитесь и повторите сохранение",
      );
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!alive.current) return false;
      if (success) setNotice(success);
      await refreshRef.current();
      return true;
    } catch (e) {
      if (alive.current) setError(message(e));
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function navigate(next: Tab) {
    if (next === "add") setDraft(local.newDraft());
    if (next === "history") setAnalysisView("overview");
    setTab(next);
    setNotice("");
  }
  function changeMonth(value: string) {
    if (validMonth(value)) {
      generation.current++;
      setReady(false);
      setData(null);
      setRows([]);
      setOffset(0);
      setMonth(value);
    }
  }
  const exit = () =>
    void run(async () => {
      const { error } = await client().auth.signOut({ scope: "local" });
      if (error) throw error;
    });
  const feedback = (
    <>
      {!online && (
        <p className="notice" role="status">
          Нет подключения к интернету.{" "}
          {configured
            ? "Сохранение станет доступно после восстановления связи."
            : "Локальное сохранение доступно."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="tiny"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            Обновить
          </button>
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
    </>
  );
  if (!ready)
    return (
      <main className="shell">
        <h1>Семейный бюджет</h1>
        <p role="status">
          {refreshing ? "Загружаем бюджет…" : "Не удалось загрузить бюджет"}
        </p>
        {feedback}
        <button onClick={() => void refresh()} disabled={refreshing}>
          Повторить
        </button>
        {configured && (
          <button className="ghost" onClick={exit}>
            Выйти
          </button>
        )}
      </main>
    );
  if (!data)
    return (
      <main className="shell auth">
        <div className="brand">СЕМЕЙНЫЙ БЮДЖЕТ</div>
        <h1>Ваше общее пространство</h1>
        <p>Создайте семью или используйте приглашение второго участника.</p>
        {feedback}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.rpc("create_family", { n: familyName });
            });
          }}
        >
          <label>
            Название семьи
            <input
              required
              maxLength={80}
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
            />
          </label>
          <button disabled={busy}>Создать семью</button>
        </form>
        <div className="divider">или</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.rpc("join_family", { code: invite });
            });
          }}
        >
          <label>
            Код приглашения
            <input
              required
              autoComplete="off"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy}>
            Присоединиться
          </button>
        </form>
        <button className="ghost" onClick={exit}>
          Выйти
        </button>
      </main>
    );

  const spent = total(
    data.summary
      .filter((s) => s.kind === "expense")
      .map((s) => summaryCents(s.cents)),
  );
  const earned = total(
    data.summary
      .filter((s) => s.kind === "income")
      .map((s) => summaryCents(s.cents)),
  );
  const plan = total(data.budgets.map((b) => parseMoney(b.amount, true)));
  const planned = data.budgets.length > 0;
  const cats = data.categories
    .filter(
      (c) =>
        c.kind === "expense" &&
        (!c.archived ||
          data.budgets.some((b) => b.category_id === c.id) ||
          data.summary.some((x) => x.category_id === c.id && x.cents !== "0")),
    )
    .map((c) => ({
      ...c,
      spent: summaryCents(
        data.summary.find((s) => s.category_id === c.id)?.cents ?? "0",
      ),
      budget: data.budgets.find((b) => b.category_id === c.id),
      ...obligations(data.recurring ?? [], c.id),
    }));
  const savings = data.savings ?? {
    balance_cents: "0",
    transfer_cents: "0",
    has_opening: false,
    entries: [],
  };
  const transfers = signedCents(savings.transfer_cents);
  const { paid: requiredPaid, pending: requiredLeft } = obligations(
    data.recurring ?? [],
  );
  const freeForMonth = earned - spent - transfers - requiredLeft;
  const ranked = cats
    .filter((c) => c.spent > 0 || c.budget || c.pending)
    .sort((a, b) => b.spent - a.spent);
  const top = allCategories ? ranked : ranked.slice(0, 4);
  const catMaximum = Math.max(
    1,
    ...ranked.flatMap((c) => [
      c.spent + c.pending,
      c.budget ? parseMoney(c.budget.amount, true) * 1.25 : 0,
    ]),
  );
  function editTransaction(t: Transaction) {
    setDraft({
      id: t.id,
      version: t.version,
      kind: t.kind,
      amount: String(t.amount),
      category_id: t.category_id,
      occurred_on: t.occurred_on,
      comment: t.comment ?? "",
    });
    setTab("add");
  }
  function removeTransaction(t: Transaction) {
    return run(async () => {
      if (configured) await api.deleteTransaction(t);
      else local.localDelete(t);
    }, "Оплата отменена, расход удалён");
  }
  const owner = data.family.created_by === user;
  const author = (id: string) =>
    id === user
      ? "Вы"
      : (data.members.find((m) => m.user_id === id)?.display_name ??
        "Бывший участник");
  const refreshButton = (
    <button
      className="month-refresh"
      aria-label="Обновить данные"
      title={lastSync ? `Обновлено в ${lastSync}` : "Обновить данные"}
      disabled={refreshing}
      onClick={() => void refresh()}
    >
      ↻
    </button>
  );
  const monthPicker = (
    <div className="month-toolbar">
      <button
        className="month-arrow"
        aria-label="Предыдущий месяц"
        disabled={month === "1900-01"}
        onClick={() => changeMonth(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <label className="month-control">
        <span>{monthLabel(month)}</span>
        <input
          aria-label="Месяц"
          type="month"
          min="1900-01"
          max="9998-12"
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
        />
      </label>
      <button
        className="month-arrow"
        aria-label="Следующий месяц"
        disabled={month === "9998-12"}
        onClick={() => changeMonth(shiftMonth(month, 1))}
      >
        ›
      </button>
      {refreshButton}
    </div>
  );
  async function save(d: Draft) {
    const ok = await run(async () => {
      if (configured) await api.saveTransaction(data!.family.id, d);
      else local.localSave(d);
    }, "Операция сохранена");
    if (ok) {
      if (d.occurred_on.slice(0, 7) !== month)
        changeMonth(d.occurred_on.slice(0, 7));
      setDraft(local.newDraft());
      setAnalysisView("operations");
      setTab("history");
    }
    return ok;
  }
  async function exportCsv() {
    await run(async () => {
      const fresh = configured
        ? await api.snapshot(month)
        : local.localSnapshot(month);
      if (!fresh) throw new Error("Доступ к семье закрыт");
      const exported = configured
        ? await api.exportHistory(fresh.family.id, month, fresh.revision)
        : local.localHistory(
            month,
            { category: "", search: "" },
            0,
            Number.MAX_SAFE_INTEGER,
          ).rows;
      downloadFile(
        transactionsCsv(exported, fresh.categories),
        `family-budget-${month}.csv`,
        "text/csv;charset=utf-8",
      );
    }, "CSV подготовлен за выбранный месяц");
  }

  return (
    <main className="shell">
      <h1 className="sr-only">
        {tab === "home"
          ? "Всё под контролем"
          : tab === "history"
            ? "Анализ"
            : tab === "budget"
              ? "Бюджет"
              : tab === "settings"
                ? "Настройки"
                : "Операция"}
      </h1>
      {tab === "settings" && (
        <div className="settings-sync">
          <span>
            {configured
              ? `Обновлено в ${lastSync}`
              : "Данные хранятся на этом устройстве"}
          </span>
          {refreshButton}
        </div>
      )}
      {!configured && tab === "settings" && (
        <p className="notice">
          Локальный режим: данные хранятся в этом браузере. Для совместного
          бюджета подключите Supabase. Очистка данных сайта удалит локальный
          бюджет.
        </p>
      )}
      {feedback}
      {tab === "home" && (
        <section className="dashboard">
          {monthPicker}
          <div className="metric-grid">
            <article>
              <small className="metric-label">
                Доходы{" "}
                <Help label="Доходы">
                  Все доходы выбранного месяца. Пополнения накопительного счёта
                  сюда не входят.
                </Help>
              </small>
              <strong className="green">{currency(earned)}</strong>
            </article>
            <article>
              <small className="metric-label">
                Расходы{" "}
                <Help label="Расходы">
                  Расходы выбранного месяца, включая отмеченные обязательные
                  платежи. Переводы в накопления сюда не входят.
                </Help>
              </small>
              <strong>{currency(spent)}</strong>
            </article>
            <article>
              <small className="metric-label">
                Свободно за месяц{" "}
                <Help label="Свободно за месяц">
                  Доходы − расходы − обязательные к оплате − пополнения
                  накоплений + снятия. Оплаченные обязательные уже входят в
                  расходы. Без начального остатка текущего счёта.
                </Help>
              </small>
              <strong className={freeForMonth < 0 ? "danger" : ""}>
                {currency(freeForMonth)}
              </strong>
            </article>
            <article className="savings-metric">
              <small className="metric-label">
                Накопления{" "}
                <Help label="Накопления">
                  Общий баланс всех накопительных счетов на конец выбранного
                  месяца с учётом начальных остатков. Нажмите сумму, чтобы
                  открыть счета.
                </Help>
              </small>
              <button
                className="metric-value"
                onClick={() => {
                  setBudgetView("savings");
                  navigate("budget");
                }}
              >
                <strong>
                  {currency(signedCents(savings.balance_cents))} ↗
                </strong>
              </button>
            </article>
          </div>
          <article className="spending-card">
            <div className="line">
              <h3>
                Расходы и бюджет{" "}
                <Help label="Расходы и бюджет">
                  Полоса — фактические расходы; тёмная часть с точками — уже
                  оплаченные обязательные платежи внутри факта. Штриховка справа
                  — обязательные платежи, ещё не внесённые в расходы. Риска —
                  лимит. При превышении фактом полоса краснеет. У категорий
                  общая шкала.
                </Help>
              </h3>
              <button
                className="tiny"
                onClick={() => {
                  setBudgetView("limits");
                  navigate("budget");
                }}
              >
                Лимиты →
              </button>
            </div>
            <div className="line spending-total">
              <b>{currency(spent)}</b>
              <small>
                {planned ? "из " + currency(plan) : "Лимиты не заданы"}
              </small>
            </div>
            <Bullet
              actual={spent}
              limit={planned ? plan : null}
              paid={requiredPaid}
              pending={requiredLeft}
              label="Общий бюджет"
            />
            <div className="line spending-status">
              <small className={planned && spent > plan ? "danger" : ""}>
                {planned
                  ? (spent > plan ? "Превышение: " : "Осталось: ") +
                    currency(Math.abs(plan - spent))
                  : "Задайте бюджет по категориям"}
              </small>
              <button
                className="tiny"
                onClick={() => {
                  setBudgetView("recurring");
                  navigate("budget");
                }}
              >
                К оплате: {currency(requiredLeft)} ↗
              </button>
            </div>
            <div className="obligation-legend">
              <span>
                <i className="paid-key" />
                Обязательные оплачено
              </span>
              <span>
                <i className="pending-key" />К оплате
              </span>
            </div>
            <small className="obligation-summary">
              Оплачено {currency(requiredPaid)} · к оплате{" "}
              {currency(requiredLeft)}
            </small>
            <div className="category-bullets">
              {top.map((c) => {
                const limit = c.budget
                  ? parseMoney(c.budget.amount, true)
                  : null;
                return (
                  <div className="category-bullet" key={c.id}>
                    <div className="line">
                      <span>{c.name}</span>
                      <b
                        className={
                          limit !== null && c.spent > limit ? "danger" : ""
                        }
                      >
                        {currency(c.spent)}
                      </b>
                    </div>
                    <Bullet
                      actual={c.spent}
                      limit={limit}
                      maximum={catMaximum}
                      paid={c.paid}
                      pending={c.pending}
                      label={c.name}
                    />
                    <small>
                      {limit === null
                        ? "Без лимита"
                        : "Лимит " + currency(limit)}
                      {limit !== null && c.spent > limit ? " · превышен" : ""}
                    </small>
                    {(c.paid > 0 || c.pending > 0) && (
                      <small className="obligation-summary">
                        Обязательные: ✓ {currency(c.paid)} · к оплате{" "}
                        {currency(c.pending)}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
            {!ranked.length && (
              <p className="hint">
                Добавьте первую операцию или задайте лимиты.
              </p>
            )}
            <div className="line">
              {ranked.length > 4 ? (
                <button
                  className="tiny"
                  onClick={() => setAllCategories(!allCategories)}
                >
                  {allCategories
                    ? "Свернуть"
                    : `Все категории (${ranked.length})`}
                </button>
              ) : (
                <span />
              )}
              <button className="tiny" onClick={() => navigate("history")}>
                Анализ →
              </button>
            </div>
          </article>
        </section>
      )}
      {tab === "add" && (
        <TransactionForm
          key={draft.id}
          initial={draft}
          categoryUsage={
            categoryUsage.family === familyId ? categoryUsage.rows : []
          }
          cats={data.categories.filter(
            (c) => !c.archived || c.id === draft.category_id,
          )}
          busy={busy}
          onSave={save}
          onCancel={() => {
            setDraft(local.newDraft());
            setAnalysisView("operations");
            setTab("history");
          }}
        />
      )}
      {tab === "history" && (
        <section>
          <h2 className="sr-only">История операций</h2>
          {monthPicker}
          <div className="subnav" role="group" aria-label="Разделы анализа">
            {(
              [
                ["overview", "Динамика"],
                ["operations", "Операции"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={analysisView === key ? "selected" : ""}
                aria-pressed={analysisView === key}
                onClick={() => setAnalysisView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {analysisView !== "operations" && (
            <Analysis
              key={month}
              points={trend}
              cats={data.categories}
              loading={trendLoading}
              error={trendError}
              onOperations={(id, selectedMonth) => {
                if (selectedMonth !== month) changeMonth(selectedMonth);
                setCategory(id);
                setSearch("");
                setOffset(0);
                setAnalysisView("operations");
              }}
            />
          )}
          {analysisView === "operations" && (
            <>
              <div className="filters">
                <label>
                  Категория
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">Все категории</option>
                    {data.categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Поиск по комментарию
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setOffset(0);
                    }}
                    placeholder="Например, магазин"
                  />
                </label>
              </div>
              <details className="history-analysis">
                <summary>Экспорт операций CSV</summary>
                <article>
                  <p>
                    Все операции за {monthLabel(month)}, независимо от фильтра и
                    открытой страницы истории.
                  </p>
                  <button disabled={busy} onClick={() => void exportCsv()}>
                    Скачать CSV
                  </button>
                </article>
              </details>
              <p className="hint">Найдено операций: {count}</p>
              {rows.map((t) => (
                <article className="entry" key={t.id}>
                  <div>
                    <b>
                      {data.categories.find((c) => c.id === t.category_id)
                        ?.name ?? "Категория"}
                    </b>
                    <small>
                      {t.occurred_on} · {author(t.user_id)}
                    </small>
                    {t.comment && <p className="comment">{t.comment}</p>}
                    {t.version > 1 && (
                      <small>Изменено: {author(t.updated_by)}</small>
                    )}
                  </div>
                  <div className="entryright">
                    <b className={t.kind === "income" ? "green" : ""}>
                      {t.kind === "income" ? "+" : "−"}
                      {currency(parseMoney(t.amount))}
                    </b>
                    <div>
                      <button
                        className="tiny"
                        disabled={busy}
                        onClick={() => editTransaction(t)}
                      >
                        Изменить
                      </button>
                      <button
                        className="tiny danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Удалить эту операцию?"))
                            void run(async () => {
                              if (configured) await api.deleteTransaction(t);
                              else local.localDelete(t);
                            }, "Операция удалена");
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!rows.length && (
                <div className="empty">
                  <h3>Здесь пока пусто</h3>
                  <p>Добавьте операцию или измените фильтры.</p>
                  <button onClick={() => navigate("add")}>
                    Добавить операцию
                  </button>
                </div>
              )}
              <div className="pagination">
                <button
                  className="secondary"
                  disabled={offset === 0 || refreshing}
                  onClick={() => setOffset((n) => Math.max(0, n - 30))}
                >
                  Назад
                </button>
                <span>
                  {count
                    ? `${offset + 1}–${Math.min(offset + rows.length, count)} из ${count}`
                    : "0 операций"}
                </span>
                <button
                  className="secondary"
                  disabled={offset + rows.length >= count || refreshing}
                  onClick={() => setOffset((n) => n + rows.length)}
                >
                  Далее
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "budget" && (
        <section>
          {monthPicker}
          <div className="subnav" role="group" aria-label="Разделы бюджета">
            {(
              [
                ["recurring", "Обязательные"],
                ["savings", "Накопления"],
                ["limits", "Лимиты"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={budgetView === key ? "selected" : ""}
                aria-pressed={budgetView === key}
                onClick={() => setBudgetView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {budgetView === "recurring" && (
            <RecurringPayments
              key={month}
              family={data.family.id}
              month={month}
              items={data.recurring ?? []}
              cats={data.categories}
              busy={busy}
              run={run}
              onEdit={editTransaction}
              onDelete={removeTransaction}
            />
          )}
          {budgetView === "savings" && (
            <SavingsAccount
              key={month}
              family={data.family.id}
              month={month}
              data={savings}
              busy={busy}
              run={run}
            />
          )}
          {budgetView === "limits" && (
            <div className="budget-limits">
              <h2>Лимиты на месяц</h2>
              <article className="hero limits-summary">
                <small>Бюджет расходов</small>
                <h2>{currency(plan)}</h2>
                <small>Факт: {currency(spent)}</small>
              </article>
              <button
                className="secondary copy-budget"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const copied = configured
                      ? await api.rpc<number>("copy_budget", {
                          p_household: data.family.id,
                          p_month: month + "-01",
                        })
                      : local.localCopy(month);
                    setNotice(
                      copied
                        ? `Скопировано категорий: ${copied}`
                        : "Нет незаполненных категорий с планом прошлого месяца",
                    );
                  })
                }
              >
                Скопировать прошлый месяц
              </button>
              <p className="hint">Заполненные категории сохранят свой план.</p>
              {cats.map((c) => (
                <BudgetRow
                  key={`${month}-${c.id}`}
                  name={c.name}
                  spent={c.spent}
                  amount={c.budget ? parseMoney(c.budget.amount, true) : 0}
                  version={c.budget?.version ?? 0}
                  busy={busy}
                  onSave={(value, version) =>
                    run(async () => {
                      if (configured)
                        await api.rpc("save_budget", {
                          p_household: data.family.id,
                          p_category: c.id,
                          p_month: month + "-01",
                          p_amount: decimal(parseMoney(value, true)),
                          p_version: version,
                        });
                      else local.localBudget(c.id, month, value, version);
                    }, "План сохранён")
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "settings" && (
        <section>
          <h2 className="sr-only">Настройки приложения</h2>
          <Appearance />
          {owner && (
            <FamilySettings
              key={data.family.settings_version ?? 1}
              family={data.family}
              busy={busy}
              run={run}
            />
          )}
          <CategorySettings
            cats={data.categories}
            family={data.family.id}
            busy={busy}
            run={run}
          />
          <article>
            <h3>Участники</h3>
            {data.members.map((m) => (
              <div className="line member" key={m.user_id}>
                <span>
                  {author(m.user_id)}
                  {m.user_id === data.family.created_by && (
                    <small>Владелец</small>
                  )}
                </span>
                {configured && owner && m.user_id !== user && (
                  <button
                    className="tiny danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Закрыть этому участнику доступ к бюджету?"))
                        void run(async () => {
                          await api.rpc("remove_member", {
                            p_household: data.family.id,
                            p_user: m.user_id,
                          });
                          setNewInvite("");
                        }, "Доступ участника закрыт");
                    }}
                  >
                    Исключить
                  </button>
                )}
              </div>
            ))}
            {configured && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api.rpc("set_member_name", { p_name: memberName });
                  }, "Имя сохранено");
                }}
              >
                <label>
                  Ваше имя для семьи
                  <input
                    maxLength={60}
                    required
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder={
                      data.members.find((m) => m.user_id === user)?.display_name
                    }
                  />
                </label>
                <button disabled={busy} className="secondary">
                  Сохранить имя
                </button>
              </form>
            )}
          </article>
          {configured && owner && (
            <article>
              <h3>Пригласить участника</h3>
              <p>
                Одноразовый код действует 7 дней. Новый код отменяет предыдущий.
              </p>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await api.rpc<{ code: string }>(
                        "rotate_invite",
                        { p_household: data.family.id },
                      );
                      setNewInvite(result.code);
                    })
                  }
                >
                  Создать код
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.rpc("revoke_invite", {
                        p_household: data.family.id,
                      });
                      setNewInvite("");
                    }, "Приглашение отозвано")
                  }
                >
                  Отозвать код
                </button>
              </div>
              {newInvite && (
                <>
                  <p className="invite">{newInvite}</p>
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(newInvite);
                      }, "Код скопирован")
                    }
                  >
                    Скопировать
                  </button>
                </>
              )}
            </article>
          )}
          <InstallApp />
          <article>
            <h3>О приложении</h3>
            <small>Версия 0.6.2</small>
            <p>Рубли · Екатеринбург (UTC+5)</p>
            <p>
              На iPhone: «Поделиться» → «На экран Домой». На Android: меню
              браузера → «Установить приложение» или «Добавить на главный
              экран».
            </p>
            <small>
              Облачный режим требует подключения к интернету. Экспорт CSV не
              заменяет резервную копию базы.
            </small>
          </article>
          {configured && (
            <button className="secondary" disabled={busy} onClick={exit}>
              Выйти из аккаунта
            </button>
          )}
        </section>
      )}
      <nav aria-label="Основная навигация">
        {(
          [
            ["home", "Главная"],
            ["budget", "Бюджет"],
            ["add", "+"],
            ["history", "Анализ"],
            ["settings", "Настройки"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            aria-label={key === "add" ? "Добавить операцию" : label}
            aria-current={tab === key ? "page" : undefined}
            className={`${tab === key ? "active" : ""} ${key === "add" ? "nav-add" : ""}`}
            onClick={() => navigate(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
