export const normalizePublicApiBaseUrl = (value, { allowHttpLocalhost = false } = {}) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 300) return null;

  let url;
  try { url = new URL(value.trim()); }
  catch { return null; }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowHttpLocalhost && url.protocol === 'http:' && localhost)) return null;

  return url.origin;
};
