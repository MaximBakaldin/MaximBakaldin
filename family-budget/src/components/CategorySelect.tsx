import { useEffect, useId, useRef, useState } from "react";
import type { Category } from "../types";

export function CategorySelect({
  cats,
  value,
  onChange,
}: {
  cats: Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [space, setSpace] = useState({ above: false, height: 200 });
  const selected = cats.find((c) => c.id === value);
  const matches = selected
    ? cats
    : cats.filter((c) =>
        c.name
          .toLocaleLowerCase("ru-RU")
          .startsWith(query.trim().toLocaleLowerCase("ru-RU")),
      );
  const index = Math.min(active, matches.length - 1);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const rect = container.current?.getBoundingClientRect();
      if (!rect) return;
      const top = viewport?.offsetTop ?? 0;
      const bottom = Math.min(
        top + (viewport?.height ?? window.innerHeight),
        document.querySelector(".transaction-dock")?.getBoundingClientRect()
          .top ?? window.innerHeight,
      );
      const down = bottom - rect.bottom - 8;
      const up = rect.top - top - 8;
      const above = down < 120 && up > down;
      const height = Math.max(40, Math.min(200, above ? up : down));
      setSpace((old) =>
        old.above === above && old.height === height ? old : { above, height },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    viewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, index, query]);
  function choose(category: Category) {
    onChange(category.id);
    setQuery("");
    setOpen(false);
    input.current?.focus({ preventScroll: true });
  }
  return (
    <div
      className="category-select"
      ref={container}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>Категория</label>
      <div className="category-select-control">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && index >= 0 ? `${id}-option-${index}` : undefined
          }
          autoComplete="off"
          placeholder="Выберите или начните вводить"
          value={selected?.name ?? query}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("");
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive(
                open
                  ? Math.max(
                      0,
                      Math.min(
                        matches.length - 1,
                        index + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
                  : 0,
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && matches[index]) choose(matches[index]);
              else setOpen(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="category-select-toggle"
          aria-label="Показать категории"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            input.current?.focus();
            setOpen(!open);
            setActive(0);
          }}
        >
          ⌄
        </button>
      </div>
      {open && (
        <div
          className="category-options"
          role="listbox"
          aria-label="Категории"
          id={`${id}-list`}
          ref={list}
          style={{
            maxHeight: space.height,
            top: space.above ? "auto" : "100%",
            bottom: space.above ? "100%" : "auto",
          }}
        >
          {matches.map((c, i) => (
            <button
              type="button"
              role="option"
              tabIndex={-1}
              id={`${id}-option-${i}`}
              key={c.id}
              aria-selected={value === c.id}
              data-active={i === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
            >
              {c.name}
            </button>
          ))}
          {!matches.length && (
            <div className="category-no-match" role="status">
              Нет категорий с таким началом
            </div>
          )}
        </div>
      )}
    </div>
  );
}
