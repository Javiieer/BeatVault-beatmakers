import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChartNoAxesColumn, Disc3, Grid2X2, Home as HomeIcon, Library as LibraryIcon, Menu, MessageCircle, Music2, Search, Settings, Sparkles, Store, Upload as UploadIcon, Users, Video, CreditCard, ShieldCheck } from "lucide-react";
import { assets } from "../data/mock";
import {
  AudioPlayer,
  Icon,
} from "../components/ui";
import { Home } from "../components/Home";
import { ShortsFeed } from "../components/ShortsFeed";
import { Upload } from "../components/Upload";
import {
  readCatalog,
  type CatalogAsset,
} from "../data/localCatalog";
import {
  readLocalProjects,
} from "../data/localProjects";
import type { AudioAsset, Project } from "../types";
import { Placeholder } from "../components/Placeholder";
import { nav, secondary } from "./navigation";
import { modules } from "./modules";
import { Studio } from "../components/Studio";
import { ownedUploads } from "../data/creatorUploads";
import "../styles/creator-uploads.css";
import { Beats, BeatDetail } from "../components/Beats";
import { Marketplace } from "../components/Marketplace";
import { Library } from "../components/Library";
import "../styles/app.css";
import "../styles/marketplace.css";
import "../styles/themes.css";
import "../styles/scrollbars.css";
import { customThemeStyle, readStoredTheme, type Theme } from "./theme";
import { readUserSettings } from "../data/userSettings";
import { clearSessionPreviews, removeSessionPreview, setSessionPreview } from "../data/sessionPreviewMap";
import { getPathname, getQuery } from "./routing";
import { ProjectRepository } from "../data/projectRepository";
import { authClient, isAuthUser, isNull, uploadAsset, type AuthUser } from "../api/client";
import { Login } from "../components/Login";
import { CatalogRepository, mergeCatalogAssets, type CatalogSource } from "../data/catalogRepository";
import { Plans } from "../components/Plans";
import { Admin } from "../components/Admin";
import { ProfileMenu } from "../components/ProfileMenu";
import { CreatorProfilePage } from '../components/CreatorProfile';
import { PasswordRecovery } from '../components/PasswordRecovery';
import { Friends } from '../components/Friends';
import { createLocalArtworkUrl, readLocalArtwork, releaseLocalArtworkUrls, saveLocalArtwork } from '../data/localArtwork';
import { NotificationCenter } from '../components/NotificationCenter';
import { Chat } from '../components/Chat';
import { navigationLabel, tx } from '../i18n';
import { SellerListingRepository } from '../data/sellerListingRepository';
import type { BeatListingInput } from '../domains/marketplace/sellerListings';
import { MarketplaceReview } from '../components/MarketplaceReview';

