"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadActiveJob } from "@/lib/storage";
import {
  buildEml,
  draftFactsFromAnalysis,
  DRAFT_TIMEOUT_MS,
  TRIAL_ORG_LABEL,
  TRIAL_RECIPIENT,
  TRIAL_SUBJECT,
  TRIAL_TEMPLATE_BODY,
} from "@/lib/trial";
import { clearTrialDraft, loadTrialDraft, saveTrialDraft, type DraftSource } from "@/lib/trial-draft-store";
import type { ContactRecord } from "@/lib/types";

export function TrialDraftPage({ contactId }: { contactId: string }) {
  const [phase, setPhase] = useState<"loading" | "missing" | "ready">("loading");
  const [record, setRecord] = useState<ContactRecord | null>(null);
  const [body, setBody] = useState(TRIAL_TEMPLATE_BODY);
  const [source, setSource] = useState<DraftSource>("template");
  const [generation, setGeneration] = useState(0);
  const [copied, setCopied] = useState(false);
  const editedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadActiveJob()
      .then((job) => {
        if (cancelled) return;
        const found = job?.records.find((item) => item.contactId === contactId) ?? null;
        if (!found) {
          setPhase("missing");
          return;
        }
        setRecord(found);
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    if (phase !== "ready" || !record) return;
    const saved = generation === 0 ? loadTrialDraft(contactId) : null;
    if (saved) {
      setBody(saved.body);
      setSource(saved.source);
      return;
    }
    editedRef.current = false;
    setBody(TRIAL_TEMPLATE_BODY);
    setSource("template");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);
    let cancelled = false;
    const facts = draftFactsFromAnalysis(record.analysis);
    fetch("/api/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(facts),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { ok?: boolean; body?: unknown };
        if (!payload.ok || typeof payload.body !== "string" || !payload.body.includes("[체험판 링크]")) return null;
        return payload.body;
      })
      .then((nextBody) => {
        if (cancelled || editedRef.current) return;
        if (!nextBody) {
          saveTrialDraft(contactId, { body: TRIAL_TEMPLATE_BODY, source: "template" });
          return;
        }
        setBody(nextBody);
        setSource("gemini");
        saveTrialDraft(contactId, { body: nextBody, source: "gemini" });
      })
      .catch(() => {
        if (cancelled || editedRef.current) return;
        saveTrialDraft(contactId, { body: TRIAL_TEMPLATE_BODY, source: "template" });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [phase, record, contactId, generation]);

  function downloadEml() {
    const blob = new Blob([buildEml(body)], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trial-${contactId}.eml`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen">
      <main className="shell trial-page">
        <Link className="back" href="/">
          ← 제안 대상 검토로 돌아가기
        </Link>
        {phase === "loading" && <p className="notice">저장된 작업을 확인하고 있습니다.</p>}
        {phase === "missing" && (
          <section className="panel">
            <h1 className="text-xl font-bold">작업을 찾을 수 없습니다</h1>
            <p className="mt-2 text-sm text-muted">검토 화면에서 접점을 연 뒤 다시 들어와 주세요.</p>
            <Link className="btn-secondary mt-4 inline-flex" href="/">
              돌아가기
            </Link>
          </section>
        )}
        {phase === "ready" && record && (
          <>
            <div className="donebar">
              <div className="check" aria-hidden="true">
                ✓
              </div>
              <div>
                <h1>체험판이 생성되었습니다</h1>
                <p>
                  {record.customerId.trim() || "고객ID 없음"} · {TRIAL_ORG_LABEL} · 보내기 전에 메일 초안을 확인하고 수정하세요.
                </p>
              </div>
            </div>
            <div className="one">
              <article className="panel mail">
                <div className="mbar">
                  <b>후속 메일 초안</b>
                  <span className={source === "gemini" ? "src" : "src tpl"}>{source === "gemini" ? "✦ Gemini 생성" : "기본 템플릿"}</span>
                </div>
                <div className="mrow">
                  <span>받는 사람</span>
                  <input value={TRIAL_RECIPIENT} readOnly aria-label="받는 사람" />
                </div>
                <div className="mrow">
                  <span>제목</span>
                  <input value={TRIAL_SUBJECT} readOnly aria-label="제목" />
                </div>
                <textarea
                  aria-label="메일 본문"
                  value={body}
                  onChange={(event) => {
                    const next = event.target.value;
                    editedRef.current = true;
                    setBody(next);
                    saveTrialDraft(contactId, { body: next, source });
                  }}
                />
                <div className="mfoot">
                  <p>원문에 없는 수치·일정은 넣지 않습니다. 보내기 전 담당자가 확인해 주세요.</p>
                  <div className="acts">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        clearTrialDraft(contactId);
                        editedRef.current = false;
                        setBody(TRIAL_TEMPLATE_BODY);
                        setSource("template");
                        setGeneration((value) => value + 1);
                      }}
                    >
                      다시 생성
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => void copyBody()}>
                      {copied ? "복사됨" : "복사"}
                    </button>
                    <button type="button" className="btn-primary sm" onClick={downloadEml}>
                      .eml 다운로드
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </>
        )}
      </main>
      <footer className="site-footer">AI+X 해커톤 프로젝트</footer>
    </div>
  );
}
