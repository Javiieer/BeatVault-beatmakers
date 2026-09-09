export type PlanStatus = "trial" | "active" | "upgrade" | "downgrade" | "cancelled";
export type PlanKey = "free" | "creator" | "studio";
export type UsageKey = "downloads" | "previews" | "storage" | "connections";

export type Plan = { key: PlanKey; name: string; description: string; limits: Record<UsageKey, number>; price: string; featured?: boolean };
export type Usage = { key: UsageKey; label: string; used: number; limit: number; unit: string };

export const plans: readonly Plan[] = [
  { key: "free", name: "Free", description: "Para explorar el flujo creativo", price: "$0", limits: { downloads: 10, previews: 60, storage: 5, connections: 1 } },
  { key: "creator", name: "Creator", description: "Más espacio para tu catálogo", price: "$12 demo", featured: true, limits: { downloads: 100, previews: 600, storage: 50, connections: 3 } },
  { key: "studio", name: "Studio", description: "Un workspace listo para crecer", price: "$29 demo", limits: { downloads: 500, previews: 3000, storage: 250, connections: 10 } },
];

export const currentPlan: PlanKey = "creator";
export const currentStatus: PlanStatus = "trial";
export const usage: readonly Usage[] = [
  { key: "downloads", label: "Descargas mensuales", used: 42, limit: 100, unit: "descargas" },
  { key: "previews", label: "Previews", used: 318, limit: 600, unit: "minutos" },
  { key: "storage", label: "Storage BeatVault", used: 18, limit: 50, unit: "GB" },
  { key: "connections", label: "Conexiones cloud", used: 2, limit: 3, unit: "conexiones" },
];

export function usagePercent(item: Pick<Usage, "used" | "limit">): number {
  return Math.min(100, Math.round((item.used / item.limit) * 100));
}

export function usageStatus(item: Pick<Usage, "used" | "limit">): "healthy" | "attention" | "full" {
  const percent = usagePercent(item);
  return percent >= 100 ? "full" : percent >= 80 ? "attention" : "healthy";
}