const navIcons = { home: HomeIcon, disc: Disc3, library: LibraryIcon, music: Music2, video: Video, users: Users, messages: MessageCircle, store: Store, grid: Grid2X2, sparkles: Sparkles, upload: UploadIcon, chart: ChartNoAxesColumn, settings: Settings, plans: CreditCard, admin: ShieldCheck } as const;
function AuthenticatedApp({ user, logout }: { user?: AuthUser; logout: () => Promise<void> }) {
  const scope = user?.id || 'demo';
  const [projectRepository] = useState(() => new ProjectRepository(undefined, scope));
  const [catalogRepository] = useState(() => new CatalogRepository(undefined, scope));
  const [sellerListingRepository] = useState(() => new SellerListingRepository());
  const [theme, setTheme] = useState<Theme>(() => {
    return user ? readUserSettings(user.id).theme : readStoredTheme(typeof localStorage === "undefined" ? undefined : localStorage);
  });
  const [customTheme, setCustomTheme] = useState(() => user ? readUserSettings(user.id).customTheme : undefined);
  const [language, setLanguage] = useState(() => user ? readUserSettings(user.id).language : 'en');
  useEffect(() => {
    if (!user) { document.documentElement.lang = 'en'; setLanguage('en'); return; }
    const current = readUserSettings(user.id);
    document.documentElement.lang = current.language;
    setLanguage(current.language);
    document.documentElement.classList.toggle('reduce-motion', current.reducedMotion);
    const syncSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; settings?: { theme?: Theme; customTheme?: typeof customTheme; language?: string; reducedMotion?: boolean } }>).detail;
      if (detail?.userId !== user.id || !detail.settings) return;
      if (detail.settings.language) setLanguage(detail.settings.language === 'es' ? 'es' : 'en');
      if (detail.settings.theme) setTheme(detail.settings.theme);
      if (detail.settings.customTheme) setCustomTheme(detail.settings.customTheme);
      if (detail.settings.language) document.documentElement.lang = detail.settings.language;
      document.documentElement.classList.toggle('reduce-motion', detail.settings.reducedMotion === true);
    };
    window.addEventListener('beatvault:settings-changed', syncSettings);
    return () => window.removeEventListener('beatvault:settings-changed', syncSettings);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const current = readUserSettings(user.id);
    setCustomTheme(current.customTheme);
  }, [user]);
  const [activeAsset, setActiveAsset] = useState<AudioAsset>();
  const closePlayer = useCallback(() => setActiveAsset(undefined), []);
  const [locationHash, setLocationHash] = useState(window.location.hash);
  const path = getPathname(locationHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuReturnFocus = useRef<HTMLElement | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[]>(
    () => user ? [] : readLocalProjects(scope).projects,
  );
  const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>(() =>
    user ? [] : readCatalog(scope),
  );
  const [catalogLoading, setCatalogLoading] = useState(Boolean(user));
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("fallback");
  const [catalogError, setCatalogError] = useState<string>();
  const [sessionPreviews, setSessionPreviews] = useState(() => new Map<string, string>());
  const sessionPreviewsRef = useRef(sessionPreviews);
  useEffect(() => {
    sessionPreviewsRef.current = sessionPreviews;
  }, [sessionPreviews]);
  useEffect(() => () => {
    clearSessionPreviews(sessionPreviewsRef.current, URL.revokeObjectURL);
    releaseLocalArtworkUrls(scope);
  }, [scope]);
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    setCatalogLoading(true);
    void catalogRepository.list().then(async result => {
      const assets = await Promise.all(result.assets.map(async asset => {
        const artwork = await readLocalArtwork(scope, asset.id).catch(() => undefined);
        if (!artwork) return asset;
        const cover = createLocalArtworkUrl(scope, artwork);
        return { ...asset, cover };
      }));
      setCatalogAssets(assets);
      setCatalogSource(result.source);
      setCatalogError(result.error);
      setCatalogLoading(false);
    }).catch(error => {
      setCatalogError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.');
      setCatalogLoading(false);
    });
  }, [catalogRepository, scope]);
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    void projectRepository.list().then(result => {
      setLocalProjects(result.projects);
    });
  }, [projectRepository]);
  useEffect(() => {
    const fn = () => {
        setLocationHash(window.location.hash);
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", fn);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("hashchange", fn);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      menuReturnFocus.current?.focus();
      menuReturnFocus.current = null;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>("a, button"));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);
  useEffect(() => {
    const fn = (event: Event) =>
      setActiveAsset((event as CustomEvent<AudioAsset>).detail);
    window.addEventListener("beatvault:preview", fn);
    return () => window.removeEventListener("beatvault:preview", fn);
  }, []);
  const allProjects = localProjects;
  const normalizedGlobalQuery = globalQuery.trim().toLocaleLowerCase();
  const matchingProjects = normalizedGlobalQuery
    ? allProjects.filter((project) =>
        `${project.name} ${project.genre} ${project.key}`
          .toLocaleLowerCase()
          .includes(normalizedGlobalQuery),
      )
    : [];
  const searchableAssets = Array.from(
    new Map([...assets, ...catalogAssets].map((asset) => [asset.id, asset])).values(),
  );
  const matchingAssets = normalizedGlobalQuery
    ? searchableAssets.filter((asset) =>
        `${asset.name} ${asset.type} ${asset.collection ?? ""} ${asset.tags
          .map((tag) => tag.label)
          .join(" ")}`
          .toLocaleLowerCase()
          .includes(normalizedGlobalQuery),
      )
    : [];
  const publishAsset = useCallback(async (asset: CatalogAsset, previewUrl?: string, artwork?: File) => {
    const result = await catalogRepository.create({ ...asset, ownerId: user?.id });
    setCatalogSource(result.source);
    if (!result.asset) { setCatalogError(result.error); return false; }
    let savedAsset = result.asset;
    if (artwork) {
      try {
        await saveLocalArtwork(scope, savedAsset.id, artwork);
        const cover = createLocalArtworkUrl(scope, artwork);
        savedAsset = { ...savedAsset, cover };
      } catch {
        setCatalogError("Audio guardado, pero no se pudo guardar su artwork local.");
      }
    }
    setCatalogAssets(current => mergeCatalogAssets([savedAsset], current));
    if (previewUrl) setSessionPreviews(previews => setSessionPreview(previews, result.asset!.id, previewUrl, URL.revokeObjectURL));
    return result.asset.id;
  }, [catalogRepository, scope, user?.id]);
  const updateCatalogAsset = async (asset: CatalogAsset): Promise<{ error?: string }> => {
    const result = await catalogRepository.update(asset);
    setCatalogSource(result.source);
    if (result.asset) setCatalogAssets((current) => current.map((item) => item.id === asset.id ? result.asset! : item));
    setCatalogError(result.error);
    return { error: result.error };
  };
  const retryCatalogPreview = async (asset: CatalogAsset): Promise<{ asset?: CatalogAsset; error?: string }> => {
    if (!asset.assetId) return { error: "No hay un audio original disponible para procesar." };
    const result = await catalogRepository.retryPreview(asset.assetId);
    setCatalogSource("api");
    if (result.asset) setCatalogAssets(current => current.map(item => item.id === asset.id ? result.asset! : item));
    setCatalogError(result.error);
    return result;
  };
  const deleteCatalogAsset = async (asset: CatalogAsset): Promise<{ error?: string }> => {
    const result = await catalogRepository.remove(asset.id);
    setCatalogSource(result.source);
    if (result.deleted) {
      setCatalogAssets((current) => current.filter((item) => item.id !== asset.id));
      setSessionPreviews((current) => removeSessionPreview(current, asset.id, URL.revokeObjectURL));
    }
    setCatalogError(result.error);
    return { error: result.error };
  };
  const refreshCatalog = useCallback(async () => {
    const result = await catalogRepository.list();
    const hydrated = await Promise.all(result.assets.map(async asset => {
      const artwork = await readLocalArtwork(scope, asset.id).catch(() => undefined);
      if (!artwork) return asset;
      const cover = createLocalArtworkUrl(scope, artwork);
      return { ...asset, cover };
    }));
    setCatalogAssets(hydrated); setCatalogSource(result.source); setCatalogError(result.error);
  }, [catalogRepository, scope]);
  const searchMarketplace = useCallback((filters: Parameters<CatalogRepository['marketplacePage']>[0]) => catalogRepository.marketplacePage(filters), [catalogRepository]);
  const loadBeatListings = useCallback(() => sellerListingRepository.list(), [sellerListingRepository]);
  const saveBeatListing = useCallback((contentId: string, input: BeatListingInput) => sellerListingRepository.save(contentId, input), [sellerListingRepository]);
  return (
      <div className={`app-shell${activeAsset ? " has-player" : ""}`} data-theme={theme} data-language={language} style={theme === 'custom' && customTheme ? customThemeStyle(customTheme) as CSSProperties : undefined}>
      {menuOpen && <button type="button" className="drawer-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside ref={sidebarRef} className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a className="brand" href="#/home">
          <span className="brand-mark">BV</span>
          <span>
            BEAT<span>VAULT</span>
          </span>
        </a>
        <p className="nav-label">{tx('app.workspace')}</p>
        <nav id="primary-navigation" aria-label="Primary navigation">
          {[...nav, ...(user?.role === "admin" ? secondary : [])].map((item) => (
            <a
              className={path === item.path ? "active" : ""}
              href={`#${item.path}`}
              aria-current={path === item.path ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              key={item.path}
            >
              <Icon>{(() => { const NavIcon = navIcons[item.icon]; return <NavIcon size={18} strokeWidth={1.8} />; })()}</Icon>
              {navigationLabel(item.path, item.label)}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage">
            <span>{tx('app.uploads')}</span>
            <strong>
              {ownedUploads(catalogAssets, user?.id).length} <small>{tx('app.audio')}</small>
            </strong>
          </div>
             <p className="status">
              <i /> {catalogSource === "api" ? tx('app.catalogConnected') : tx('app.localMode')}
          </p>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
             onClick={(event) => {
               if (!menuOpen) menuReturnFocus.current = event.currentTarget;
               setMenuOpen((value) => !value);
             }}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
          >
             <Menu size={20} strokeWidth={1.8} />
          </button>
          <a className="mobile-brand" href="#/home">
            <span className="brand-mark">BV</span>
            <b>
              BEAT<span>VAULT</span>
            </b>
          </a>
             <div className="global-search">
              <label className="search" htmlFor="global-search-input">
                <Search size={17} strokeWidth={1.8} aria-hidden="true" />
               <input
                  id="global-search-input"
                  value={globalQuery}
                 onChange={(event) => setGlobalQuery(event.target.value)}
                 placeholder="Search anything..."
                 aria-label="Search Beats and assets"
               />
             </label>
             {normalizedGlobalQuery && (
               <div className="global-search-results" role="list" aria-label="Local search results">
                 {matchingProjects.map((project) => (
                   <a
                      href={`#/beat-detail?id=${encodeURIComponent(project.id)}`}
                     key={`project-${project.id}`}
                     onClick={() => setGlobalQuery("")}
                   >
                     <span className="search-result-kind">Beat</span>
                     <strong>{project.name}</strong>
                     <small>{project.genre} · {project.bpm} BPM</small>
                   </a>
                 ))}
                 {matchingAssets.map((asset) => (
                   <a
                     href={`#/library?search=${encodeURIComponent(asset.name)}`}
                     key={`asset-${asset.id}`}
                     onClick={() => {
                       window.dispatchEvent(
                         new CustomEvent("beatvault:library-search", {
                           detail: asset.name,
                         }),
                       );
                       setGlobalQuery("");
                     }}
                   >
                     <span className="search-result-kind">Asset</span>
                     <strong>{asset.name}</strong>
                     <small>{asset.type} · {asset.collection ?? "BeatVault library"}</small>
                   </a>
                 ))}
                 {!matchingProjects.length && !matchingAssets.length && (
                   <p className="global-search-empty">No local results found.</p>
                 )}
               </div>
             )}
           </div>
           <div className="top-actions">
              <NotificationCenter userId={user?.id} />
             <ProfileMenu user={user} onLogout={logout} />
          </div>
        </header>
        <div className="content">
          {renderPage(path, setActiveAsset, allProjects, catalogAssets, catalogSource, catalogError,
            publishAsset, sessionPreviews, updateCatalogAsset, deleteCatalogAsset, user, refreshCatalog, retryCatalogPreview, searchMarketplace, loadBeatListings, saveBeatListing, catalogLoading)}

        </div>
      </main>
      <AudioPlayer asset={activeAsset} onClose={closePlayer} />

    </div>
  );
}

function renderPage(
  path: string,
  setActiveAsset: (asset: AudioAsset) => void,
  allProjects: Project[],
  catalogAssets: CatalogAsset[],
  catalogSource: CatalogSource,
  catalogError: string | undefined,
  publishAsset: (asset: CatalogAsset, previewUrl?: string, artwork?: File) => Promise<boolean | string>,
  sessionPreviews: ReadonlyMap<string, string>,
  onUpdateCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>,
  onDeleteCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>,
  user?: AuthUser,
  onReviewed?: () => Promise<void>,
  onRetryCatalogPreview?: (asset: CatalogAsset) => Promise<{ asset?: CatalogAsset; error?: string }>,
  onSearchMarketplace?: (filters: Parameters<CatalogRepository['marketplacePage']>[0]) => ReturnType<CatalogRepository['marketplacePage']>,
  onLoadBeatListings?: () => ReturnType<SellerListingRepository['list']>,
  onSaveBeatListing?: (contentId: string, input: BeatListingInput) => ReturnType<SellerListingRepository['save']>,
  catalogLoading = false,
) {
  const uploads = ownedUploads(catalogAssets, user?.id).map(asset => ({
    ...asset, previewUrl: sessionPreviews.get(asset.id) || asset.previewUrl,
  }));
  const feedAssets = catalogAssets.map(asset => ({ ...asset, previewUrl: sessionPreviews.get(asset.id) || asset.previewUrl }));
  if (path === '/profile' || path === '/settings') return <CreatorProfilePage key={window.location.hash} user={user} uploads={catalogAssets.map(asset => ({ ...asset, previewUrl: sessionPreviews.get(asset.id) || asset.previewUrl }))} uploadsLoading={catalogLoading} onPlay={setActiveAsset} editing={path === '/settings'} targetId={path === '/profile' ? getQuery(window.location.hash).get('id') || undefined : undefined} />;
  if (path === '/friends') return <Friends key={user?.id || 'demo'} userId={user?.id} />;
  if (path === '/chat') return <Chat key={user?.id || 'demo'} userId={user?.id} initialPeerId={getQuery(window.location.hash).get('peer') || undefined} />;
  if (path === "/home" || path === "/dashboard" || path === "/")
    return <Home key={user?.id || "demo"} scope={user?.id || "demo"} uploads={feedAssets} onPlay={setActiveAsset} />;
  if (path === "/beats") return <Beats catalogAssets={catalogAssets} onPlay={setActiveAsset} />;
  if (path === "/marketplace" || path === "/store") return <Marketplace catalogAssets={feedAssets} onPlay={setActiveAsset} onSearch={onSearchMarketplace} />;
  if (path === "/library")
    return <Library catalogAssets={catalogAssets} sessionPreviews={sessionPreviews} catalogSource={catalogSource} catalogError={catalogError} onUpdateCatalogAsset={onUpdateCatalogAsset} onDeleteCatalogAsset={onDeleteCatalogAsset} />;
  if (path === "/studio" || path === "/my-uploads")
    return <Studio scope={user?.id || 'demo'} loadError={user ? catalogError : undefined} uploads={uploads} onPlay={setActiveAsset} onUpdate={onUpdateCatalogAsset} onRetryPreview={user ? onRetryCatalogPreview : undefined} onLoadBeatListings={user ? onLoadBeatListings : undefined} onSaveBeatListing={user ? onSaveBeatListing : undefined} />;
  if (path === "/upload") return <Upload scope={user?.id || 'demo'} onPublish={publishAsset} onRemoteUpload={user ? uploadAsset : undefined} />;
  if (path === "/plans" || path === "/subscription") return <Plans />;
  if (path === "/admin") return <Admin onReviewed={onReviewed} />;
  if (path === '/community-review') return user?.role === 'community_manager' || user?.role === 'admin' ? <MarketplaceReview /> : <Placeholder name="Community review" />;
  if (path === "/shorts" || path.startsWith("/shorts?")) {
     const query = getQuery(window.location.hash);
    return <ShortsFeed sharedShortId={query.get("short")} />;
  }
   if (path.startsWith("/beat-detail")) return <BeatDetail projects={allProjects} onPlay={setActiveAsset} />;
  const name =
    modules.find((item) => item.path === path)?.label || "Page not found";
  return <Placeholder name={name} />;
}
function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => { const update = () => setHash(window.location.hash); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const [authState, setAuthState] = useState<"checking" | "offline" | "required" | "authenticated">("checking");
  const [user, setUser] = useState<AuthUser>();
  const [authError, setAuthError] = useState<string>();
  const [authLoading, setAuthLoading] = useState(false);
  useEffect(() => {
    const updateAccount = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isAuthUser(detail)) setUser(detail);
    };
    window.addEventListener('beatvault:account-updated', updateAccount);
    return () => window.removeEventListener('beatvault:account-updated', updateAccount);
  }, []);
  useEffect(() => { void authClient.request("/api/auth/me", { method: "GET" }, isAuthUser).then(result => { if (result.ok) { setUser(result.data); setAuthState("authenticated"); } else if (result.error.code === "UNAUTHORIZED") setAuthState("required"); else setAuthState("offline"); }); }, []);
  const login = async (email: string, password: string) => { setAuthLoading(true); setAuthError(undefined); const result = await authClient.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, isAuthUser); setAuthLoading(false); if (result.ok) { setUser(result.data); setAuthState("authenticated"); } else setAuthError(result.error.message); };
  const register = async (email: string, password: string) => { setAuthLoading(true); setAuthError(undefined); const result = await authClient.request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }, isAuthUser); setAuthLoading(false); if (result.ok) { await login(email, password); } else setAuthError(result.error.message); };
  const logout = async () => {
    const result = await authClient.request("/api/auth/logout", { method: "POST" }, isNull);
    if (!result.ok) throw new Error(result.error.message);
    setUser(undefined); setAuthError(undefined); setAuthState("required");
  };
  const authPath = getPathname(hash);
  if (authPath === '/forgot-password' || authPath === '/password-reset') return <PasswordRecovery mode={authPath === '/forgot-password' ? 'request' : 'reset'} token={getQuery(hash).get('token') || ''} />;
  if (authState === "checking") return <Login loading onSubmit={login} onRegister={register} />;
  const publicProfileId = getPathname(hash) === '/profile' ? getQuery(hash).get('id') : null;
  if ((authState === 'required' || authState === 'offline') && publicProfileId) return <div className="app-shell"><main className="public-producer-view"><div className="public-producer-nav"><a href="#/dashboard">BeatVault</a><a href="#/dashboard">Iniciar sesion</a></div><CreatorProfilePage key={publicProfileId} targetId={publicProfileId} onPlay={() => undefined} /></main></div>;
  if (authState === "required") return <Login loading={authLoading} error={authError} onSubmit={login} onRegister={register} />;
  return <AuthenticatedApp key={user?.id || 'demo'} user={user} logout={logout} />;
}
export { App };
