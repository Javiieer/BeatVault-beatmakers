import type { Project } from "../types";
import { ApiClient, isProjectRecord, isProjectRecordList } from "../api/client";
import { readLocalProjects, writeLocalProjects } from "./localProjects";

export type ProjectSource = "api" | "fallback";
export type ProjectResult = { projects: Project[]; source: ProjectSource; error?: string };
export type ProjectMutationResult = { project?: Project; deleted?: boolean; source: ProjectSource; error?: string };
const statusMap = { draft: "Draft", working: "Working", demo: "Demo", ready: "Ready", released: "Released" } as const;
const fromRecord = (record: { id: string; title: string; status: keyof typeof statusMap; updatedAt: string }): Project => ({ id: record.id, name: record.title, genre: "Unspecified", bpm: 120, key: "C minor", modified: record.updatedAt, status: statusMap[record.status], color: "#35d0ba", tracks: 0 });

export class ProjectRepository {
  constructor(private readonly api = new ApiClient()) {}
  async list(): Promise<ProjectResult> {
    const result = await this.api.request("/api/projects", { method: "GET" }, isProjectRecordList);
    if (result.ok) {
      const local = readLocalProjects().projects;
      const remote = result.data.map(fromRecord);
      return { projects: [...remote, ...local.filter(item => !remote.some(remoteItem => remoteItem.id === item.id))], source: "api" };
    }
    const local = readLocalProjects();
    return { projects: local.projects, source: "fallback", error: result.error.message };
  }
  async create(project: Project): Promise<{ project: Project; source: ProjectSource; error?: string }> {
    const result = await this.api.request("/api/projects", { method: "POST", body: JSON.stringify({ title: project.name, contentType: "beat" }) }, isProjectRecord);
    if (result.ok) {
      const created = fromRecord(result.data);
      writeLocalProjects([created, ...readLocalProjects().projects]);
      return { project: created, source: "api" };
    }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { project, source: "api", error: result.error.message };
    return { project, source: "fallback", error: result.error.message };
  }
  async update(project: Project): Promise<ProjectMutationResult> {
    const status = project.status.toLowerCase() as "draft" | "working" | "demo" | "ready" | "released";
    const result = await this.api.request(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PUT", body: JSON.stringify({ title: project.name, status }) }, isProjectRecord);
    if (result.ok) { const updated = fromRecord(result.data); writeLocalProjects([updated, ...readLocalProjects().projects.filter(item => item.id !== updated.id)]); return { project: updated, source: "api" }; }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { source: "api", error: result.error.message };
    return { project, source: writeLocalProjects([project, ...readLocalProjects().projects.filter(item => item.id !== project.id)]) ? "fallback" : "fallback", error: result.error.message };
  }
  async delete(project: Project): Promise<ProjectMutationResult> {
    const result = await this.api.request(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" }, (value): value is { id: string } => Boolean(value && typeof value === "object" && (value as { id?: unknown }).id === project.id));
    if (result.ok) { writeLocalProjects(readLocalProjects().projects.filter(item => item.id !== project.id)); return { deleted: true, source: "api" }; }
    if (result.error.code !== "NETWORK_ERROR" && result.error.code !== "TIMEOUT") return { source: "api", error: result.error.message };
    writeLocalProjects(readLocalProjects().projects.filter(item => item.id !== project.id)); return { deleted: true, source: "fallback", error: result.error.message };
  }
}
