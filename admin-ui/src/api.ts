import type { PublicConfig } from './types'

type ApiOk<T> = { data: T; requestId?: string }
type ApiErr = { error?: { code?: string; message?: string } }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const payload = (await res.json().catch(() => ({}))) as ApiOk<T> & ApiErr
  if (!res.ok) {
    throw Object.assign(new Error(payload.error?.message || res.statusText || '请求失败'), {
      status: res.status,
      code: payload.error?.code,
      data: payload,
    })
  }
  return payload.data
}

export const api = {
  status: () => request<{ revision: string }>('/admin/api/v1/status'),
  login: (password: string) =>
    request<{ ok: boolean }>('/admin/api/v1/auth/session', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  requestCode: () => request<{ ok: boolean; expiresIn: number }>('/admin/api/v1/auth/code', { method: 'POST', body: '{}' }),
  logout: () =>
    request<{ ok: boolean }>('/admin/api/v1/auth/logout', {
      method: 'POST',
      body: '{}',
    }),
  getConfig: () => request<PublicConfig>('/admin/api/v1/config'),
  putConfig: (body: {
    expectedRevision: string
    config: Partial<PublicConfig>
  }) =>
    request<PublicConfig>('/admin/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  discover: (providerId: string) =>
    request<{ models: Array<{ id: string; displayName: string }>; truncated: boolean }>(
      '/admin/api/v1/providers/discover',
      { method: 'POST', body: JSON.stringify({ providerId }) },
    ),
}
