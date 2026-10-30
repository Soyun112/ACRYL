"use client";

import { ANALYSIS_FIELDS, STRUCTURED_OUTPUT_NOTE } from "@/lib/criteria";
import { gradeLabel } from "@/lib/grade";
import type { ContactRecord } from "@/lib/types";

export function DetailPanel({
  record,
  columns,
  selected,
  onToggleSelected,
}: {
  record: ContactRecord | null;
  columns: string[];
  selected: boolean;
  onToggleSelected: (contactId: string) => void;
}) {
  if (!record) {
    return (
      <aside className="panel h-fit" aria-live="polite">
        <h2 className="text-base font-semibold">접점 상세</h2>
        <p className="mt-3 text-sm text-muted">행을 선택하면 원문과 근거가 표시됩니다.</p>
      </aside>
    );
  }
  const otherColumns = columns.filter(
    (column) => column !== "접점ID" && column !== "고객ID" && !ANALYSIS_FIELDS.includes(column as (typeof ANALYSIS_FIELDS)[number]),
  );
  return (
    <aside className="panel h-fit" aria-labelledby="detail-title">
      <h2 id="detail-title" className="text-base font-semibold">
        접점 상세
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Item label="접점ID" value={record.contactId} />
        <Item label="고객ID" value={record.customerId || "미입력"} />
        <Item label="후보 등급" value={record.grade ? gradeLabel(record.grade) : "아직 없음"} />
        <Item label="선정이유" value={record.selectionReason || "아직 없음"} />
      </dl>
      <button type="button" className="btn-primary mt-4" onClick={() => onToggleSelected(record.contactId)}>
        {selected ? "제안 후보에서 빼기" : "제안 후보에 추가"}
      </button>
      <section className="mt-5">
        <h3 className="text-sm font-semibold">원본 상담 필드</h3>
        <dl className="mt-2 space-y-2 text-sm">
          {ANALYSIS_FIELDS.map((field) => (
            <Item key={field} label={field} value={record.source[field] || "빈칸"} />
          ))}
        </dl>
      </section>
      {otherColumns.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">기타 원본 열</summary>
          <dl className="mt-2 space-y-2">
            {otherColumns.map((column) => (
              <Item key={column} label={column} value={record.source[column] || "빈칸"} />
            ))}
          </dl>
        </details>
      )}
      <section className="mt-5">
        <h3 className="text-sm font-semibold">AI 라벨</h3>
        {record.analysis ? (
          <dl className="mt-2 space-y-2 text-sm">
            <Item label="접촉목적" value={record.analysis.contactPurposes.join(", ")} />
            <Item label="관심분야" value={record.analysis.interestAreas.join(", ")} />
            <Item label="업무요구" value={record.analysis.workNeed} />
            <Item label="검토단계" value={record.analysis.reviewStages.join(", ")} />
            <Item label="후속요청" value={record.analysis.followUpRequests.join(", ")} />
            <Item label="미팅의사" value={record.analysis.meetingIntent} />
            <Item label="검토사유" value={record.analysis.reviewReasons.join(", ")} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">저장된 라벨이 없습니다.</p>
        )}
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold">근거 인용</h3>
        {record.analysis && record.analysis.evidence.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {record.analysis.evidence.map((item, index) => (
              <li key={`${item.label}-${item.field}-${index}`} className="rounded-md border border-line bg-canvas p-3 text-sm">
                <p className="font-medium">
                  {item.label} · {item.field}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{item.quote}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">인용된 근거가 없습니다.</p>
        )}
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold">추가 확인 질문</h3>
        {record.analysis && record.analysis.followUpQuestions.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {record.analysis.followUpQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">추가 질문이 없습니다.</p>
        )}
      </section>
      {record.error && (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {record.error}
        </p>
      )}
      <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
        <Item label="처리상태" value={record.status} />
        <Item label="처리방식" value={record.processingMethod ?? "아직 없음"} />
        <Item label="모델" value={record.model ?? "해당 없음"} />
        <Item label="기준 버전" value={record.criteriaVersion} />
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted">{STRUCTURED_OUTPUT_NOTE}</p>
    </aside>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
