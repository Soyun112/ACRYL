"use client";

import { ANALYSIS_FIELDS, STRUCTURED_OUTPUT_NOTE } from "@/lib/criteria";
import { gradeLabel } from "@/lib/grade";
import type { ContactRecord } from "@/lib/types";

export function DetailPanel({
  record,
  columns,
  selected,
  onToggleSelected,
  onClose,
}: {
  record: ContactRecord;
  columns: string[];
  selected: boolean;
  onToggleSelected: (contactId: string) => void;
  onClose: () => void;
}) {
  const otherColumns = columns.filter(
    (column) => column !== "접점ID" && column !== "고객ID" && !ANALYSIS_FIELDS.includes(column as (typeof ANALYSIS_FIELDS)[number]),
  );

  return (
    <aside className="detail-sheet detail-overlay lg:static lg:max-h-[calc(100vh-80px)] lg:overflow-auto" aria-labelledby="detail-title">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="detail-title" className="text-base font-semibold">
          접점 상세
        </h2>
        <button type="button" className="btn-secondary" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="space-y-6 px-5 py-5 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <Item label="고객ID" value={record.customerId || "미입력"} />
          <Item label="접점ID" value={record.contactId} />
          <Item label="후보 등급" value={record.grade ? gradeLabel(record.grade) : record.status} />
        </dl>
        <section>
          <h3 className="font-semibold">선정 이유</h3>
          <p className="mt-2 whitespace-pre-wrap leading-6">{record.selectionReason || "아직 없습니다."}</p>
        </section>
        <section className="interpret-block">
          <h3 className="font-semibold">AI 해석</h3>
          <dl className="mt-3 space-y-3">
            <Item label="업무 요구" value={record.analysis?.workNeed || "아직 없음"} />
            <Item label="관심 분야" value={record.analysis?.interestAreas.join(", ") || "아직 없음"} />
            <Item label="후속 요청" value={record.analysis?.followUpRequests.join(", ") || "아직 없음"} />
            <Item label="접촉목적" value={record.analysis?.contactPurposes.join(", ") || "아직 없음"} />
            <Item label="검토단계" value={record.analysis?.reviewStages.join(", ") || "아직 없음"} />
            <Item label="미팅의사" value={record.analysis?.meetingIntent || "아직 없음"} />
            <Item label="검토사유" value={record.analysis?.reviewReasons.join(", ") || "아직 없음"} />
          </dl>
        </section>
        <section>
          <h3 className="font-semibold">원본 상담 기록</h3>
          <dl className="source-block mt-3 space-y-3">
            {ANALYSIS_FIELDS.map((field) => (
              <Item key={field} label={field} value={record.source[field] || "빈칸"} />
            ))}
          </dl>
          {otherColumns.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-medium">기타 원본 열</summary>
              <dl className="mt-3 space-y-3">
                {otherColumns.map((column) => (
                  <Item key={column} label={column} value={record.source[column] || "빈칸"} />
                ))}
              </dl>
            </details>
          )}
        </section>
        <section>
          <h3 className="font-semibold">라벨별 판단 근거</h3>
          {record.analysis && record.analysis.evidence.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {record.analysis.evidence.map((item, index) => (
                <li key={`${item.label}-${item.field}-${index}`}>
                  <p className="font-medium">
                    {item.label} · {item.field}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap leading-6">{item.quote}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">인용된 근거가 없습니다.</p>
          )}
        </section>
        <section>
          <h3 className="font-semibold">추가 확인 질문</h3>
          {record.analysis && record.analysis.followUpQuestions.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {record.analysis.followUpQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">추가 질문이 없습니다.</p>
          )}
        </section>
        {record.error && (
          <p role="alert" className="bg-danger-soft px-3 py-2 text-danger">
            {record.error}
          </p>
        )}
        <dl className="space-y-2 border-t border-line pt-4">
          <Item label="처리상태" value={record.status} />
          <Item label="처리방식" value={record.processingMethod ?? "아직 없음"} />
          <Item label="모델" value={record.model ?? "해당 없음"} />
          <Item label="기준 버전" value={record.criteriaVersion} />
        </dl>
        <p className="text-xs leading-5 text-muted">{STRUCTURED_OUTPUT_NOTE}</p>
        <button type="button" className="btn-primary w-full" onClick={() => onToggleSelected(record.contactId)}>
          {selected ? "후보에서 제외" : "제안 후보에 추가"}
        </button>
      </div>
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
