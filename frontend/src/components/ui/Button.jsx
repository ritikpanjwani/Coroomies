import Spinner from "./Spinner";

const VARIANTS = {
  primary:
    "bg-brand-600 hover:bg-brand-700 text-white shadow-xs focus-visible:ring-brand-500 active:bg-brand-800",
  secondary:
    "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 focus-visible:ring-slate-400 shadow-xs",
  ghost:
    "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus-visible:ring-slate-400",
  danger:
    "bg-rose-600 text-white shadow-xs hover:bg-rose-700 focus-visible:ring-rose-500",
  dangerOutline:
    "text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus-visible:ring-rose-400",
  dark:
    "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-700",
  success:
    "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 focus-visible:ring-emerald-500",
  accent:
    "bg-brand-600 text-white shadow-xs hover:bg-brand-700 focus-visible:ring-brand-500",
};

const SIZES = {
  sm: "px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg",
  md: "px-4 py-2 min-h-[40px] text-sm font-medium rounded-xl",
  lg: "px-5 py-2.5 min-h-[46px] text-sm sm:text-base font-semibold rounded-xl",
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