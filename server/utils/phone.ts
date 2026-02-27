/**
 * Centralised phone normalisation — E.164 format +55XXXXXXXXXXX
 *
 * Every phone number stored in the database MUST go through normalizePhone()
 * before being saved.  Every lookup by phone MUST normalise the input first.
 *
 * Canonical output: +55 + DDD(2 digits) + 9 + number(8 digits) = +55XXXXXXXXXXX (13 chars)
 *
 * Accepted inputs:
 *   +55 11 98765-4321        →  +5511987654321
 *   55 11 98765-4321         →  +5511987654321
 *   (11) 98765-4321          →  +5511987654321
 *   11987654321               →  +5511987654321
 *   1198765432 (10 dig)       →  +5511987654321  (adds 9th digit)
 *   5511987654321@s.whatsapp.net → +5511987654321
 *   018996651422 (trunk 0)    →  +5518996651422  (strips leading 0)
 *   0018996651422             →  +5518996651422  (strips leading 00)
 *   55018996651422            →  +5518996651422  (strips 55 + leading 0)
 */

export function normalizePhone(raw: string): string {
  if (!raw) return '';

  let digits = raw.replace(/@.*$/, '').replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.substring(2);
  }

  digits = digits.replace(/^0+/, '');

  if (digits.length === 10) {
    digits = digits.substring(0, 2) + '9' + digits.substring(2);
  }

  return `+55${digits}`;
}

export function isValidBrazilianPhone(phone: string): boolean {
  const normalized = phone.startsWith('+55') ? phone : normalizePhone(phone);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length !== 13 || !digits.startsWith('55')) return false;
  const ddd = parseInt(digits.substring(2, 4));
  if (ddd < 11 || ddd > 99) return false;
  if (digits[4] !== '9') return false;
  return true;
}

export function phoneForProvider(normalizedPhone: string): string {
  return normalizedPhone.replace(/^\+/, '');
}

export function formatPhoneDisplay(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.substring(2, 4);
    const part1 = digits.substring(4, 9);
    const part2 = digits.substring(9, 13);
    return `(${ddd}) ${part1}-${part2}`;
  }
  return normalizedPhone;
}
