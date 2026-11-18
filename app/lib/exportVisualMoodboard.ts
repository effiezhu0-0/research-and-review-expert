export type MoodboardSample = {
  id: string;
  taskId?: string;
  projectTitle: string;
  projectUrl: string;
  platform: string;
  publishedAt?: string;
  analysisReason?: string;
  visualFeatures?: string[];
};

export type MoodboardGroup = {
  title: string;
  samples: MoodboardSample[];
};

function escapeHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character] || character);
}

function fileSafeName(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/[. ]+$/g, "") || "未命名项目";
}

async function imageData(taskId: string, sampleId: string) {
  const response = await fetch(`/api/research/tasks/${encodeURIComponent(taskId)}/visual-samples/${encodeURIComponent(sampleId)}/image`, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("图片不可用");
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export async function downloadVisualMoodboard(projectName: string, groups: MoodboardGroup[]) {
  const boardName = `${projectName.trim() || "未命名项目"}视觉情绪板`;
  let unavailableImages = 0;
  const htmlGroups = await Promise.all(groups.map(async (group, index) => {
    const cards = await mapWithConcurrency(group.samples, 3, async (sample) => {
      let image = "";
      if (sample.taskId) {
        try { image = await imageData(sample.taskId, sample.id); } catch { unavailableImages += 1; }
      } else unavailableImages += 1;
      const sourceUrl = /^https?:\/\//i.test(sample.projectUrl) ? sample.projectUrl : "#";
      const preview = image
        ? `<img src="${image}" alt="${escapeHtml(sample.projectTitle)}">`
        : `<div class="image-missing">图片暂不可用</div>`;
      const description = sample.analysisReason || sample.visualFeatures?.join("、") || "";
      return `<article>${preview}<h3>${escapeHtml(sample.projectTitle)}</h3><p>${escapeHtml(sample.platform)}${sample.publishedAt ? ` · ${escapeHtml(sample.publishedAt.slice(0, 10))}` : ""}</p>${description ? `<p>${escapeHtml(description)}</p>` : ""}<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源</a></article>`;
    });
    return `<section><p class="eyebrow">视觉方向 ${String(index + 1).padStart(2, "0")}</p><h2>${escapeHtml(group.title)}</h2><div class="grid">${cards.join("")}</div></section>`;
  }));
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(boardName)}</title><style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#f7f6f4;color:#191817;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1440px;margin:auto}header{margin-bottom:32px}header p,.eyebrow{color:#77716c}.eyebrow{font-size:13px;font-weight:600;letter-spacing:.06em;margin:0 0 8px}section{margin:28px 0;padding:24px;background:#fff;border:0;border-radius:12px}h1{font-size:28px}h2{font-size:22px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}article{min-width:0}article img,.image-missing{display:grid;width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;background:#efedea}.image-missing{place-items:center;color:#77716c}article h3{font-size:16px;line-height:1.4;margin:12px 0 6px}article p{color:#77716c;line-height:1.5;margin:6px 0}a{color:#6e48c7}@media(max-width:600px){body{padding:20px}section{padding:16px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}</style></head><body><main><header><h1>${escapeHtml(boardName)}</h1><p>导出时间：${new Date().toLocaleString("zh-CN")}</p></header>${htmlGroups.join("")}</main></body></html>`;
  const file = new Blob([html], { type: "text/html;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `${fileSafeName(boardName)}.html`;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
  return { unavailableImages };
}
