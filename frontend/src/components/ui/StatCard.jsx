const ACCENTS = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400 border border-brand-200/60 dark:border-brand-800/60",
  accent: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 border border-violet-200/60 dark:border-violet-800/60",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400 border border-cyan-200/60 dark:border-cyan-800/60",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/60",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 border border-violet-200/60 dark:border-violet-800/60",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60",
};

export default function StatCard({
  label,
  value,
  icon,
  accent = "brand",
  onClick,
  hint,
  title,
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title || (hint ? `${label}: ${hint}` : label)}
      aria-label={`${label}: ${value}${hint ? ` - ${hint}` : ""}`}
      className={`group relative flex w-full h-full min-h-[105px] sm:min-h-[115px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-3 sm:p-4 text-left shadow-card transition-all duration-200 active:scale-[0.98] ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-snug break-words">
          {label}
        </span>
        <div
          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ${ACCENTS[accent] || ACCENTS.brand} shadow-2xs transition-transform duration-200 group-hover:scale-105`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-2.5 sm:mt-3">
        <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 break-words">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{hint}</p>
        )}
      </div>
    </Wrapper>
  );
}