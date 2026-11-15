import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircleIcon, AlertIcon, InfoIcon, CloseIcon } from "./Icons";

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircleIcon className="h-5 w-5 text-emerald-500" />,
  error: <AlertIcon className="h-5 w-5 text-rose-500" />,
  info: <InfoIcon className="h-5 w-5 text-brand-500" />,
};

const ACCENTS = {
  success: "border-emerald-200 dark:border-emerald-500/30",
  error: "border-rose-200 dark:border-rose-500/30",
  info: "border-brand-200 dark:border-brand-500/30",
};

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (msg) => push("success", msg),
      error: (msg) => push("error", msg),
      info: (msg) => push("info", msg),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[100] flex flex-col-reverse gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-80 sm:max-w-[calc(100vw-2rem)]"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border bg-white dark:bg-slate-800 p-3.5 shadow-popup ${
              ACCENTS[toast.type] || ACCENTS.info
            }`}
          >
            <div className="mt-0.5 shrink-0">{ICONS[toast.type] || ICONS.info}</div>
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              {typeof toast.message === "string" ? toast.message : String(toast.message)}
            </p>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 text-slate-400 dark:text-slate-500 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Dismiss"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}