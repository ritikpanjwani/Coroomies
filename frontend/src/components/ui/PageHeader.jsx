export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}