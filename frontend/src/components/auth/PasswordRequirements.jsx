import { checkPasswordCriteria } from "../../utils/validation";
import { CheckIcon } from "../Icons";

const CRITERIA = [
  { key: "length", label: "8+ characters" },
  { key: "uppercase", label: "Uppercase letter (A-Z)" },
  { key: "lowercase", label: "Lowercase letter (a-z)" },
  { key: "number", label: "Number (0-9)" },
  { key: "special", label: "Special symbol (!@#$%...)" },
];

export default function PasswordRequirements({ password = "" }) {
  const status = checkPasswordCriteria(password);
  const metCount = Object.values(status).filter(Boolean).length;
  const isAllMet = metCount === CRITERIA.length;

  return (
    <div className="mt-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          Password requirements
        </span>
        <span
          className={`font-semibold ${
            isAllMet
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {metCount} of {CRITERIA.length} met
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full transition-all duration-300 ${
            isAllMet
              ? "bg-emerald-500"
              : metCount >= 3
              ? "bg-brand-600"
              : "bg-amber-400"
          }`}
          style={{ width: `${(metCount / CRITERIA.length) * 100}%` }}
        />
      </div>

      <ul className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
        {CRITERIA.map(({ key, label }) => {
          const met = status[key];
          return (
            <li
              key={key}
              className={`flex items-center gap-1.5 transition-colors ${
                met
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  met
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : "bg-slate-200/70 text-slate-400 dark:bg-slate-700"
                }`}
              >
                {met ? <CheckIcon className="h-2.5 w-2.5" /> : "•"}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
