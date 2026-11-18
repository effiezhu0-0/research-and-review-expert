export type SavedProject = {
  id: string;
  taskId: string;
  taskIds?: string[];
  name: string;
  kind: string;
  stage: string;
  manualStage?: string;
  progress: number;
  savedAt: string;
  route: string;
  project: Record<string, unknown>;
};

const storageKey = "design-lab-saved-projects";
const legacyProjectCleanupKey = "design-lab-joy-travel-project-removed";

export function readSavedProjects(): SavedProject[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const projects = Array.isArray(value) ? value as SavedProject[] : [];
    if (window.localStorage.getItem(legacyProjectCleanupKey) !== "1") {
      const remaining = projects.filter((project) => project.name !== "JOY游记");
      window.localStorage.setItem(storageKey, JSON.stringify(remaining));
      window.localStorage.setItem(legacyProjectCleanupKey, "1");
      return remaining;
    }
    return projects;
  } catch {
    return [];
  }
}

export function saveCurrentProject(project: SavedProject) {
  const existing = readSavedProjects();
  const previous = existing.find((item) => item.id === project.id)
    || existing.find((item) => item.taskId === project.taskId || item.taskIds?.includes(project.taskId));
  const manualStage = previous?.manualStage;
  const taskIds = [...new Set([...(previous?.taskIds || []), previous?.taskId, ...(project.taskIds || []), project.taskId].filter((id): id is string => Boolean(id)))];
  const projects = existing.filter((item) => item.id !== project.id && item.taskId !== project.taskId && !item.taskIds?.includes(project.taskId));
  window.localStorage.setItem(storageKey, JSON.stringify([{ ...previous, ...project, taskIds, ...(manualStage ? { stage: manualStage, manualStage } : {}) }, ...projects]));
}

export function updateProjectStage(id: string, stage: string) {
  const projects = readSavedProjects();
  window.localStorage.setItem(storageKey, JSON.stringify(projects.map((project) => project.id === id ? { ...project, stage, manualStage: stage } : project)));
}

export function renameSavedProject(id: string, name: string) {
  const projects = readSavedProjects();
  const updated = projects.map((project) => project.id === id
    ? { ...project, name, project: { ...project.project, projectName: name } }
    : project);
  window.localStorage.setItem(storageKey, JSON.stringify(updated));
  const currentId = window.localStorage.getItem("design-lab-current-project-id");
  if (currentId === id) {
    const current = updated.find((project) => project.id === id);
    if (current) window.localStorage.setItem("design-lab-project-draft", JSON.stringify(current.project));
  }
  window.dispatchEvent(new Event("design-lab-projects-updated"));
}

export function deleteSavedProject(id: string) {
  const projects = readSavedProjects();
  window.localStorage.setItem(storageKey, JSON.stringify(projects.filter((project) => project.id !== id)));
  if (window.localStorage.getItem("design-lab-current-project-id") === id) {
    window.localStorage.removeItem("design-lab-current-project-id");
    window.localStorage.removeItem("design-lab-active-research-task");
    window.localStorage.removeItem("design-lab-project-draft");
  }
  window.dispatchEvent(new Event("design-lab-projects-updated"));
}

export function openSavedProject(project: SavedProject) {
  window.localStorage.setItem("design-lab-active-research-task", project.taskId);
  window.localStorage.setItem("design-lab-current-project-id", project.id);
  window.localStorage.setItem("design-lab-project-draft", JSON.stringify(project.project));
  window.location.href = `/projects/overview?projectId=${encodeURIComponent(project.id)}`;
}
