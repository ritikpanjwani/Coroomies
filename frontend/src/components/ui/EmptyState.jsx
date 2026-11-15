export default function EmptyState({
  icon,
  title,
  description,
  children,
  compact = false,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16"
      } px-6`}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 dark:from-brand-500/15 dark:to-violet-500/15 text-brand-500 dark:text-brand-300 ring-1 ring-inset ring-brand-100 dark:ring-brand-500/20 shadow-card">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}