import { useEffect, useRef, useState } from "react";
import { Bell, ChartNoAxesColumn, ChevronDown, Check, Disc3, Grid2X2, Home, Library as LibraryIcon, Menu, Music2, Search, Settings, Sparkles, Store, Upload as UploadIcon, Users, Video, CreditCard, ShieldCheck } from "lucide-react";
import { assets } from "../data/mock";
import {
  AudioPlayer,
  Badge,
  Icon,
} from "../components/ui";
import { Dashboard } from "../components/Dashboard";
import { ShortsFeed } from "../components/ShortsFeed";
import { Upload } from "../components/Upload";
import {
  readCatalog,
  type CatalogAsset,
} from "../data/localCatalog";
import {
  readLocalProjects,
  writeLocalProjects,
} from "../data/localProjects";
import type { AudioAsset, Project } from "../types";
import { Placeholder } from "../components/Placeholder";
import { nav, secondary } from "./navigation";
import { ProjectModal as ProjectModalComponent } from "../components/ProjectModal";
import { Studio } from "../components/Studio";
import { Beats, BeatDetail } from "../components/Beats";
import { Library } from "../components/Library";
import "../styles/app.css";
import "../styles/themes.css";
import "../styles/scrollbars.css";
import { readStoredTheme, themeStorageKey, type Theme } from "./theme";
import { clearSessionPreviews, removeSessionPreview, setSessionPreview } from "../data/sessionPreviewMap";
import { getPathname, getQuery } from "./routing";
import { ProjectRepository, type ProjectSource } from "../data/projectRepository";
import { authClient, isAuthUser, isNull, type AuthUser } from "../api/client";
import { Login } from "../components/Login";
import { CatalogRepository, mergeCatalogAssets, type CatalogSource } from "../data/catalogRepository";
import { Plans } from "../components/Plans";
import { Admin } from "../components/Admin";

const projectRepository = new ProjectRepository();
const catalogRepository = new CatalogRepository();

