const VARIANTS = {
  neutral: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  brand: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-600/10 dark:ring-brand-400/20",
  success: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-400/20",
  warning: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/10 dark:ring-amber-400/20",
  danger: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/10 dark:ring-rose-400/20",
  info: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/10 dark:ring-sky-400/20",
  accent: "bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-1 ring-inset ring-accent-600/10 dark:ring-accent-400/20",
  dark: "bg-slate-800 dark:bg-slate-600 text-white",
};

export default function Badge({
  variant = "neutral",
  children,
  className = "",
  dot = false,
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        VARIANTS[variant] || VARIANTS.neutral
      } ${className}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  );
}