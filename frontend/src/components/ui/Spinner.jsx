export default function Spinner({ size = "md", light = false, className = "" }) {
  const sizes = {
    sm: "h-4 w-4 border-2",
    md: "h-7 w-7 border-2",
    lg: "h-10 w-10 border-[3px]",
  };

  const colors = light
    ? "border-white/30 border-t-white"
    : "border-slate-200 dark:border-slate-600 border-t-brand-500 dark:border-t-brand-400";

  return (
    <div
      className={`${sizes[size]} ${colors} rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}