import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      dialog?.close?.();
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="budget-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="section-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="tiny"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
