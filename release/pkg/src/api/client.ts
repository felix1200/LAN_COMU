// ABOUTME: HTTP 客户端：JWT 头注入、统一错误、鉴权文件下载（fetch + blob）

const TOKEN_KEY = 'intranet-im.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(path, { method: options.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查与服务器的连接');
  }

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** 带鉴权拉取文件 Blob（图片预览与文件下载共用） */
export async function fetchFileBlob(fileId: number, inline = false): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`/api/files/${fileId}${inline ? '?inline=1' : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new ApiError(res.status, '文件获取失败');
  }
  return res.blob();
}

/** 触发浏览器下载（跨域/鉴权场景必须用 fetch + blob，不能用 a[download] 直连） */
export async function downloadFile(fileId: number, filename: string): Promise<void> {
  const blob = await fetchFileBlob(fileId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
