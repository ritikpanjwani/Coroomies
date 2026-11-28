import { useEffect, useState } from "react";
import { CloseIcon } from "../Icons";

export default function ServerWakeupNotice() {
  const [isWaking, setIsWaking] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let dismissTimer = null;

    const handleWaking = () => {
      setIsWaking(true);
      setJustConnected(false);
      setDismissed(false);
    };

    const handleReady = () => {
      setIsWaking((prev) => {
        if (prev) {
          setJustConnected(true);
          dismissTimer = setTimeout(() => {
            setIsWaking(false);
            setJustConnected(false);
          }, 4000);
        }
        return false;
      });
    };

    window.addEventListener("coroomies:server-waking", handleWaking);
    window.addEventListener("coroomies:server-ready", handleReady);

    return () => {
      window.removeEventListener("coroomies:server-waking", handleWaking);
      window.removeEventListener("coroomies:server-ready", handleReady);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, []);

  if (dismissed || (!isWaking && !justConnected)) return null;

  return (
    <div
      className={`relative z-50 flex items-center justify-between px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-300 shadow-xs border-b ${
        justConnected
          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800"
          : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 mx-auto">
        {justConnected ? (
          <>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Server is online and ready!</span>
          </>
        ) : (
          <>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span>
              <strong>Server is waking up...</strong> Render free tier spins down after inactivity. Thanks for your patience (~30s).
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors"
        aria-label="Dismiss notice"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
