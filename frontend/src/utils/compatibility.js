export function compatibilityColor(score) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0ea5e9";
  if (score >= 40) return "#f59e0b";
  return "#f43f5e";
}

export function compatibilityLabel(score) {
  if (score >= 80) return "Excellent match";
  if (score >= 60) return "Great match";
  if (score >= 40) return "Fair match";
  return "Low match";
}

export function compatibilityTailwind(score) {
  if (score >= 80)
    return "from-emerald-500 to-teal-500";
  if (score >= 60)
    return "from-sky-500 to-blue-500";
  if (score >= 40)
    return "from-amber-500 to-orange-500";
  return "from-rose-500 to-pink-500";
}