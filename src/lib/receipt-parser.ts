export interface ReceiptFields {
  store?: string;
  date?: string;
  amount?: number;
}
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function validDate(year: number, month: number, day: number) {
  const y = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(y, month - 1, day));
  return y >= 1900 &&
    y <= 2100 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : undefined;
}
function purchaseDate(text: string) {
  // Prefer a labelled purchase/transaction date over unrelated dates on the receipt.
  const lines = text.split('\n');
  const ordered = [
    ...lines.filter((line) => /\b(date|purchased|transaction)\b/i.test(line)),
    ...lines,
  ];
  for (const line of ordered) {
    for (const match of line.matchAll(
      /\b([\dOIl]{4}|[\dOIl]{1,2})\s*[-/.]\s*([\dOIl]{1,2})\s*[-/.]\s*([\dOIl]{4}|[\dOIl]{2})\b/g,
    )) {
      const [a, b, c] = match
        .slice(1)
        .map((part) => Number(part.replace(/O/g, '0').replace(/[Il]/g, '1')));
      const date = match[1].length === 4 ? validDate(a, b, c) : validDate(c, a, b);
      if (date) return date;
    }
    const named =
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?[\s/-]+(\d{1,2})(?:st|nd|rd|th)?[,\s/-]+(\d{4}|\d{2})\b/i;
    const reversed =
      /\b(\d{1,2})[\s/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?[,\s/-]+(\d{4}|\d{2})\b/i;
    const forward = line.match(named),
      backward = line.match(reversed);
    if (forward || backward) {
      const parts = forward ?? backward!;
      const month = months.indexOf(parts[forward ? 1 : 2].slice(0, 3).toLowerCase()) + 1;
      const date = validDate(Number(parts[3]), month, Number(parts[forward ? 2 : 1]));
      if (date) return date;
    }
  }
}
function cleanStore(line: string) {
  let value = line
    .replace(/^\s*(?:merchant|store)\s*:\s*/i, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
  // Uppercase merchant names often have stray lowercase OCR fragments at the edges.
  const upper = value.match(/\b[A-Z][A-Z0-9'’.-]+(?:\s+(?:&\s+)?[A-Z][A-Z0-9'’.-]+)*/g);
  if (upper?.length === 1 && /[a-z]/.test(value) && !/[A-Z][a-z]{2}/.test(value)) value = upper[0];
  return value.replace(/\s+/g, ' ').slice(0, 180);
}
export function parseReceipt(text: string): ReceiptFields {
  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: ReceiptFields = {};
  result.store = lines
    .slice(0, 12)
    .map(cleanStore)
    .find(
      (s) =>
        /[a-z]{3}/i.test(s) &&
        !/^(receipt|invoice|date|tel|phone|www|https|thank|welcome|customer|cashier|register|transaction|order|sub\s*total|total|tax|amount|visa|mastercard)\b/i.test(
          s,
        ) &&
        !/^\d/.test(s) &&
        !/\$|\d[.,]\d{2}\b|\b\d{5}(?:-\d{4})?\b/.test(s) &&
        !purchaseDate(s),
    );
  const date = purchaseDate(text);
  if (date) result.date = date;
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
export function parseSerialNumber(text: string) {
  const labelled = text.match(
    /(?:serial(?:\s*(?:number|no\.?))?|s\s*\/\s*n|s\/?n)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i,
  );
  if (labelled && /\d/.test(labelled[1])) return labelled[1];
  const candidates = text
    .split(/\s+/)
    .filter((s) => /^[A-Z0-9][A-Z0-9_-]{4,}$/i.test(s) && /\d/.test(s));
  return candidates.length === 1 ? candidates[0] : undefined;
}
