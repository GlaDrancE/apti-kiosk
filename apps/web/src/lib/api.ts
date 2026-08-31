import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/* Students hold a token this API issued; admins hold a Supabase session.
   Only one is ever present, so the student token wins when it is. */
const STUDENT_TOKEN_KEY = 'apti.studentToken';

export const studentToken = {
  get: () => localStorage.getItem(STUDENT_TOKEN_KEY),
  set: (t: string) => localStorage.setItem(STUDENT_TOKEN_KEY, t),
  clear: () => localStorage.removeItem(STUDENT_TOKEN_KEY),
};

async function authHeader(): Promise<Record<string, string>> {
  const local = studentToken.get();
  if (local) return { Authorization: `Bearer ${local}` };

  // getSession() refreshes an admin's Supabase token when it is near expiry.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Fetch wrapper that attaches whichever kind of token this session holds. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed', body.details);
  }
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  return (contentType.includes('json') ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Trigger a browser download of a CSV endpoint (auth header needed, so not a plain link). */
export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');

  downloadBlob(await res.blob(), filename);
}

/** Save an in-memory string as a file — used for the generated credentials sheet. */
export function downloadText(text: string, filename: string, type = 'text/csv') {
  downloadBlob(new Blob([text], { type }), filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
