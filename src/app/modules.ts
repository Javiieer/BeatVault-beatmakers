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
  { label: "Home", path: "/home", icon: "home", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Home.tsx", next: "Keep local posts clearly scoped; design cross-device publishing only after catalog review is verified." },
  { label: "Friends", path: "/friends", icon: "users", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Friends.tsx", next: "Add collaboration invitations after friend connections are in use." },
  { label: "Messages", path: "/chat", icon: "messages", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Chat.tsx", next: "Add message attachments and validate PostgreSQL persistence before hosting." },
  { label: "My uploads", path: "/studio", icon: "disc", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Studio.tsx", next: "Validate seller review status and feedback across separate accounts and the complete PostgreSQL workflow." },
  { label: "Library", path: "/library", icon: "library", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Library.tsx", next: "Use real published discovery content; owned audio references persist." },
  { label: "Beats", path: "/beats", icon: "music", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Beats.tsx", next: "Validate the processed preview lifecycle and media decoding against the PostgreSQL pilot before public delivery." },
  { label: "Marketplace", path: "/marketplace", icon: "store", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Marketplace.tsx", next: "Review seller/buyer terms and licenses with counsel; complete two-account Stripe test, refund, webhook-retry and dispute scenarios before any live-mode decision." },
    { label: "Upload", path: "/upload", icon: "upload", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Upload.tsx", next: "Exercise independent CM and admin Beat approval with separate local accounts; test private previews, rejection feedback, and the approval race before hosting." },
  { label: "Beat Detail", path: "/beat-detail", icon: "music", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/Beats.tsx", next: "Resolve real catalog IDs, audio and ownership." },
    { label: "Admin", path: "/admin", icon: "admin", state: "partial", decision: "keep", navigation: "admin", source: "src/components/Admin.tsx", next: "Continue two-account moderation tests; either a Community Manager or admin can independently approve/publish a Beat upload." },
  { label: "Marketplace review", path: "/community-review", icon: "admin", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/MarketplaceReview.tsx", next: "Run local two-account upload/listing review tests, validate private evidence retention, and obtain legal review before enabling offers." },
  { label: "Shorts", path: "/shorts", icon: "video", state: "prototype", decision: "defer", navigation: "hidden", source: "src/components/ShortsFeed.tsx", next: "Revisit after the audio catalog works end to end." },
  { label: "Plans", path: "/plans", icon: "plans", state: "partial", decision: "keep", navigation: "primary", source: "src/components/Plans.tsx", next: "Define storage capacity and package features with the team before enabling commercial limits or billing." },
  { label: "Community", path: "/community", icon: "users", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Validate creator demand after the catalog launch." },
  { label: "Store", path: "/store", icon: "store", state: "placeholder", decision: "merge", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Keep as a legacy placeholder; Marketplace is the sole discovery and future purchase entry point." },
  { label: "AI Lab", path: "/ai", icon: "sparkles", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Require a concrete creator task before adding AI services." },
  { label: "Releases", path: "/releases", icon: "upload", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Distribution is outside the first catalog release." },
  { label: "Analytics", path: "/analytics", icon: "chart", state: "placeholder", decision: "defer", navigation: "hidden", source: "src/components/Placeholder.tsx", next: "Collect real consent-aware events before building dashboards." },
  { label: "Mi perfil", path: "/profile", icon: "users", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/CreatorProfile.tsx", next: "Custom profile images and public audio previews remain separate work." },
  { label: "Ajustes", path: "/settings", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/CreatorProfile.tsx", next: "Expand email verification and move preferences to server sync when accounts can access transactional email." },
  { label: "Recuperar contraseña", path: "/forgot-password", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/PasswordRecovery.tsx", next: "Connect transactional email delivery for non-development deployments." },
  { label: "Cambiar contraseña olvidada", path: "/password-reset", icon: "settings", state: "partial", decision: "keep", navigation: "hidden", source: "src/components/PasswordRecovery.tsx", next: "Connect transactional email delivery for non-development deployments." },
];
