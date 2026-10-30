"use client";

import { useEffect, useRef } from "react";
import {
  CRITERIA_VERSION,
  LABEL_EXAMPLES,
  LABEL_GROUPS,
  PRINCIPLES,
  STRUCTURED_OUTPUT_NOTE,
  VALUE_DEFINITIONS,
} from "@/lib/criteria";

export function CriteriaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="criteria-title"
      onClose={onClose}
      className="w-[min(760px,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-0 text-ink shadow-xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="criteria-title" className="text-lg font-semibold">
            분류 기준
          </h2>
          <p className="mt-1 text-sm text-muted">버전 {CRITERIA_VERSION}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="max-h-[70vh] space-y-5 overflow-auto px-5 py-4 text-sm leading-6">
        <p>{STRUCTURED_OUTPUT_NOTE}</p>
        <section>
          <h3 className="font-semibold">공통 원칙</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PRINCIPLES.map((principle) => (
              <li key={principle}>{principle}</li>
            ))}
          </ul>
        </section>
        {LABEL_GROUPS.map((group) => (
          <section key={group.key}>
            <h3 className="font-semibold">{group.title}</h3>
            <p className="mt-1 text-muted">{group.description}</p>
            {group.values.length > 0 && (
              <ul className="mt-2 space-y-1">
                {group.values.map((value) => (
                  <li key={value}>
                    <span className="font-medium">{value}</span>
                    <span className="text-muted"> — {VALUE_DEFINITIONS[value]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section>
          <h3 className="font-semibold">예시</h3>
          <ul className="mt-2 space-y-3">
            {LABEL_EXAMPLES.map((example) => (
              <li key={example.title} className="rounded-md border border-line bg-canvas p-3">
                <p className="font-medium">{example.title}</p>
                <p className="mt-1 text-muted">입력 {JSON.stringify(example.input)}</p>
                <p className="mt-1">판단 {JSON.stringify(example.expected)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </dialog>
  );
}
