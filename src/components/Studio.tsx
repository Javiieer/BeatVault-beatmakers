import { useState } from "react";
import { Button, PageHeader, ProjectCard } from "./ui";
import { Filter, Plus, Search } from "lucide-react";
import type { Project, ProjectStatus } from "../types";

const projectStatuses: ProjectStatus[] = [
  "Draft",
  "Working",
  "Demo",
  "Ready",
  "Released",
];

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

export function Studio({
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All statuses" | ProjectStatus>("All statuses");
  const filteredProjects = projects.filter((project) => {
    const searchable = `${project.name} ${project.genre} ${project.key}`.toLocaleLowerCase();
    return (!query.trim() || searchable.includes(query.trim().toLocaleLowerCase())) &&
      (status === "All statuses" || project.status === status);
  });
  return (
    <>
      <PageHeader
        eyebrow="BeatVault Studio"
        title="Your projects"
         description="Pick up where you left off. Local projects are editable; mock references are read-only."
         action={<Button onClick={onNew}><Plus size={16} aria-hidden="true" /> New project</Button>}
      />
      <ProjectStatusMessage state={storageState} />
      <div className="studio-filters">
        <label className="search" htmlFor="studio-search">
           <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search projects</span>
          <input id="studio-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, genres, or keys..." />
        </label>
        <div className="filter-chips" aria-label="Filter projects by status">
          {(["All statuses", ...projectStatuses] as const).map((item) => (
            <button type="button" key={item} className={status === item ? "active" : ""} aria-pressed={status === item} onClick={() => setStatus(item)}>{item}</button>
          ))}
        </div>
      </div>
      <div className="studio-result-summary"><strong>{filteredProjects.length}</strong> of {projects.length} projects · {localProjects.length} local</div>
      {filteredProjects.length ? <div className="studio-grid">
        {filteredProjects.map((p) => (
          <ProjectCard
            project={p}
            key={p.id}
            onEdit={editable(p) ? () => onEdit(p) : undefined}
            onDelete={editable(p) ? () => onDelete(p) : undefined}
            editable={editable(p)}
          />
        ))}
      </div> : <section className="panel empty-state project-empty-state" role="status">
         <Filter size={22} aria-hidden="true" />
        <h2>{projects.length ? "No matching projects" : "Your workspace is empty"}</h2>
        <p>{projects.length ? "Try another search or status, or clear the filters." : "Create a local project to start organizing your next session."}</p>
         {projects.length ? <button type="button" className="button ghost" onClick={() => { setQuery(""); setStatus("All statuses"); }}>Clear filters</button> : <Button onClick={onNew}><Plus size={16} aria-hidden="true" /> New project</Button>}
      </section>}
    </>
  );
}
