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
              onClick={() => { if (number <= active) window.location.href = paths[index]; }}
            >
              <i>{number}{number < active && <img src="/check-circle-success.svg" alt="已完成" />}</i>
              <span>{step}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
