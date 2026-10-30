export function isBlank(value: string | null | undefined): boolean {
  if (!value) return true;
  return value.replace(/[\s\u3000]/g, "").length === 0;
}

export function normalizeText(value: string): string {
  return value.normalize("NFC");
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
