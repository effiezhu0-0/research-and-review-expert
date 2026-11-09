"use client";

type FlowProgressProps = { active: 1 | 2 | 3 };

const steps = ["项目需求", "案例与反馈", "归因结论"];
const paths = ["/projects/new", "/projects/research", "/projects/strategy"];

export default function FlowProgress({ active }: FlowProgressProps) {
  return (
    <ol className="flow-progress" aria-label="项目进度">
      {steps.map((step, index) => {
        const number = index + 1;
        return (
          <li className={number < active ? "done" : number === active ? "active" : ""} key={step}>
            <button
              type="button"
              disabled={number > active}
              onClick={() => {
                if (number > active) return;
                window.location.href = number === 1 ? `/projects/new?from=flow&t=${Date.now()}` : paths[index];
              }}
            >
              <i>{number < active ? <img src="/icons/step-complete.svg" alt="已完成" /> : number}</i>
              <span>{step}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
