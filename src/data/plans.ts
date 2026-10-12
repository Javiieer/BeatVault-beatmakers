export type PlanKey = 'free' | 'creator' | 'studio'
export type Usage = { used: number; limit: number }

export function usagePercent(item: Usage): number {
  return Math.min(100, Math.round((item.used / item.limit) * 100));
}

export function usageStatus(item: Usage): "healthy" | "attention" | "full" {
  const percent = usagePercent(item);
  return percent >= 100 ? "full" : percent >= 80 ? "attention" : "healthy";
}
