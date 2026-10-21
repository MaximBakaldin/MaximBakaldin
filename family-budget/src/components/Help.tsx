import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
export function Help({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function hideSoon() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  function show() {
    cancelClose();
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(280, window.innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(r.bottom + 6, window.innerHeight - 180)),
      });
    }
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (
        e.type === "pointerdown" &&
        (ref.current?.contains(e.target as Node) ||
          bubble.current?.contains(e.target as Node))
      )
        return;
      if (e.type === "scroll" && bubble.current?.contains(e.target as Node))
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="help"
        aria-label={`Подсказка: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            ref={bubble}
            onMouseEnter={cancelClose}
            onMouseLeave={hideSoon}
            role="tooltip"
            id={id}
            className="help-bubble"
            style={position}
          >
            {children}
          </span>,
          document.body,
        )}
    </>
  );
}
