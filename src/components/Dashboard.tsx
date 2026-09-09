import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { stats } from "../data/mock";
import { Button, PageHeader, ProjectCard, StatCard } from "./ui";
import type { Project } from "../types";
import {
  ArrowUpRight,
  Library,
  Plus,
} from "lucide-react";

const announcements = [
  {
    eyebrow: "New in BeatVault",
    title: "Build your next idea around the FL Studio Demo Pack.",
    description: "Four local WAV previews are ready for your next session.",
    action: "Open Library",
    href: "#/library",
    cover: "/assets/demo/hard-808s.png",
    accent: "#35d0ba",
  },
  {
    eyebrow: "Creator discovery",
    title: "Find the sound behind the Short.",
    description: "Explore producer clips, tags, and linked beats in Shorts.",
    action: "Explore Shorts",
    href: "#/shorts",
    cover: "/assets/demo/dark-orchestra.png",
    accent: "#8c7bff",
  },
  {
    eyebrow: "Keep creating",
    title: "Turn a rough idea into a local project.",
    description:
      "Capture the tempo, key, and status before the session moves on.",
    action: "Open Studio",
    href: "#/studio",
    cover: "/assets/demo/chill-lo-fi.png",
    accent: "#e5a85b",
  },
] as const;

function ProjectStatusMessage({ state }: { state: "saved" | "error" }) {
  return (
    <p className={`project-storage-status ${state}`} role="status">
      <i />{" "}
      {state === "saved"
        ? "Projects saved locally in this browser."
        : "Local save unavailable. Projects will remain for this session only."}
    </p>
  );
}
function AnnouncementSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const announcement = announcements[active];
  const move = (direction: number) =>
    setActive(
      (current) =>
        (current + direction + announcements.length) % announcements.length,
    );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => move(1), 6000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);
  return (
    <section
      className="announcement-slider"
      aria-label="BeatVault announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPaused(false);
      }}
    >
      <div
        className="announcement-content"
        style={
          { "--announcement-accent": announcement.accent } as CSSProperties
        }
      >
        <p className="eyebrow">{announcement.eyebrow}</p>
        <h2>{announcement.title}</h2>
        <p>{announcement.description}</p>
        <a className="button" href={announcement.href}>
          {announcement.action} <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div
        className="announcement-art"
        style={{ backgroundImage: `url(${announcement.cover})` }}
        aria-hidden="true"
      />
      <nav className="announcement-controls" aria-label="Announcement navigation">
        <div className="announcement-dots" aria-label="Choose announcement">
          {announcements.map((item, index) => (
            <button
              type="button"
              key={item.title}
              className={active === index ? "active" : ""}
              aria-label={`Announcement ${index + 1}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      </nav>
    </section>
  );
}
export function Dashboard({
  projects,
  localProjects,
  storageState,
  onNew,
  onEdit,
  onDelete,
  editable,
}: {
  projects: Project[];
  localProjects: Project[];
  storageState: "saved" | "error";
  onNew: () => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  editable: (project: Project) => boolean;
}) {
  const focusProject = projects[0];
  return (
    <>
      <PageHeader
        eyebrow="Wednesday, August 26, 2026"
        title="Good morning, Jordan"
        description="Your creative workspace is ready when you are."
        action={<Button onClick={onNew}><Plus size={16} aria-hidden="true" /> New project</Button>}
      />
      <ProjectStatusMessage state={storageState} />
      <AnnouncementSlider />
      <section className="stats-grid">
        {stats.map((s) => (
          <StatCard stat={s} key={s.label} />
        ))}
      </section>
      <section className="dashboard-focus">
        <article className="panel continue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pick up where you left off</p>
              <h2>Continue working</h2>
            </div>
            <span className="focus-mark">●</span>
          </div>
          {focusProject ? <div className="continue-project">
            <div
              className="continue-art"
              style={{
                 background: `linear-gradient(135deg, ${focusProject.color}, #151b20 68%)`,
              }}
            >
               <span>{focusProject.name.slice(0, 2).toUpperCase()}</span>
              <i />
            </div>
            <div className="continue-copy">
               <strong>{focusProject.name}</strong>
              <span>
                 {focusProject.genre} · {focusProject.bpm} BPM · {focusProject.key}
              </span>
              <div className="progress-line">
                <i />
              </div>
              <small>
                Last opened today at 10:42 AM <b>62% complete</b>
              </small>
            </div>
            <a
              className="continue-link"
              href="#/studio"
               aria-label={`Open ${focusProject.name}`}
            >
              Open <span><ArrowUpRight size={16} aria-hidden="true" /></span>
            </a>
          </div> : <p className="empty-state">No projects yet. Start a new project to see it here.</p>}
        </article>
        <article className="panel quick-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Start something</p>
              <h2>Quick actions</h2>
            </div>
          </div>
          <div className="quick-actions">
            <a href="#/studio">
                <span><Plus size={18} aria-hidden="true" /></span>
              <strong>New project</strong>
              <small>Start a fresh idea</small>
            </a>
            <a href="#/library">
                <span><Library size={18} aria-hidden="true" /></span>
              <strong>Browse library</strong>
              <small>Find your next sound</small>
            </a>
          </div>
        </article>
      </section>
      <section className="panel projects-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Keep creating</p>
            <h2>Recent projects</h2>
          </div>
            <a href="#/studio">View all <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <div className="project-grid">
          {projects.slice(0, 3).map((p) => (
            <ProjectCard
              project={p}
              key={p.id}
              onEdit={editable(p) ? () => onEdit(p) : undefined}
              onDelete={editable(p) ? () => onDelete(p) : undefined}
              editable={editable(p)}
            />
          ))}
        </div>
        <div className="project-source-note">
          {localProjects.length ? (
            <span>
              {localProjects.length} local{" "}
              {localProjects.length === 1 ? "project" : "projects"} saved in
              this browser.
            </span>
          ) : (
            <>
              <span>
                Your local workspace is empty. Mock projects are read-only
                references.
              </span>
              <button type="button" className="text-button" onClick={onNew}>
                Create your first project
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
