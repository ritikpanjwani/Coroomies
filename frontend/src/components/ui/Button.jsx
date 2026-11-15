import Spinner from "./Spinner";

const VARIANTS = {
  primary:
    "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm shadow-brand-600/25 hover:from-brand-700 hover:to-violet-600 focus-visible:ring-brand-500",
  secondary:
    "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:ring-slate-400 shadow-sm",
  ghost:
    "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus-visible:ring-slate-400",
  danger:
    "bg-rose-500 text-white shadow-sm shadow-rose-500/25 hover:bg-rose-600 focus-visible:ring-rose-500",
  dangerOutline:
    "text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-50 dark:hover:bg-rose-500/10 focus-visible:ring-rose-400",
  dark:
    "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-700",
  success:
    "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 hover:bg-emerald-600 focus-visible:ring-emerald-500",
  accent:
    "bg-gradient-to-r from-accent-500 to-brand-500 text-white shadow-sm shadow-accent-500/25 hover:from-accent-600 hover:to-brand-600 focus-visible:ring-accent-500",
};

const SIZES = {
  sm: "px-3 py-1.5 min-h-[38px] text-xs sm:text-sm",
  md: "px-4 py-2.5 min-h-[44px] text-sm",
  lg: "px-5 py-3 min-h-[48px] text-base sm:text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...props
}) {
  const hasDisplay = /\b(hidden|block|inline-block|flex|inline-flex|grid|inline-grid)\b/.test(className);
  const displayClass = hasDisplay ? "" : "inline-flex";

  return (
    <button
      className={`${displayClass} items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
        VARIANTS[variant] || VARIANTS.primary
      } ${SIZES[size] || SIZES.md} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" light />}
      {children}
    </button>
  );
}