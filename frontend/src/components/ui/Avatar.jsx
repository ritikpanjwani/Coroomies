import { useState } from "react";

const PALETTE = [
  "bg-brand-500",
  "bg-violet-500",
  "bg-accent-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-blue-500",
  "bg-indigo-500",
];

function hashName(name = "") {
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return sum % PALETTE.length;
}

export default function Avatar({
  name = "",
  src = "",
  size = "md",
  className = "",
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const sizes = {
    xs: "h-6 w-6 text-[11px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-xl",
  };

  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  if (src && !imgFailed) {
    return (
      <img
        key={src}
        src={src}
        alt={name}
        onError={() => setImgFailed(true)}
        className={`${sizes[size] || sizes.md} ${
          size === "xl" ? "rounded-2xl" : "rounded-full"
        } shrink-0 object-cover select-none ring-1 ring-inset ring-black/5 dark:ring-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizes[size] || sizes.md} ${PALETTE[hashName(name)]} ${
        size === "xl" ? "rounded-2xl" : "rounded-full"
      } flex shrink-0 items-center justify-center font-semibold text-white ring-1 ring-inset ring-black/10 dark:ring-white/10 select-none ${className}`}
    >
      {initials}
    </div>
  );
}