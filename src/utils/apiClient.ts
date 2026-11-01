import type { User } from '../types';

let accessToken = '';
type RefreshedSession = { accessToken: string; user: User };
let refreshInFlight: Promise<RefreshedSession | null> | null = null;

export const setAccessToken = (token: string) => { accessToken = token; };

const refreshAccessToken = async () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.data?.accessToken) return null;
      accessToken = result.data.accessToken;
      return result.data;
    } catch { return null; }
  })();
  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
};

export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const execute = () => {
    const headers = new Headers(init.headers || {});
    if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);
    return fetch(input, { ...init, headers, credentials: 'include' });
  };
  let response = await execute();
  const url = String(input);
  if (response.status === 401 && !url.includes('/api/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await execute();
  }
  return response;
};

export const restoreSession = refreshAccessToken;
