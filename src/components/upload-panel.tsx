"use client";

import { useRef, useState } from "react";
import { REQUIRED_COLUMNS } from "@/lib/criteria";
import type { ParsedCsv } from "@/lib/csv";

const PREVIEW_LIMIT = 5;

export function UploadPanel({
  fileName,
  parsed,
  encodingError,
  disabled,
  onFile,
  variant,
}: {
  fileName: string | null;
  parsed: ParsedCsv | null;
  encodingError: string | null;
  disabled: boolean;
  onFile: (file: File) => void;
  variant: "empty" | "review" | "source";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showMoreRows, setShowMoreRows] = useState(false);

  function pick(file: File | undefined) {
    if (!file || disabled) return;
    onFile(file);
  }

  const input = (
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
  );

  if ((variant === "review" || variant === "source") && parsed?.canRun) {
    const visibleRows = showMoreRows ? parsed.preview : parsed.preview.slice(0, PREVIEW_LIMIT);
    return (
      <section className={variant === "review" ? "shell" : "shell"} aria-labelledby="preview-title">
        {variant === "review" && (
          <div className="file-row panel">
            <div>
              <p className="text-sm font-semibold">{fileName ?? "이름 없음"}</p>
              <p className="mt-1 text-sm text-muted">접점 {parsed.dataRowCount.toLocaleString("ko-KR")}건</p>
            </div>
            <button type="button" className="btn-secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
              파일 변경
            </button>
            {input}
          </div>
        )}
        <div className="panel mt-3">
          <h2 id="preview-title" className="text-base font-semibold">
            원본 미리보기
          </h2>
          <p className="mt-1 text-sm text-muted">기본 5행입니다. 열은 가로로 스크롤하고, 분석은 유효한 모든 행을 처리합니다.</p>
          <p className="mt-3 text-sm">필수 열 {REQUIRED_COLUMNS.length}개가 모두 있습니다.</p>
          <div className="mt-3 overflow-auto rounded-xl border border-line">
            <table className="preview-table min-w-full">
              <thead>
                <tr>
                  {parsed.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={index}>
                    {parsed.columns.map((column) => (
                      <td key={column} className="whitespace-nowrap">
                        {row[column]?.trim() ? row[column] : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.preview.length > PREVIEW_LIMIT && (
            <button type="button" className="btn-secondary mt-3" onClick={() => setShowMoreRows((open) => !open)}>
              {showMoreRows ? "5행만 보기" : `미리보기 ${parsed.preview.length}행 펼치기`}
            </button>
          )}
          <details className="mt-3 text-sm">
            <summary className="disclosure font-medium">필드별 빈칸</summary>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {parsed.blankCounts.map((item) => (
                <li key={item.field}>
                  {item.field}: {item.blank.toLocaleString("ko-KR")} / {item.total.toLocaleString("ko-KR")}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    );
  }

  return (
    <section className="shell" aria-labelledby="upload-title">
      <div className="upload-stage panel">
        <h2 id="upload-title" className="text-xl font-bold">
          분석할 CRM 파일을 올려주세요
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          전시회 접점 CSV를 업로드하면 관심 분야와 후속 요청을 정리합니다.
        </p>
        <div
          className={`dropzone ${dragOver ? "over" : ""}`}
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
          <FileIcon />
          <p className="mt-3 text-sm">파일을 끌어 놓거나 선택하세요</p>
          <button type="button" className="btn-primary mt-4" disabled={disabled} onClick={() => inputRef.current?.click()}>
            CSV 파일 선택
          </button>
          <p className="mt-3 text-xs text-muted">UTF-8 CSV 지원</p>
          {input}
        </div>
        <details className="mt-4 text-left text-sm">
          <summary className="disclosure font-medium">필수 열 확인</summary>
          <p className="mt-2 text-muted">{REQUIRED_COLUMNS.join(", ")}</p>
        </details>
        {encodingError && (
          <p role="alert" className="mt-4 bg-danger-soft px-3 py-2 text-left text-sm text-danger">
            {encodingError}
          </p>
        )}
        {parsed && !parsed.canRun && (
          <div className="mt-4 space-y-3 text-left text-sm">
            {parsed.blockReason && (
              <p role="alert" className="bg-danger-soft px-3 py-2 text-danger">
                {parsed.blockReason}
              </p>
            )}
            {parsed.missingColumns.length > 0 && <p>누락된 필수 열: {parsed.missingColumns.join(", ")}</p>}
            {parsed.missingIdRows.length > 0 && (
              <div>
                <h3 className="font-semibold">접점ID가 없는 행</h3>
                <ul className="mt-1 space-y-1">
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
                <h3 className="font-semibold">중복 접점ID</h3>
                <ul className="mt-1 space-y-1">
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
                <h3 className="font-semibold">CSV 파싱 오류</h3>
                <ul className="mt-1 space-y-1">
                  {parsed.parseErrors.slice(0, 20).map((error, index) => (
                    <li key={`${error.message}-${index}`}>
                      {error.row != null ? `${error.row}행: ` : ""}
                      {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mx-auto h-8 w-8 text-accent">
      <path d="M7 3.5h6.5L19 9v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.5 3.5V9H19" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
