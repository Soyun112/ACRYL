"use client";

import { useMemo, useState } from "react";
import {
  BATCH_SETTINGS,
  CONTACT_PURPOSES,
  GRADES,
  INTEREST_AREAS,
  MEETING_INTENTS,
  PROCESSING_STATUSES,
  SORT_NOTE,
} from "@/lib/criteria";
import { EMPTY_FILTERS, filterRecords, type ResultFilters } from "@/lib/filter";
import { gradeLabel } from "@/lib/grade";
import type { ContactRecord, Grade, ProcessingStatus } from "@/lib/types";
import { DetailPanel } from "@/components/detail-panel";

const GRADE_CLASS: Record<Grade, string> = {
  A: "bg-blue-50 text-blue-900 border-blue-200",
  B: "bg-sky-50 text-sky-950 border-sky-200",
  C: "bg-slate-100 text-slate-800 border-slate-200",
  D: "bg-amber-50 text-amber-950 border-amber-200",
  U: "bg-zinc-100 text-zinc-700 border-zinc-200",
  검토: "bg-rose-50 text-rose-900 border-rose-200",
};

export function ResultsWorkspace({
  records,
  columns,
  selectedIds,
  activeId,
  analyzed,
  onSelectIds,
  onOpen,
}: {
  records: ContactRecord[];
  columns: string[];
  selectedIds: string[];
  activeId: string | null;
  analyzed: boolean;
  onSelectIds: (ids: string[]) => void;
  onOpen: (contactId: string) => void;
}) {
  const [filters, setFilters] = useState<ResultFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => filterRecords(records, filters), [records, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / BATCH_SETTINGS.pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * BATCH_SETTINGS.pageSize;
  const visible = filtered.slice(start, start + BATCH_SETTINGS.pageSize);
  const selected = new Set(selectedIds);
  const pageIds = visible.map((record) => record.contactId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const active = records.find((record) => record.contactId === activeId) ?? null;

  function updateFilters(next: ResultFilters) {
    setFilters(next);
    setPage(1);
  }

  function toggleValue<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function addIds(ids: string[]) {
    onSelectIds([...new Set([...selectedIds, ...ids])]);
  }

  function removeIds(ids: string[]) {
    const drop = new Set(ids);
    onSelectIds(selectedIds.filter((id) => !drop.has(id)));
  }

  return (
    <section className="space-y-4" aria-labelledby="results-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="results-title" className="text-base font-semibold">
            대상 검토
          </h2>
          <p className="mt-1 text-sm text-muted">{SORT_NOTE}</p>
        </div>
        <p className="text-sm">선택한 접점 {selectedIds.length.toLocaleString("ko-KR")}건</p>
      </div>
      {!analyzed ? (
        <div className="panel text-sm text-muted">아직 라벨링을 시작하지 않았습니다. 전체 라벨링을 시작하면 결과가 여기에 쌓입니다.</div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
          <form className="panel space-y-4" aria-label="결과 필터">
            <label className="block text-sm font-medium">
              검색
              <input
                className="field mt-1 w-full"
                value={filters.query}
                placeholder="접점ID, 고객ID, 업무요구"
                onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
              />
            </label>
            <CheckGroup
              title="후보 등급"
              options={GRADES.map((grade) => ({ value: grade, label: gradeLabel(grade) }))}
              selected={filters.grades}
              onToggle={(value) => updateFilters({ ...filters, grades: toggleValue(filters.grades, value as Grade) })}
            />
            <CheckGroup
              title="관심분야"
              options={INTEREST_AREAS.map((value) => ({ value, label: value }))}
              selected={filters.interests}
              onToggle={(value) => updateFilters({ ...filters, interests: toggleValue(filters.interests, value) })}
            />
            <CheckGroup
              title="접촉목적"
              options={CONTACT_PURPOSES.map((value) => ({ value, label: value }))}
              selected={filters.purposes}
              onToggle={(value) => updateFilters({ ...filters, purposes: toggleValue(filters.purposes, value) })}
            />
            <CheckGroup
              title="미팅의사"
              options={MEETING_INTENTS.map((value) => ({ value, label: value }))}
              selected={filters.meetings}
              onToggle={(value) => updateFilters({ ...filters, meetings: toggleValue(filters.meetings, value) })}
            />
            <CheckGroup
              title="처리상태"
              options={PROCESSING_STATUSES.map((value) => ({ value, label: value }))}
              selected={filters.statuses}
              onToggle={(value) =>
                updateFilters({ ...filters, statuses: toggleValue(filters.statuses, value as ProcessingStatus) })
              }
            />
            <button type="button" className="btn-secondary w-full" onClick={() => updateFilters(EMPTY_FILTERS)}>
              필터 지우기
            </button>
          </form>
          <div className="panel min-w-0">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => addIds(pageIds)} disabled={pageIds.length === 0}>
                현재 페이지 선택
              </button>
              <button type="button" className="btn-secondary" onClick={() => removeIds(pageIds)} disabled={pageIds.length === 0}>
                현재 페이지 해제
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => addIds(filtered.map((record) => record.contactId))}
                disabled={filtered.length === 0}
              >
                필터 결과 전체 선택
              </button>
              <button type="button" className="btn-secondary" onClick={() => onSelectIds([])} disabled={selectedIds.length === 0}>
                선택 해제
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="mt-4 text-sm text-muted">필터 조건에 맞는 접점이 없습니다.</p>
            ) : (
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">{SORT_NOTE}</caption>
                  <thead className="bg-canvas text-muted">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="현재 페이지 선택"
                          checked={allPageSelected}
                          onChange={() => (allPageSelected ? removeIds(pageIds) : addIds(pageIds))}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">후보 등급</th>
                      <th className="px-3 py-2 font-medium">고객ID</th>
                      <th className="px-3 py-2 font-medium">관심분야</th>
                      <th className="px-3 py-2 font-medium">업무요구</th>
                      <th className="px-3 py-2 font-medium">미팅의사</th>
                      <th className="px-3 py-2 font-medium">선정이유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record) => (
                      <tr
                        key={record.contactId}
                        className={`border-t border-line ${activeId === record.contactId ? "bg-accent-soft" : ""}`}
                        tabIndex={0}
                        aria-selected={activeId === record.contactId}
                        onClick={() => onOpen(record.contactId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") onOpen(record.contactId);
                        }}
                      >
                        <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`접점 ${record.contactId} 선택`}
                            checked={selected.has(record.contactId)}
                            onChange={() =>
                              selected.has(record.contactId)
                                ? removeIds([record.contactId])
                                : addIds([record.contactId])
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          {record.grade ? (
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${GRADE_CLASS[record.grade]}`}>
                              {gradeLabel(record.grade)}
                            </span>
                          ) : (
                            record.status
                          )}
                        </td>
                        <td className="px-3 py-2">{record.customerId || "미입력"}</td>
                        <td className="max-w-40 truncate px-3 py-2" title={record.analysis?.interestAreas.join(", ") ?? ""}>
                          {record.analysis?.interestAreas.join(", ") || "—"}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2" title={record.analysis?.workNeed ?? ""}>
                          {record.analysis?.workNeed || "—"}
                        </td>
                        <td className="px-3 py-2">{record.analysis?.meetingIntent || "—"}</td>
                        <td className="max-w-64 truncate px-3 py-2" title={record.selectionReason ?? ""}>
                          {record.selectionReason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-sm">
              <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                이전
              </button>
              <span>
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                다음
              </button>
            </div>
          </div>
          <DetailPanel
            record={active}
            columns={columns}
            selected={active ? selected.has(active.contactId) : false}
            onToggleSelected={(contactId) =>
              selected.has(contactId) ? removeIds([contactId]) : addIds([contactId])
            }
          />
        </div>
      )}
    </section>
  );
}

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{title}</legend>
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
