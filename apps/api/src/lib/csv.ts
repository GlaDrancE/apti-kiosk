import Papa from 'papaparse';
import { badRequest } from './errors.js';

/** Parse a CSV string into row objects keyed by lower-cased, trimmed headers. */
export function parseCsv(csv: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors.length) {
    const first = result.errors[0]!;
    throw badRequest(`CSV parse error on row ${first.row ?? '?'}: ${first.message}`);
  }
  return result.data;
}

/** Serialise rows to CSV. Columns come from `headers`, in that order. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\r\n');
}
