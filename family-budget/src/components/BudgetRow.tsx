import { useEffect, useState } from "react";
import { currency, decimal, parseMoney } from "../lib/money";
export function BudgetRow({
  name,
  amount,
  spent,
  version,
  busy,
  onSave,
}: {
  name: string;
  amount: number;
  spent: number;
  version: number;
  busy: boolean;
  onSave: (value: string, version: number) => Promise<boolean>;
}) {
  const [value, setValue] = useState(decimal(amount));
  const [base, setBase] = useState(version);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dirty) {
      setValue(decimal(amount));
      setBase(version);
    }
  }, [amount, version, dirty]);
  const conflict = dirty && base !== version;
  async function save() {
    setError("");
    try {
      parseMoney(value, true);
      if (await onSave(value, base)) setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Некорректная сумма");
    }
  }
  return (
    <article>
      <div className="line">
        <b>{name}</b>
        <small>Факт: {currency(spent)}</small>
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
