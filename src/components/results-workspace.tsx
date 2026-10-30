"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BATCH_SETTINGS,
  CONTACT_PURPOSES,
  GRADES,
  INTEREST_AREAS,
  MEETING_INTENTS,
  PROCESSING_STATUSES,
} from "@/lib/criteria";
import { EMPTY_FILTERS, filterRecords, type ResultFilters } from "@/lib/filter";
import { gradeLabel } from "@/lib/grade";
import type { ContactRecord, Grade, ProcessingStatus } from "@/lib/types";
import { DetailPanel } from "@/components/detail-panel";

const GRADE_CLASS: Record<Grade, string> = {
  A: "grade grade-a",
  B: "grade grade-b",
  C: "grade grade-c",
  D: "grade grade-d",
  U: "grade grade-u",
  검토: "grade grade-review",
};

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
  const chips = [
    ...filters.grades.map((grade) => ({
      key: `grade-${grade}`,
      label: gradeLabel(grade),
      remove: () => updateFilters({ ...filters, grades: filters.grades.filter((item) => item !== grade) }),
    })),
    ...filters.interests.map((value) => ({
      key: `interest-${value}`,
      label: value,
      remove: () => updateFilters({ ...filters, interests: filters.interests.filter((item) => item !== value) }),
    })),
    ...filters.purposes.map((value) => ({
      key: `purpose-${value}`,
      label: value,
      remove: () => updateFilters({ ...filters, purposes: filters.purposes.filter((item) => item !== value) }),
    })),
    ...filters.meetings.map((value) => ({
      key: `meeting-${value}`,
      label: value,
      remove: () => updateFilters({ ...filters, meetings: filters.meetings.filter((item) => item !== value) }),
    })),
    ...filters.statuses.map((value) => ({
      key: `status-${value}`,
      label: value,
      remove: () => updateFilters({ ...filters, statuses: filters.statuses.filter((item) => item !== value) }),
    })),
    ...(filters.query.trim()
      ? [{ key: "query", label: `검색 ${filters.query.trim()}`, remove: () => updateFilters({ ...filters, query: "" }) }]
      : []),
  ];

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
    <section className="shell mt-3" aria-labelledby="results-title">
      <h2 id="results-title" className="sr-only">
        제안 대상 검토
      </h2>
      <div className="filter-bar">
        <label className="search text-sm font-medium">
          <span className="sr-only">검색</span>
          <input
            className="field w-full"
            value={filters.query}
            placeholder="접점ID, 고객ID, 업무요구"
            aria-label="검색"
            onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <Popover label={filters.grades.length > 0 ? `후보 등급 ${filters.grades.length}` : "후보 등급"}>
          <CheckGroup
            title="후보 등급"
            options={GRADES.map((grade) => ({ value: grade, label: gradeLabel(grade) }))}
            selected={filters.grades}
            onToggle={(value) => updateFilters({ ...filters, grades: toggleValue(filters.grades, value as Grade) })}
          />
        </Popover>
        <Popover label={filters.interests.length > 0 ? `관심 분야 ${filters.interests.length}` : "관심 분야"}>
          <CheckGroup
            title="관심 분야"
            options={INTEREST_AREAS.map((value) => ({ value, label: value }))}
            selected={filters.interests}
            onToggle={(value) => updateFilters({ ...filters, interests: toggleValue(filters.interests, value) })}
          />
        </Popover>
        <Popover label="추가 필터">
          <div className="space-y-3">
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
          </div>
        </Popover>
        <Popover label="다운로드" align="right">
          <div className="flex flex-col">
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
        </Popover>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="chip" onClick={chip.remove}>
              {chip.label}
              <span aria-hidden="true">×</span>
              <span className="sr-only">해제</span>
            </button>
          ))}
          <button type="button" className="btn-ghost text-sm" onClick={() => updateFilters(EMPTY_FILTERS)}>
            필터 초기화
          </button>
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="select-bar">
          <p className="text-sm font-semibold">선택 {selectedIds.length.toLocaleString("ko-KR")}건</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => onDownload("selected", "csv")}>
              선택 다운로드 CSV
            </button>
            <button type="button" className="btn-secondary" onClick={() => onDownload("selected", "json")}>
              선택 다운로드 JSON
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => addIds(filtered.map((record) => record.contactId))}
              disabled={filtered.length === 0}
            >
              필터 결과 전체 선택
            </button>
            <button type="button" className="btn-secondary" onClick={() => onSelectIds([])}>
              선택 해제
            </button>
          </div>
        </div>
      )}
      <div className={active ? "mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]" : "mt-3"}>
        <div className="table-frame min-w-0">
          {filtered.length === 0 ? (
            <div className="bg-panel px-4 py-8 text-sm">
              <p>필터 조건에 맞는 접점이 없습니다.</p>
              <button type="button" className="btn-secondary mt-3" onClick={() => updateFilters(EMPTY_FILTERS)}>
                필터 초기화
              </button>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="result-table min-w-full">
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
                    <th>고객ID</th>
                    <th>후보 등급</th>
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
                      data-status={record.status}
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
                      <td className="font-semibold">{record.customerId.trim() ? record.customerId : "—"}</td>
                      <td>{record.grade ? <span className={GRADE_CLASS[record.grade]}>{gradeLabel(record.grade)}</span> : <span className="row-status" data-status={record.status}>{record.status}</span>}</td>
                      <td>
                        {record.analysis && record.analysis.interestAreas.length > 0 ? (
                          record.analysis.interestAreas.map((area) => (
                            <span key={area} className="tag">
                              {area}
                            </span>
                          ))
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <p className="clamp-2" title={record.analysis?.workNeed || undefined}>
                          {record.analysis?.workNeed?.trim() ? record.analysis.workNeed : "—"}
                        </p>
                      </td>
                      <td>{record.analysis?.meetingIntent?.trim() ? record.analysis.meetingIntent : "—"}</td>
                      <td>
                        <p className="clamp-2" title={record.selectionReason || undefined}>
                          {record.selectionReason?.trim() ? record.selectionReason : "—"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line bg-panel px-4 py-3 text-sm text-muted">
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

function Popover({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover" ref={ref}>
      <button type="button" className="btn-secondary whitespace-nowrap" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open && (
        <div className={`popover-panel ${align === "right" ? "right" : ""}`} role="group">
          {children}
        </div>
      )}
    </div>
  );
}
