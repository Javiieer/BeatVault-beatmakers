import type { Project, ProjectStatus } from "../types";

const projectsKey = "beatvault:local-projects";

function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    value === "Draft" ||
    value === "Working" ||
    value === "Demo" ||
    value === "Ready" ||
    value === "Released"
  );
}

export function isLocalProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.genre === "string" &&
    typeof project.bpm === "number" &&
    Number.isFinite(project.bpm) &&
    project.bpm >= 40 &&
    project.bpm <= 240 &&
    typeof project.key === "string" &&
    typeof project.modified === "string" &&
    isProjectStatus(project.status) &&
    typeof project.color === "string" &&
    typeof project.tracks === "number" &&
    Number.isFinite(project.tracks) &&
    project.tracks >= 0
  );
}

export function readLocalProjects(): { projects: Project[]; error: boolean } {
  try {
    if (typeof localStorage === "undefined")
      return { projects: [], error: true };
    const raw = localStorage.getItem(projectsKey);
    if (!raw) return { projects: [], error: false };
    const value: unknown = JSON.parse(raw);
    return {
      projects: Array.isArray(value) ? value.filter(isLocalProject) : [],
      error: false,
    };
  } catch {
    return { projects: [], error: true };
  }
}

export function writeLocalProjects(value: Project[]) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(projectsKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