const navIcons = { home: Home, disc: Disc3, library: LibraryIcon, music: Music2, video: Video, users: Users, store: Store, grid: Grid2X2, sparkles: Sparkles, upload: UploadIcon, chart: ChartNoAxesColumn, settings: Settings, plans: CreditCard, admin: ShieldCheck } as const;
const themes: ReadonlyArray<[Theme, string, string]> = [
  ["classic", "Classic", "Cyan / slate"],
  ["ember", "Ember Forge", "Flame / charcoal"],
  ["ivory", "Ivory Studio", "Warm white / premium"],
  ["verdant", "Verdant Signal", "Technical green / black"],
];
function AuthenticatedApp({ user, logout }: { user?: AuthUser; logout: () => void }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return readStoredTheme(typeof localStorage === "undefined" ? undefined : localStorage);
  });
  const [activeAsset, setActiveAsset] = useState<AudioAsset>();
  const [path, setPath] = useState(
    getPathname(window.location.hash),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuReturnFocus = useRef<HTMLElement | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[]>(
    () => readLocalProjects().projects,
  );
  const [projectStorageState, setProjectStorageState] = useState<"saved" | "error">(() => (readLocalProjects().error ? "error" : "saved"));
  const [projectSource, setProjectSource] = useState<ProjectSource>("fallback");
  const [projectModal, setProjectModal] = useState<{
    project?: Project;
  } | null>(null);
  const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>(() =>
    readCatalog(),
  );
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("fallback");
  const [catalogError, setCatalogError] = useState<string>();
  const [sessionPreviews, setSessionPreviews] = useState(() => new Map<string, string>());
  const sessionPreviewsRef = useRef(sessionPreviews);
  useEffect(() => {
    sessionPreviewsRef.current = sessionPreviews;
  }, [sessionPreviews]);
  useEffect(() => () => {
    clearSessionPreviews(sessionPreviewsRef.current, URL.revokeObjectURL);
  }, []);
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    void catalogRepository.list().then(result => {
      setCatalogAssets(result.assets);
      setCatalogSource(result.source);
      setCatalogError(result.error);
    });
  }, []);
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    void projectRepository.list().then(result => {
      setLocalProjects(result.projects);
      setProjectSource(result.source);
    });
  }, []);
  useEffect(() => {
    const fn = () => {
        setPath(getPathname(window.location.hash));
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
  const saveProjects = (next: Project[]) => {
    setLocalProjects(next);
    const saved = writeLocalProjects(next);
    setProjectStorageState(saved ? "saved" : "error");
    return saved;
  };
  const editProject = (project: Project) => setProjectModal({ project });
  const deleteProject = (project: Project) => {
    if (window.confirm(`Delete ${project.name}?`)) void projectRepository.delete(project).then(result => {
      setProjectSource(result.source); if (result.deleted) saveProjects(localProjects.filter((item) => item.id !== project.id));
      if (result.error) setProjectStorageState("error");
    });
  };
  const publishAsset = (asset: CatalogAsset, previewUrl?: string) => {
    void catalogRepository.create(asset).then((result) => {
      if (!result.asset) { if (previewUrl) URL.revokeObjectURL(previewUrl); return; }
      setCatalogAssets((current) => mergeCatalogAssets([result.asset!], current));
      if (previewUrl) setSessionPreviews((previews) => setSessionPreview(previews, result.asset!.id, previewUrl, URL.revokeObjectURL));
    });
    window.location.hash = "#/library";
    return true;
  };
  const updateCatalogAsset = async (asset: CatalogAsset): Promise<{ error?: string }> => {
    const result = await catalogRepository.update(asset);
    setCatalogSource(result.source);
    if (result.asset) setCatalogAssets((current) => current.map((item) => item.id === asset.id ? result.asset! : item));
    setCatalogError(result.error);
    return { error: result.error };
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
  return (
    <div className="app-shell" data-theme={theme}>
      {menuOpen && <button type="button" className="drawer-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside ref={sidebarRef} className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a className="brand" href="#/dashboard">
          <span className="brand-mark">BV</span>
          <span>
            BEAT<span>VAULT</span>
          </span>
        </a>
        <p className="nav-label">Workspace</p>
        <nav id="primary-navigation" aria-label="Primary navigation">
          {[...nav, ...secondary].map((item) => (
            <a
              className={path === item.path ? "active" : ""}
              href={`#${item.path}`}
              aria-current={path === item.path ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              key={item.path}
            >
              <Icon>{(() => { const NavIcon = navIcons[item.icon]; return <NavIcon size={18} strokeWidth={1.8} />; })()}</Icon>
              {item.label}
              {["/community", "/marketplace"].includes(item.path) && (
                <Badge>Soon</Badge>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage">
            <span>Local library</span>
            <strong>
              68.4 GB <small>/ 128 GB</small>
            </strong>
            <div className="storage-bar">
              <i />
            </div>
          </div>
             <p className="status">
              <i /> {projectSource === "api" ? "Projects from local API" : projectStorageState === "saved" ? "Projects saved locally" : "Project storage unavailable"}
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
          <a className="mobile-brand" href="#/dashboard">
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
               <details className="theme-picker">
                   <summary aria-label="Choose color theme"><i className={`theme-swatch ${theme}`} /><span className="theme-current">{themes.find(([value]) => value === theme)?.[1]}</span><ChevronDown size={15} aria-hidden="true" /></summary>
                  <div className="theme-options" role="menu" aria-label="Color themes">
                     {themes.map(([value, label, description]) => <button type="button" role="menuitemradio" aria-checked={theme === value} className={theme === value ? "selected" : ""} onClick={(event) => { setTheme(value); try { localStorage.setItem(themeStorageKey, value); } catch { /* storage may be blocked */ } event.currentTarget.closest("details")?.removeAttribute("open"); }} key={value}><i className={`theme-swatch ${value}`} /><span><strong>{label}</strong><small>{description}</small></span>{theme === value && <Check size={16} aria-hidden="true" />}</button>)}
                </div>
              </details>
              <button type="button" className="icon-button" aria-label="Notifications">
               <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
             <button type="button" className="profile" onClick={user ? logout : undefined} aria-label={user ? "Log out" : "Local demo mode"}>
               <span className="avatar">{user ? user.email.slice(0, 2).toUpperCase() : "DL"}</span>
               <span>{user ? user.email : "Demo local"}</span>
               </button>
          </div>
        </header>
        <div className="content">
          {renderPage(
            path,
             setActiveAsset,
            allProjects,
            localProjects,
            projectStorageState,
            setProjectModal,
            editProject,
            deleteProject,
           catalogAssets,
           catalogSource,
           catalogError,
             publishAsset,
              sessionPreviews,
              updateCatalogAsset,
              deleteCatalogAsset,
          )}
        </div>
      </main>
      <AudioPlayer asset={activeAsset} />
      {projectModal && (
        <ProjectModalComponent
          project={projectModal.project}
          onClose={() => setProjectModal(null)}
            onSave={(project) => {
              if (projectModal.project) {
               void projectRepository.update(project).then(result => {
                 setProjectSource(result.source); if (result.project) saveProjects(localProjects.map((item) => item.id === project.id ? result.project! : item));
                 if (!result.error) setProjectModal(null); else setProjectStorageState("error");
               });
               return;
             }
            void projectRepository.create(project).then(result => {
               saveProjects([result.project, ...localProjects.filter(item => item.id !== result.project.id)]);
               setProjectSource(result.source);
               if (result.error) setProjectStorageState("error");
              setProjectModal(null);
            });
          }}
        />
      )}
    </div>
  );
}

function renderPage(
  path: string,
  setActiveAsset: (asset: AudioAsset) => void,
  allProjects: Project[],
  localProjects: Project[],
  storageState: "saved" | "error",
  setProjectModal: (value: { project?: Project } | null) => void,
  onEdit: (project: Project) => void,
  onDelete: (project: Project) => void,
  catalogAssets: CatalogAsset[],
  catalogSource: CatalogSource,
  catalogError: string | undefined,
  publishAsset: (asset: CatalogAsset) => boolean,
  sessionPreviews: ReadonlyMap<string, string>,
  onUpdateCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>,
  onDeleteCatalogAsset: (asset: CatalogAsset) => Promise<{ error?: string }>,
) {
  const editable = (project: Project) =>
    localProjects.some((item) => item.id === project.id);
  if (path === "/dashboard" || path === "/")
    return (
      <Dashboard
        projects={allProjects}
        localProjects={localProjects}
        storageState={storageState}
        onNew={() => setProjectModal({})}
        onEdit={onEdit}
        onDelete={onDelete}
        editable={editable}
      />
    );
    if (path === "/beats")
      return <Beats projects={allProjects} onPlay={setActiveAsset} />;
   if (path === "/library")
     return <Library catalogAssets={catalogAssets} sessionPreviews={sessionPreviews} catalogSource={catalogSource} catalogError={catalogError} onUpdateCatalogAsset={onUpdateCatalogAsset} onDeleteCatalogAsset={onDeleteCatalogAsset} />;
  if (path === "/studio")
    return (
      <Studio
        projects={allProjects}
        localProjects={localProjects}
        storageState={storageState}
        onNew={() => setProjectModal({})}
        onEdit={onEdit}
        onDelete={onDelete}
        editable={editable}
      />
    );
   if (path === "/upload") return <Upload onPublish={publishAsset} />;
  if (path === "/plans" || path === "/subscription") return <Plans />;
  if (path === "/admin") return <Admin />;
  if (path === "/shorts" || path.startsWith("/shorts?")) {
     const query = getQuery(window.location.hash);
    return <ShortsFeed sharedShortId={query.get("short")} />;
  }
   if (path.startsWith("/beat-detail")) return <BeatDetail projects={allProjects} onPlay={setActiveAsset} />;
  const name =
    (nav.find((x) => x.path === path) || secondary.find((x) => x.path === path))
      ?.label || "Dashboard";
  return <Placeholder name={name} />;
}
function App() {
  const [authState, setAuthState] = useState<"checking" | "offline" | "required" | "authenticated">("checking");
  const [user, setUser] = useState<AuthUser>();
  const [authError, setAuthError] = useState<string>();
  const [authLoading, setAuthLoading] = useState(false);
  useEffect(() => { void authClient.request("/api/auth/me", { method: "GET" }, isAuthUser).then(result => { if (result.ok) { setUser(result.data); setAuthState("authenticated"); } else if (result.error.code === "UNAUTHORIZED") setAuthState("required"); else setAuthState("offline"); }); }, []);
  const login = async (email: string, password: string) => { setAuthLoading(true); setAuthError(undefined); const result = await authClient.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, isAuthUser); setAuthLoading(false); if (result.ok) { setUser(result.data); setAuthState("authenticated"); } else setAuthError(result.error.message); };
  const logout = () => { void authClient.request("/api/auth/logout", { method: "POST" }, isNull).then(() => { setUser(undefined); setAuthState("required"); }); };
  if (authState === "checking") return <Login loading onSubmit={login} />;
  if (authState === "required") return <Login loading={authLoading} error={authError} onSubmit={login} />;
  return <AuthenticatedApp user={user} logout={logout} />;
}
export { App };
