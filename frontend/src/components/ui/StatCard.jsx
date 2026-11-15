const ACCENTS = {
  brand: "from-brand-500 to-violet-500",
  accent: "from-accent-500 to-brand-500",
  cyan: "from-cyan-400 to-accent-600",
  sky: "from-sky-500 to-blue-500",
  violet: "from-violet-500 to-purple-500",
  amber: "from-amber-500 to-orange-500",
  rose: "from-rose-500 to-pink-500",
  emerald: "from-emerald-500 to-teal-600",
  slate: "from-slate-600 to-slate-800",
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
          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ACCENTS[accent] || ACCENTS.brand} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
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