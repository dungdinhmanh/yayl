import { useEffect, useRef } from "react";

interface Props {
  title: string;
  body: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/* Small confirmation dialog for destructive actions. Focus starts on the safe
   button, Escape cancels, and the affected path stays visible. */
export default function ConfirmDialog({
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel.current();
    };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="install-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel.current();
      }}
    >
      <div
        className="install-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmTitle"
        aria-describedby="confirmBody"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="install-head">
          <div className="install-head-copy">
            <div className="install-title" id="confirmTitle">
              {title}
            </div>
            <div className="install-sub" id="confirmBody">
              {body}
            </div>
          </div>
        </div>
        {detail && (
          <div className="install-body">
            <div className="confirm-path mono">{detail}</div>
          </div>
        )}
        <div className="install-foot">
          <span aria-hidden="true" />
          <div className="install-actions">
            <button
              className="btn btn-ghost"
              type="button"
              ref={cancelRef}
              onClick={() => cancel.current()}
            >
              {cancelLabel}
            </button>
            <button
              className={danger ? "btn btn-danger" : "btn btn-primary"}
              type="button"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
