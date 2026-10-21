import { useState } from "react";
import type { Category, Family, Run } from "../types";
import { renameFamily, saveCategory } from "../lib/features";
import { applyTheme, readTheme, type Theme } from "../lib/theme";
export function Appearance() {
  const [theme, setTheme] = useState(readTheme);
  return (
    <article>
      <h3>Оформление</h3>
      <label>
        Тема
        <select
          value={theme}
          onChange={(e) => {
            const v = e.target.value as Theme;
            setTheme(v);
            localStorage.setItem("family-budget.theme", v);
            applyTheme(v);
          }}
        >
          <option value="system">Как на устройстве</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
      </label>
    </article>
  );
}
export function FamilySettings({
  family,
  busy,
  run,
}: {
  family: Family;
  busy: boolean;
  run: Run;
}) {
  const [name, setName] = useState(family.name);
  return (
    <article>
      <h3>Название семьи</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await renameFamily(family.id, name, family.settings_version ?? 1);
          }, "Название сохранено");
        }}
      >
        <label>
          Название семьи
          <input
            value={name}
            required
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy}>Сохранить название</button>
      </form>
    </article>
  );
}
export function CategorySettings({
  cats,
  family,
  busy,
  run,
}: {
  cats: Category[];
  family: string;
  busy: boolean;
  run: Run;
}) {
  const [edit, setEdit] = useState<Category | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const fresh = () =>
    setEdit({
      id: crypto.randomUUID(),
      household_id: family,
      name: "",
      kind: "expense",
      essential: false,
      version: 0,
      archived: false,
    });
  return (
    <article>
      <div className="line">
        <h3>Категории</h3>
        <button className="tiny" onClick={fresh}>
          Добавить категорию
        </button>
      </div>
      <p className="hint">
        Удалённые категории скрываются из новых операций. История и суммы
        сохраняются.
      </p>
      {edit && (
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveCategory(edit);
            }, "Категория сохранена").then((ok) => {
              if (ok) setEdit(null);
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Название категории
              <input
                autoFocus
                required
                maxLength={60}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              Тип категории
              <select
                disabled={!!edit.version}
                value={edit.kind}
                onChange={(e) =>
                  setEdit({ ...edit, kind: e.target.value as Category["kind"] })
                }
              >
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
              </select>
            </label>
            <div className="actions">
              <button>Сохранить категорию</button>
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
      )}
      {cats
        .filter((c) => showArchived || !c.archived)
        .map((c) => (
          <div className="setting-row" key={c.id}>
            <div>
              <b>{c.name}</b>
              <small>
                {c.kind === "income" ? "Доход" : "Расход"}
                {c.archived ? " · Удалена" : ""}
              </small>
            </div>
            <div className="actions">
              <button
                className="tiny"
                disabled={busy}
                aria-label={`Изменить категорию ${c.name}`}
                onClick={() => setEdit({ ...c, version: c.version ?? 1 })}
              >
                Изменить
              </button>
              <button
                className="tiny"
                disabled={busy}
                aria-label={`${c.archived ? "Восстановить" : "Удалить"} категорию ${c.name}`}
                onClick={() => {
                  if (
                    c.archived ||
                    confirm(
                      `Убрать «${c.name}» из новых операций? История сохранится.`,
                    )
                  )
                    void run(
                      async () => {
                        await saveCategory({
                          ...c,
                          version: c.version ?? 1,
                          archived: !c.archived,
                        });
                      },
                      c.archived
                        ? "Категория восстановлена"
                        : "Категория удалена из списка",
                    );
                }}
              >
                {c.archived ? "Вернуть" : "Удалить"}
              </button>
            </div>
          </div>
        ))}
      <button className="tiny" onClick={() => setShowArchived(!showArchived)}>
        {showArchived ? "Скрыть удалённые" : "Показать удалённые"}
      </button>
    </article>
  );
}
