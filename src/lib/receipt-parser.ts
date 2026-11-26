export interface ReceiptFields {
  store?: string;
  date?: string;
  amount?: number;
}
export function parseReceipt(text: string): ReceiptFields {
  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: ReceiptFields = {};
  result.store = lines.find(
    (s) =>
      /[a-z]{3}/i.test(s) &&
      !/^\W*(receipt|invoice|date|tel|phone|www|https)/i.test(s) &&
      !/^\d/.test(s),
  );
  const dates =
    text.match(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g) || [];
  for (const raw of dates) {
    const a = raw.split(/[-/]/).map(Number);
    const [y, m, d] = a[0] > 999 ? a : [a[2] < 100 ? 2000 + a[2] : a[2], a[0], a[1]];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (y >= 1900 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      result.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      break;
    }
  }
  const totals = lines.filter(
    (s) =>
      /\b(total|amount paid|amount due)\b/i.test(s) &&
      !/(sub\s*total|tax|savings|discount)/i.test(s),
  );
  for (const line of totals) {
    const matches = [...line.matchAll(/(?:\$\s*)?(\d[\d,]*\.\d{2})\b/g)];
    if (matches.length)
      result.amount = Math.round(Number(matches.at(-1)![1].replaceAll(',', '')) * 100);
  }
  return result;
}
