import { useEffect, useState } from "react";
import { currency, decimal, parseMoney } from "../lib/money";
export function BudgetRow({
  name,
  amount,
  spent,
  version,
  busy,
  onSave,
  minimum,
  maximum,
  caption,
}: {
  name: string;
  amount: number | null;
  spent: number;
  version: number;
  busy: boolean;
  onSave: (value: string, version: number) => Promise<boolean>;
  minimum?: number;
  maximum?: number | null;
  caption?: string;
}) {
  const [value, setValue] = useState(amount === null ? "" : decimal(amount));
  const [base, setBase] = useState(version);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dirty) {
      setValue(amount === null ? "" : decimal(amount));
      setBase(version);
    }
  }, [amount, version, dirty]);
  const conflict = dirty && base !== version;
  async function save() {
    setError("");
    try {
      const cents = parseMoney(value, true);
      if (minimum !== undefined && cents < minimum)
        throw new Error(
          `Уже распределено ${currency(minimum)}. Сначала уменьшите лимиты категорий.`,
        );
      if (maximum != null && cents > maximum)
        throw new Error(
          `Для этой категории доступно ${currency(maximum)}. Увеличьте общий лимит или уменьшите другие категории.`,
        );
      if (await onSave(value, base)) setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Некорректная сумма");
    }
  }
  return (
    <article className="budget-row">
      <div className="line">
        <b>{name}</b>
        <small>{caption ?? `Факт: ${currency(spent)}`}</small>
      </div>
      <form
        className="budgetinput"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          aria-label={`План: ${name}`}
          inputMode="decimal"
          value={value}
          disabled={busy}
          onChange={(e) => {
            setDirty(true);
            setValue(e.target.value);
          }}
        />
        <button disabled={busy || conflict} className="secondary">
          Сохранить
        </button>
      </form>
      {conflict && (
        <p className="notice">
          План изменён на другом устройстве.{" "}
          <button
            className="tiny"
            onClick={() => {
              setDirty(false);
              setError("");
            }}
          >
            Загрузить новый план
          </button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
