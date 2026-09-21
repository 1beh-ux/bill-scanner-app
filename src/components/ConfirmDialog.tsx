"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";

// One in-page dialog for every "are you sure?" and "FYI" in the app, in place
// of window.confirm / window.alert (native pop-ups are unstyled, untranslatable
// buttons, and blocked in some embedded browsers).
//
//   const confirm = useConfirm();
//   if (!(await confirm({ message: t("...confirmDelete"), danger: true }))) return;
//
// - Esc cancels; Tab/Shift+Tab stay inside the dialog (focus trap).
// - The *safe* button gets the initial focus, so Enter is always safe: Cancel
//   for a `danger` dialog, Confirm otherwise. Enter is the browser's normal
//   "activate the focused button" -- there is deliberately no global Enter handler.
// - `useAlert()` is the one-button variant (replacement for window.alert).

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: red confirm button, initial focus on Cancel. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { alertOnly: boolean; resolve: (ok: boolean) => void };

type Ctx = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  alert: (o: Pick<ConfirmOptions, "title" | "message" | "confirmLabel">) => Promise<void>;
};

const ConfirmContext = createContext<Ctx | null>(null);

export function useConfirm(): Ctx["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}

export function useAlert(): Ctx["alert"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useAlert must be used inside <ConfirmProvider>");
  return ctx.alert;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, alertOnly: false, resolve })),
    []
  );
  const alert = useCallback(
    (o: Pick<ConfirmOptions, "title" | "message" | "confirmLabel">) =>
      new Promise<void>((resolve) => setPending({ ...o, alertOnly: true, resolve: () => resolve() })),
    []
  );

  function close(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {pending && <DialogView pending={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DialogView({ pending, onClose }: { pending: Pending; onClose: (ok: boolean) => void }) {
  const { t } = useTranslations();
  const dialogRef = useRef<HTMLDivElement>(null);
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const danger = pending.danger === true && !pending.alertOnly;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    safeButtonRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(false);
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const cancelBtn =
    "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 focus:outline-none focus:ring-2 focus:ring-ember";
  const confirmBtn =
    "rounded-lg px-4 py-2 text-[14px] font-medium text-white focus:outline-none focus:ring-2 focus:ring-ember " +
    (danger ? "bg-red-600 hover:bg-red-700" : "bg-ember hover:bg-ember-hover");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role={pending.alertOnly ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md rounded-lg bg-paper p-5 shadow-lg"
      >
        <h2 id="confirm-dialog-title" className="mb-2 text-[16px] font-semibold text-ink">
          {pending.title ?? t(danger ? "confirmDialog.dangerTitle" : pending.alertOnly ? "confirmDialog.noticeTitle" : "confirmDialog.title")}
        </h2>
        <p id="confirm-dialog-message" className="mb-5 whitespace-pre-line text-[14px] text-ink-secondary">
          {pending.message}
        </p>
        <div className="flex justify-end gap-2">
          {!pending.alertOnly && (
            <button
              type="button"
              ref={danger ? safeButtonRef : undefined}
              onClick={() => onClose(false)}
              className={cancelBtn}
            >
              {pending.cancelLabel ?? t("common.cancel")}
            </button>
          )}
          <button
            type="button"
            ref={danger ? undefined : safeButtonRef}
            onClick={() => onClose(true)}
            className={confirmBtn}
          >
            {pending.confirmLabel ?? (pending.alertOnly ? t("common.ok") : danger ? t("common.delete") : t("common.confirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}
