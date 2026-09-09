export type AdminState = "pending" | "reported" | "active" | "paused" | "healthy" | "degraded";
export type AdminRow = { id: string; title: string; detail: string; state: AdminState };
export const mockAdminRole = "moderator" as const;
export const adminMetrics = [
  ["Pending accounts", "12", "needs review"], ["Reported content", "7", "3 high priority"],
  ["Active promotions", "4", "mock only"], ["Subscriptions", "1,284", "+8.4% mock trend"],
] as const;
export const accountReviews: readonly AdminRow[] = [
  { id: "acct-104", title: "Luna Circuit", detail: "creator verification · 2h ago", state: "pending" },
  { id: "acct-103", title: "Northside Audio", detail: "profile review · yesterday", state: "pending" },
  { id: "acct-098", title: "Milo Keys", detail: "documents received · yesterday", state: "active" },
];
export const moderationQueue: readonly AdminRow[] = [
  { id: "report-21", title: "Neon Dust pack", detail: "copyright claim · high priority", state: "reported" },
  { id: "report-19", title: "After Hours beat", detail: "metadata review · 4h ago", state: "reported" },
];
export const promotionSummary: readonly AdminRow[] = [
  { id: "promo-01", title: "CREATOR-DEMO", detail: "Creator · 38 redemptions", state: "active" },
  { id: "promo-02", title: "WELCOME-MOCK", detail: "Free · expires in 12 days", state: "paused" },
];
export const providerHealth = [{ name: "BeatVault local", state: "healthy" as const, detail: "Mock data source" }, { name: "Preview service", state: "degraded" as const, detail: "No backend connected" }];
