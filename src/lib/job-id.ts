function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createJobId(fileBytes: Uint8Array, criteriaVersion: string, modelId: string): Promise<string> {
  const prefix = new TextEncoder().encode(`${criteriaVersion}\n${modelId}\n`);
  const combined = new Uint8Array(prefix.length + fileBytes.length);
  combined.set(prefix, 0);
  combined.set(fileBytes, prefix.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return hex(digest);
}
