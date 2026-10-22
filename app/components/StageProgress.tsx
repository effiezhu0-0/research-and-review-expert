"use client";

export default function StageProgress({ steps, active }: { steps: string[]; active: number }) {
  return <ol className="flow-progress stage-progress" aria-label="当前阶段进度">{steps.map((step, index) => { const number = index + 1; return <li className={number < active ? "done" : number === active ? "active" : ""} key={step}><div><i>{number}{number < active && <img src="/check-circle-success.svg" alt="已完成" />}</i><span>{step}</span></div></li>; })}</ol>;
}
