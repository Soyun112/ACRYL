import type {
  AnalysisField,
  CONTACT_PURPOSES,
  FOLLOW_UP_REQUESTS,
  DEMO_METHOD,
  GEMINI_METHOD,
  GRADES,
  INTEREST_AREAS,
  MEETING_INTENTS,
  PROCESSING_STATUSES,
  REVIEW_REASONS,
  REVIEW_STAGES,
  RULE_EMPTY_METHOD,
} from "@/lib/criteria";

export type ContactPurpose = (typeof CONTACT_PURPOSES)[number];
export type InterestArea = (typeof INTEREST_AREAS)[number];
export type ReviewStage = (typeof REVIEW_STAGES)[number];
export type FollowUpRequest = (typeof FOLLOW_UP_REQUESTS)[number];
export type MeetingIntent = (typeof MEETING_INTENTS)[number];
export type ReviewReason = (typeof REVIEW_REASONS)[number];
export type Grade = (typeof GRADES)[number];
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export type ProcessingMethod = typeof RULE_EMPTY_METHOD | typeof GEMINI_METHOD | typeof DEMO_METHOD;

export interface Evidence {
  label: string;
  field: AnalysisField;
  quote: string;
}

export interface AnalysisLabels {
  contactPurposes: ContactPurpose[];
  interestAreas: InterestArea[];
  workNeed: string;
  reviewStages: ReviewStage[];
  followUpRequests: FollowUpRequest[];
  meetingIntent: MeetingIntent;
  reviewReasons: ReviewReason[];
  evidence: Evidence[];
  followUpQuestions: string[];
}

export interface ContactRecord {
  contactId: string;
  customerId: string;
  source: Record<string, string>;
  status: ProcessingStatus;
  attempts: number;
  processingMethod: ProcessingMethod | null;
  model: string | null;
  criteriaVersion: string;
  analysis: AnalysisLabels | null;
  grade: Grade | null;
  selectionReason: string | null;
  error: string | null;
}

export interface StoredJob {
  id: string;
  fileName: string;
  criteriaVersion: string;
  modelId: string;
  columns: string[];
  records: ContactRecord[];
  selectedIds: string[];
  phase: "ready" | "running" | "paused" | "completed" | "halted";
  haltMessage: string | null;
  sourceNote: string | null;
  updatedAt: string;
}

export interface LabelContactInput {
  contactId: string;
  fields: Record<AnalysisField, string>;
}

export interface LabelItemSuccess {
  contactId: string;
  ok: true;
  analysis: AnalysisLabels;
}

export interface LabelItemFailure {
  contactId: string;
  ok: false;
  error: string;
}

export type LabelItemResult = LabelItemSuccess | LabelItemFailure;

export interface AppConfig {
  configured: boolean;
  model: string | null;
  criteriaVersion: string;
  maxBatchSize: number;
}
