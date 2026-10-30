import { CRITERIA_VERSION } from "@/lib/criteria";
import type { StoredJob } from "@/lib/types";

export function prepareForResume(job: StoredJob): StoredJob {
  let changed = job.phase === "running";
  const records = job.records.map((record) => {
    if (record.status !== "처리 중") return record;
    changed = true;
    return { ...record, status: "대기" as const };
  });
  if (!changed) return job;
  return {
    ...job,
    records,
    phase: job.phase === "completed" ? job.phase : "paused",
    updatedAt: new Date().toISOString(),
  };
}

export function criteriaMatches(job: StoredJob): boolean {
  return job.criteriaVersion === CRITERIA_VERSION;
}
