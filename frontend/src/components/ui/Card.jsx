export default function Card({
  children,
  className = "",
  hoverable = false,
  ...props
}) {
  return (
    <div
      className={`min-w-0 max-w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card ${
        hoverable
          ? "transition-all duration-150 hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}