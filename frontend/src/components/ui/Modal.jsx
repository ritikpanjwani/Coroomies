import { useEffect } from "react";
import { XIcon } from "../Icons";

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  showClose = true,
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog"}
        className={`relative max-h-[92dvh] w-full ${maxWidth} animate-scale-in overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-800 shadow-popup sm:max-h-none sm:overflow-visible sm:rounded-2xl`}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 sm:px-6 sm:py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {showClose && (
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <XIcon className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        )}
        <div className="p-4 sm:p-6 sm:max-h-[75vh] sm:overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}