"use client";

export type MeetingContext = {
  link?: string;
  fileName?: string;
  extractedText?: string;
  pageCount?: number;
  keyPoints?: string[];
};

const maxPages = 30;
const maxCharacters = 12000;

export async function extractMeetingPdf(file: File): Promise<MeetingContext> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("请上传 PDF 格式的会议纪要或项目 PRD");
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = Math.min(document.numPages, maxPages);
  const pageCount = document.numPages;
  const sections: string[] = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => "str" in item ? item.str : "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) sections.push(text);
    if (sections.join("\n").length >= maxCharacters) break;
  }
  await document.cleanup?.();
  const extractedText = sections.join("\n").slice(0, maxCharacters);
  if (!extractedText) throw new Error("未能从该 PDF 读取文字，请改为粘贴项目背景链接");
  return { fileName: file.name, extractedText, pageCount };
}
