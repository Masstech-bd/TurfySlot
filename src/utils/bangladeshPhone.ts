export const normalizeBangladeshMobile = (input: string): string | null => {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('880') ? `0${digits.slice(3)}` : digits;
  if (!/^01[3-9]\d{8}$/.test(local)) return null;
  return `+88${local}`;
};

export const formatBangladeshMobileInput = (input: string): string => {
  const trimmed = input.trimStart();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '').slice(0, 13)}`;
  return trimmed.replace(/\D/g, '').slice(0, 11);
};
