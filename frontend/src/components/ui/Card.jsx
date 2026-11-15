export default function Card({
  children,
  className = "",
  hoverable = false,
  ...props
}) {
  return (
    <div
      className={`min-w-0 max-w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-card ${
        hoverable
          ? "transition-all duration-200 hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}