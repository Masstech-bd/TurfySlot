export interface LocationFilter {
  area: string;
  city: string;
}

export const locationFilterValue = ({ area, city }: LocationFilter): string => JSON.stringify([area, city]);

export const parseLocationFilter = (value: string): LocationFilter => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === 'string')) {
      return { area: parsed[0], city: parsed[1] };
    }
  } catch {
    // Older shared URLs stored a location as a single area or city value.
  }
  return { area: value, city: '' };
};
