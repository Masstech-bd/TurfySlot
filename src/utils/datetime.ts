// All dates/times across the app are anchored to Bangladesh Standard Time (GMT+6),
// regardless of the visitor's or server's local timezone.
export const APP_TIME_ZONE = 'Asia/Dhaka';

// Current moment, shifted so its getters (getDate/getMonth/etc.) reflect GMT+6.
export const getBDNow = (): Date => new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIME_ZONE }));

// YYYY-MM-DD for "today" (or an offset day) in GMT+6 — used for slot/booking date matching.
export const getBDDateString = (offsetDays = 0): string => {
  const d = getBDNow();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatBDDate = (iso: string, options: Intl.DateTimeFormatOptions = {}): string =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: APP_TIME_ZONE, ...options });

export const formatBDDateTime = (iso: string, options: Intl.DateTimeFormatOptions = {}): string =>
  new Date(iso).toLocaleString('en-GB', { timeZone: APP_TIME_ZONE, ...options });

export const formatBDTime = (value: string): string => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`;
};

export const formatBDTimeRange = (start: string, end: string): string =>
  `${formatBDTime(start)} - ${formatBDTime(end)}`;
