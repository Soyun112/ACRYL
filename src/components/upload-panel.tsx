"use client";

import { useRef, useState } from "react";
import type { ParsedCsv } from "@/lib/csv";

export function UploadPanel({
  fileName,
  parsed,
  encodingError,
  disabled,
  onFile,
  onOpenCriteria,
}: {
  fileName: string | null;
  parsed: ParsedCsv | null;
  encodingError: string | null;
  disabled: boolean;
  onFile: (file: File) => void;
  onOpenCriteria: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(file: File | undefined) {
    if (!file || disabled) return;
    onFile(file);
  }

  return (
    <section className="panel" aria-labelledby="upload-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="upload-title" className="text-base font-semibold">
          파일 업로드
        </h2>
        <button type="button" className="btn-secondary" onClick={onOpenCriteria}>
          라벨링 기준 보기
        </button>
      </div>
      <div
        className={`mt-4 rounded-lg border border-dashed px-4 py-8 text-center ${dragOver ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          pick(event.dataTransfer.files[0]);
        }}
      >
        <p className="text-sm text-muted">UTF-8 CSV 파일을 끌어다 놓거나 선택하세요.</p>
        <button type="button" className="btn-primary mt-3" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {fileName ? "파일 변경" : "파일 선택"}
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV 파일 선택"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {encodingError && (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {encodingError}
        </p>
      )}
      {parsed && (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="파일명" value={fileName ?? "이름 없음"} />
            <Stat label="전체 유효 접점" value={`${parsed.dataRowCount.toLocaleString("ko-KR")}건`} />
            <Stat label="고유 고객" value={`${parsed.uniqueCustomerCount.toLocaleString("ko-KR")}명`} />
          </dl>
          {parsed.blockReason && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {parsed.blockReason}
            </p>
          )}
          {parsed.missingColumns.length > 0 && (
            <Issue title="누락된 필수 열" items={parsed.missingColumns} />
          )}
          {parsed.missingIdRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">접점ID가 없는 행</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {parsed.missingIdRows.map((row) => (
                  <li key={row.index}>
                    데이터 {row.index}행 / 고객ID {row.customerId || "미입력"} / {row.snippet || "내용 없음"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsed.duplicateIds.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">중복 접점ID</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {parsed.duplicateIds.map((group) => (
                  <li key={group.contactId}>
                    {group.contactId} — 데이터 {group.indexes.join(", ")}행
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsed.parseErrors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">CSV 파싱 오류</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {parsed.parseErrors.slice(0, 20).map((error, index) => (
                  <li key={`${error.message}-${index}`}>
                    {error.row != null ? `${error.row}행: ` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">필드별 빈칸</h3>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {parsed.blankCounts.map((item) => (
                <li key={item.field}>
                  {item.field}: {item.blank.toLocaleString("ko-KR")} / {item.total.toLocaleString("ko-KR")}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">앞부분 10행 미리보기</h3>
            <p className="mt-1 text-xs text-muted">파일 확인용입니다. 전체 라벨링은 유효한 모든 행을 처리합니다.</p>
            <div className="mt-2 overflow-auto rounded-md border border-line">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    {parsed.columns.map((column) => (
                      <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.preview.map((row, index) => (
                    <tr key={index} className="border-t border-line">
                      {parsed.columns.map((column) => (
                        <td key={column} className="max-w-64 truncate px-3 py-2" title={row[column] ?? ""}>
                          {row[column] || <span className="text-muted">빈칸</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium">{value}</dd>
    </div>
  );
}

function Issue({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm">{items.join(", ")}</p>
    </div>
  );
}
