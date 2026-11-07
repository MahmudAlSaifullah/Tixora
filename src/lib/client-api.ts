export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error?.message ?? "Something went wrong. Please try again.", data?.error?.code ?? "UNKNOWN", response.status, data?.error?.details);
  }
  return data as T;
}

export async function postJson<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return unwrap<T>(response);
}

export async function getJson<T = unknown>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url));
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { url } = await unwrap<{ url: string }>(await fetch("/api/uploads", { method: "POST", body: form }));
  return url;
}
