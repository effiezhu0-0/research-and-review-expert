export type SavedProject = {
  id: string;
  taskId: string;
  name: string;
  kind: string;
  stage: string;
  progress: number;
  savedAt: string;
  route: string;
  project: Record<string, unknown>;
};

const storageKey = "design-lab-saved-projects";

export function readSavedProjects(): SavedProject[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCurrentProject(project: SavedProject) {
  const projects = readSavedProjects().filter((item) => item.taskId !== project.taskId);
  window.localStorage.setItem(storageKey, JSON.stringify([project, ...projects]));
}

export function openSavedProject(project: SavedProject) {
  window.localStorage.setItem("design-lab-active-research-task", project.taskId);
  window.localStorage.setItem("design-lab-project-draft", JSON.stringify(project.project));
  window.location.href = project.route || "/projects/strategy";
}
