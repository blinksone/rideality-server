/**
 * Normalize phone numbers to E.164 (+COUNTRY…digits).
 *
 * Pakistan mobile quirk (very common source of "duplicate" users):
 * - Local form: 03XX-XXXXXXX  (leading trunk 0)
 * - Correct E.164: +923XXXXXXXXX  (NO 0 after country code 92)
 * - Bad form that was stored: +9203XXXXXXXXX  (0 kept after +92)
 *
 * Users look like two different accounts in the admin list if one
 * login used +9203… and another used +923….
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');

  if (!digits) return '+';

  // 00… international prefix
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Local Pakistani mobile without country code: 03XXXXXXXXX (11 digits)
  if (/^0?3\d{9}$/.test(digits)) {
    digits = `92${digits.replace(/^0/, '')}`;
  }

  // Country already present: fix +9203… → +923… (drop trunk 0 after 92)
  // Matches 92 0 3xxxxxxxxx
  if (/^9203\d{9}$/.test(digits)) {
    digits = `92${digits.slice(3)}`;
  }

  // Generic: after any country code that ends up with 0 + national start,
  // only apply the known Pakistan pattern above (safe / not global).

  return `+${digits}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/** Local national number + region prefix → E.164. Already-international values pass through. */
export function toE164WithPrefix(raw: string, prefix?: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) return normalizePhone(trimmed);
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) return normalizePhone(trimmed);
  const p = (prefix ?? '').replace(/\s/g, '');
  if (!p) return normalizePhone(trimmed);
  const national = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  const prefixDigits = p.replace(/\D/g, '');
  if (national.startsWith(prefixDigits)) return normalizePhone(national);
  return normalizePhone(`${p}${national}`);
}

/** True if two phone strings refer to the same line after normalization. */
export function phonesEqual(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b);
}
