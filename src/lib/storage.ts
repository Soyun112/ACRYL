import type { StoredJob } from "@/lib/types";

const DB_NAME = "acryl-crm-label";
const DB_VERSION = 1;
const JOBS = "jobs";
const META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(JOBS)) db.createObjectStore(JOBS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveJob(job: StoredJob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([JOBS, META], "readwrite");
    tx.objectStore(JOBS).put(job);
    tx.objectStore(META).put({ key: "active", jobId: job.id });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadActiveJob(): Promise<StoredJob | null> {
  const db = await openDb();
  try {
    const meta = await requestToPromise<{ key: string; jobId: string } | undefined>(
      db.transaction(META, "readonly").objectStore(META).get("active"),
    );
    if (!meta?.jobId) return null;
    const job = await requestToPromise<StoredJob | undefined>(
      db.transaction(JOBS, "readonly").objectStore(JOBS).get(meta.jobId),
    );
    return job ?? null;
  } finally {
    db.close();
  }
}

export async function clearStoredJob(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([JOBS, META], "readwrite");
    tx.objectStore(JOBS).clear();
    tx.objectStore(META).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
