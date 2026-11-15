import { forwardRef, useState } from "react";
import { EyeIcon, EyeOffIcon } from "../Icons";

const baseFieldClasses =
  "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-500 dark:disabled:border-slate-700";

const errorFieldClasses =
  "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10";

function errorHint(error) {
  if (error) {
    return (
      <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
        {error}
      </p>
    );
  }
  return null;
}

export function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      {children}
      {errorHint(error)}
      {!error && hint && (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    required,
    id,
    type = "text",
    className = "",
    showPasswordToggle = true,
    ...props
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password" && showPasswordToggle;
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  const inputElement = (
    <div className="relative w-full">
      <input
        ref={ref}
        id={id}
        type={inputType}
        className={`${baseFieldClasses} ${isPassword ? "pr-10" : ""} ${error ? errorFieldClasses : ""} ${className}`}
        aria-invalid={error ? "true" : undefined}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors cursor-pointer"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOffIcon className="h-4.5 w-4.5" />
          ) : (
            <EyeIcon className="h-4.5 w-4.5" />
          )}
        </button>
      )}
    </div>
  );

  if (!label) return inputElement;

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {inputElement}
    </Field>
  );
});

export function Select({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  children,
  ...props
}) {
  const select = (
    <select
      id={id}
      aria-invalid={error ? "true" : undefined}
      className={`${baseFieldClasses} ${error ? errorFieldClasses : ""} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%3E%3Cpath%20d%3D%22M1%201.5L6%206.5L11%201.5%22%20stroke%3D%22%239aa5ba%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_8px] bg-[right_12px_center] bg-no-repeat pr-10 ${className}`}
      {...props}
    >
      {children}
    </select>
  );

  if (!label) return select;

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {select}
    </Field>
  );
}

export function Textarea({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  ...props
}) {
  const textarea = (
    <textarea
      id={id}
      aria-invalid={error ? "true" : undefined}
      className={`${baseFieldClasses} resize-none ${error ? errorFieldClasses : ""} ${className}`}
      {...props}
    />
  );

  if (!label) return textarea;

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {textarea}
    </Field>
  );
}