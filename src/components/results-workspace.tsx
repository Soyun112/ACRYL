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

export function ResultsWorkspace({
  records,
  columns,
  selectedIds,
  activeId,
  onSelectIds,
  onOpen,
  onDownload,
}: {
  records: ContactRecord[];
  columns: string[];
  selectedIds: string[];
  activeId: string | null;
  onSelectIds: (ids: string[]) => void;
  onOpen: (contactId: string | null) => void;
  onDownload: (scope: "all" | "selected", format: "csv" | "json") => void;
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
    <section aria-labelledby="results-title">
      <div className="border-b border-line bg-panel px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="results-title" className="sr-only">
            제안 대상 검토
          </h2>
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
            <label className="block min-w-56 flex-1 text-sm font-medium">
              검색
              <input
                className="field mt-1 w-full"
                value={filters.query}
                placeholder="접점ID, 고객ID, 업무요구"
                onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
              />
            </label>
            <details className="text-sm">
              <summary className="btn-secondary cursor-pointer">
                후보 등급{filters.grades.length > 0 ? ` ${filters.grades.length}` : ""}
              </summary>
              <div className="mt-2 bg-panel p-3">
                <CheckGroup
                  title="후보 등급"
                  options={GRADES.map((grade) => ({ value: grade, label: gradeLabel(grade) }))}
                  selected={filters.grades}
                  onToggle={(value) => updateFilters({ ...filters, grades: toggleValue(filters.grades, value as Grade) })}
                />
              </div>
            </details>
            <details className="text-sm">
              <summary className="btn-secondary cursor-pointer">
                관심 분야{filters.interests.length > 0 ? ` ${filters.interests.length}` : ""}
              </summary>
              <div className="mt-2 bg-panel p-3">
                <CheckGroup
                  title="관심 분야"
                  options={INTEREST_AREAS.map((value) => ({ value, label: value }))}
                  selected={filters.interests}
                  onToggle={(value) => updateFilters({ ...filters, interests: toggleValue(filters.interests, value) })}
                />
              </div>
            </details>
            <details className="text-sm">
              <summary className="btn-secondary cursor-pointer">추가 필터</summary>
              <div className="mt-2 space-y-3 bg-panel p-3">
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
                <button type="button" className="btn-secondary" onClick={() => updateFilters(EMPTY_FILTERS)}>
                  필터 지우기
                </button>
              </div>
            </details>
          </div>
          <details className="text-sm">
            <summary className="btn-secondary cursor-pointer">다운로드</summary>
            <div className="mt-2 flex flex-col bg-panel p-2">
              <button type="button" className="btn-ghost text-left" onClick={() => onDownload("all", "csv")}>
                전체 결과 CSV
              </button>
              <button type="button" className="btn-ghost text-left" onClick={() => onDownload("all", "json")}>
                전체 결과 JSON
              </button>
              <button
                type="button"
                className="btn-ghost text-left"
                disabled={selectedIds.length === 0}
                onClick={() => onDownload("selected", "csv")}
              >
                선택한 후보 CSV
              </button>
              <button
                type="button"
                className="btn-ghost text-left"
                disabled={selectedIds.length === 0}
                onClick={() => onDownload("selected", "json")}
              >
                선택한 후보 JSON
              </button>
            </div>
          </details>
        </div>
        <p className="mt-3 text-xs text-muted">{SORT_NOTE}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>선택한 접점 {selectedIds.length.toLocaleString("ko-KR")}건</span>
          <button type="button" className="btn-ghost" onClick={() => addIds(pageIds)} disabled={pageIds.length === 0}>
            현재 페이지 선택
          </button>
          <button type="button" className="btn-ghost" onClick={() => removeIds(pageIds)} disabled={pageIds.length === 0}>
            현재 페이지 해제
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => addIds(filtered.map((record) => record.contactId))}
            disabled={filtered.length === 0}
          >
            필터 결과 전체 선택
          </button>
          <button type="button" className="btn-ghost" onClick={() => onSelectIds([])} disabled={selectedIds.length === 0}>
            선택 해제
          </button>
        </div>
      </div>
      <div className={active ? "lg:grid lg:grid-cols-[minmax(0,1fr)_360px]" : ""}>
        <div className="min-w-0 bg-panel">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">필터 조건에 맞는 접점이 없습니다.</p>
          ) : (
            <div className="overflow-auto">
              <table className="data-table min-w-full">
                <caption className="sr-only">{SORT_NOTE}</caption>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="현재 페이지 선택"
                        checked={allPageSelected}
                        onChange={() => (allPageSelected ? removeIds(pageIds) : addIds(pageIds))}
                      />
                    </th>
                    <th>후보 등급</th>
                    <th>고객ID</th>
                    <th>관심 분야</th>
                    <th>업무 요구</th>
                    <th>미팅 의사</th>
                    <th>선정 이유</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => (
                    <tr
                      key={record.contactId}
                      tabIndex={0}
                      aria-selected={activeId === record.contactId}
                      onClick={() => onOpen(record.contactId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onOpen(record.contactId);
                      }}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`접점 ${record.contactId} 선택`}
                          checked={selected.has(record.contactId)}
                          onChange={() =>
                            selected.has(record.contactId) ? removeIds([record.contactId]) : addIds([record.contactId])
                          }
                        />
                      </td>
                      <td>{record.grade ? gradeLabel(record.grade) : record.status}</td>
                      <td>{record.customerId || "미입력"}</td>
                      <td className="max-w-40 truncate" title={record.analysis?.interestAreas.join(", ") ?? ""}>
                        {record.analysis?.interestAreas.join(", ") || "—"}
                      </td>
                      <td className="max-w-56 truncate" title={record.analysis?.workNeed ?? ""}>
                        {record.analysis?.workNeed || "—"}
                      </td>
                      <td>{record.analysis?.meetingIntent || "—"}</td>
                      <td className="max-w-64 truncate" title={record.selectionReason ?? ""}>
                        {record.selectionReason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              이전
            </button>
            <span>
              {currentPage} / {pageCount}
            </span>
            <button type="button" className="btn-secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
              다음
            </button>
          </div>
        </div>
        {active && (
          <DetailPanel
            record={active}
            columns={columns}
            selected={selected.has(active.contactId)}
            onToggleSelected={(contactId) => (selected.has(contactId) ? removeIds([contactId]) : addIds([contactId]))}
            onClose={() => onOpen(null)}
          />
        )}
      </div>
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
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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
