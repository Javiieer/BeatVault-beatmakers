export type Module = {
  label: string;
  path: string;
  icon: "home" | "disc" | "library" | "music" | "upload" | "admin" | "video" | "plans" | "users" | "messages" | "store" | "grid" | "sparkles" | "chart" | "settings";
  state: "partial" | "prototype" | "placeholder";
  decision: "keep" | "defer" | "merge";
  navigation: "primary" | "admin" | "hidden";
  source: string;
  next: string;
};

// Shared by navigation, browser coverage and the diagnostic report.
export const modules: readonly Module[] = [
  { label: "Home", path: "/home", icon: "home", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Home.tsx", next: "Make publication audiences and notification destinations clear; retain the verified PostgreSQL post/story lifecycle before expanding social scope." },
  { label: "Friends", path: "/friends", icon: "users", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Friends.tsx", next: "Keep opt-in discovery and accepted-friend permissions reliable; define blocking/reporting before adding collaboration invitations." },
  { label: "Messages", path: "/chat", icon: "messages", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Chat.tsx", next: "PostgreSQL persistence and SSE are verified locally. Improve recovery after disconnects and keep text/friend authorization explicit before attachments." },
  { label: "My uploads", path: "/studio", icon: "disc", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Studio.tsx", next: "Upload and seller reviews persist independently of audit retention. Improve creator guidance using local workflow feedback." },
  { label: "Library", path: "/library", icon: "library", state: "partial", decision: "merge", navigation: "hidden", source: "src/components/Library.tsx", next: "Legacy link opens the personal-library tab inside Marketplace." },
  { label: "Beats", path: "/beats", icon: "music", state: "partial", decision: "merge", navigation: "hidden", source: "src/components/Marketplace.tsx", next: "Legacy link opens Marketplace filtered to Beats." },
  { label: "Marketplace", path: "/marketplace", icon: "store", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Marketplace.tsx", next: "Review seller/buyer terms and licenses with counsel; complete two-account Stripe test, refund, webhook-retry and dispute scenarios before any live-mode decision." },
  { label: "Upload", path: "/upload", icon: "upload", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Upload.tsx", next: "Beat and One-shot review, batch retries and image normalization are verified locally. Improve submission guidance using creator feedback." },
  { label: "Beat Detail", path: "/beat-detail", icon: "music", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/Beats.tsx", next: "Read a published catalog record by ID and keep private drafts inaccessible." },
    { label: "Admin", path: "/admin", icon: "admin", state: "partial", decision: "keep", navigation: "admin", source: "src/components/Admin.tsx", next: "Continue two-account moderation tests; either a Community Manager or admin can independently approve/publish a Beat upload." },
  { label: "Marketplace review", path: "/community-review", icon: "admin", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/MarketplaceReview.tsx", next: "Run local two-account upload/listing review tests, validate private evidence retention, and obtain legal review before enabling offers." },
  { label: "Shorts", path: "/shorts", icon: "video", state: "prototype", decision: "defer", navigation: "hidden", source: "src/components/ShortsFeed.tsx", next: "Revisit after the audio catalog works end to end." },
  { label: "Plans", path: "/plans", icon: "plans", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Plans.tsx", next: "Define storage capacity and package features with the team before enabling commercial limits or billing." },
  { label: "Community", path: "/community", icon: "users", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Validate creator demand after the catalog launch." },
  { label: "Store", path: "/store", icon: "store", state: "partial", decision: "merge", navigation: "hidden", source: "src/components/Marketplace.tsx", next: "Creator stores show public offers; links without a creator redirect to Marketplace." },
  { label: "AI Lab", path: "/ai", icon: "sparkles", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Require a concrete creator task before adding AI services." },
  { label: "Releases", path: "/releases", icon: "upload", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Distribution is outside the first catalog release." },
  { label: "Analytics", path: "/analytics", icon: "chart", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Collect real consent-aware events before building dashboards." },
  { label: "Mi perfil", path: "/profile", icon: "users", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/CreatorProfile.tsx", next: "Public project links and account-scoped session drafts are implemented. Improve creator guidance and cross-device preferences." },
  { label: "Ajustes", path: "/settings", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/CreatorProfile.tsx", next: "Expand email verification and move preferences to server sync when accounts can access transactional email." },
  { label: "Recuperar contraseña", path: "/forgot-password", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/PasswordRecovery.tsx", next: "Connect transactional email delivery for non-development deployments." },
  { label: "Cambiar contraseña olvidada", path: "/password-reset", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/PasswordRecovery.tsx", next: "Connect transactional email delivery for non-development deployments." },
];
