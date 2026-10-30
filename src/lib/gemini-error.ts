export type GeminiErrorCode =
  | "AUTH"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TRANSIENT"
  | "OUTPUT_LIMIT"
  | "BAD_RESPONSE"
  | "CONFIG"
  | "BAD_REQUEST";

export class GeminiCallError extends Error {
  readonly code: GeminiErrorCode;
  readonly httpStatus: number;

  constructor(code: GeminiErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "GeminiCallError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function redactSecrets(text: string, secret?: string): string {
  let next = text.replace(/AIza[0-9A-Za-z\-_]{8,}/g, "[redacted]");
  if (secret && secret.length > 0) next = next.split(secret).join("[redacted]");
  return next;
}

const PUBLIC_MESSAGES: Record<GeminiErrorCode, string> = {
  AUTH: "Gemini API 인증에 실패했습니다. API 키를 확인해 주세요.",
  QUOTA: "Gemini API 할당량이 소진되었습니다. 잠시 후 다시 시도해 주세요.",
  RATE_LIMIT: "요청이 잠시 제한되었습니다. 잠시 후 같은 묶음을 다시 시도합니다.",
  TRANSIENT: "Gemini 서버가 일시적으로 응답하지 않았습니다.",
  OUTPUT_LIMIT: "응답 길이가 한도를 초과했습니다. 묶음을 나눠 다시 시도합니다.",
  BAD_RESPONSE: "Gemini 응답 형식을 확인하지 못했습니다.",
  CONFIG: "서버에 GEMINI_API_KEY 또는 GEMINI_MODEL이 설정되어 있지 않습니다.",
  BAD_REQUEST: "요청 형식이 올바르지 않습니다. 묶음 크기, 기준 버전, 분석 필드를 확인해 주세요.",
};

export function publicError(code: GeminiErrorCode, httpStatus: number): GeminiCallError {
  return new GeminiCallError(code, PUBLIC_MESSAGES[code], httpStatus);
}

export function mapProviderError(error: unknown, secret?: string): GeminiCallError {
  if (error instanceof GeminiCallError) {
    return new GeminiCallError(error.code, PUBLIC_MESSAGES[error.code], error.httpStatus);
  }
  const record = error && typeof error === "object" ? (error as { status?: unknown; message?: unknown }) : null;
  const status = typeof record?.status === "number" ? record.status : undefined;
  const raw = redactSecrets(error instanceof Error ? error.message : "", secret);
  if (status === 401 || status === 403) return publicError("AUTH", 401);
  if (status === 429 && /quota|billing|exceeded your current quota/i.test(raw)) return publicError("QUOTA", 429);
  if (status === 429) return publicError("RATE_LIMIT", 429);
  if (status === 500 || status === 503 || status === 504) return publicError("TRANSIENT", 503);
  if (/MAX_TOKENS|output token|finish reason/i.test(raw)) return publicError("OUTPUT_LIMIT", 422);
  return publicError("TRANSIENT", 502);
}
