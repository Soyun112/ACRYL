import { compareRecords } from "@/lib/grade";
import type { ContactRecord, Grade, ProcessingStatus } from "@/lib/types";

export interface ResultFilters {
  grades: Grade[];
  interests: string[];
  purposes: string[];
  meetings: string[];
  statuses: ProcessingStatus[];
  query: string;
}

export const EMPTY_FILTERS: ResultFilters = {
  grades: [],
  interests: [],
  purposes: [],
  meetings: [],
  statuses: [],
  query: "",
};

function matchesAny(selected: string[], values: string[]): boolean {
  if (selected.length === 0) return true;
  return values.some((value) => selected.includes(value));
}

export function filterRecords(records: ContactRecord[], filters: ResultFilters): ContactRecord[] {
  const query = filters.query.trim().toLowerCase();
  const matched = records.filter((record) => {
    if (filters.grades.length > 0 && (!record.grade || !filters.grades.includes(record.grade))) return false;
    if (!matchesAny(filters.interests, record.analysis?.interestAreas ?? [])) return false;
    if (!matchesAny(filters.purposes, record.analysis?.contactPurposes ?? [])) return false;
    if (!matchesAny(filters.meetings, record.analysis ? [record.analysis.meetingIntent] : [])) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(record.status)) return false;
    if (!query) return true;
    const haystack = [record.contactId, record.customerId, record.analysis?.workNeed ?? ""]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
  return matched.sort(compareRecords);
}
