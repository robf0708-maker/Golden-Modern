const BRAZIL_TZ = 'America/Sao_Paulo';
// Brasil é sempre UTC-3 (sem horário de verão desde 2019)
const BRAZIL_UTC_OFFSET_HOURS = 3;

export function getNowAsUtcLocal(): Date {
  const now = new Date();
  const brazilStr = now.toLocaleString('en-US', { timeZone: BRAZIL_TZ });
  const brazilDate = new Date(brazilStr);
  return new Date(Date.UTC(
    brazilDate.getFullYear(), brazilDate.getMonth(), brazilDate.getDate(),
    brazilDate.getHours(), brazilDate.getMinutes(), brazilDate.getSeconds()
  ));
}

export function getBrazilDateString(): string {
  const now = getNowAsUtcLocal();
  const y = now.getUTCFullYear();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getBrazilTimeString(): string {
  const now = getNowAsUtcLocal();
  const h = now.getUTCHours().toString().padStart(2, '0');
  const m = now.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Converte uma string de data no formato "YYYY-MM-DD" (horário Brasil)
 * para o instante UTC correspondente ao início daquele dia (00:00:00 Brasil).
 */
export function brazilDateToUTCStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
}

/**
 * Converte uma string de data no formato "YYYY-MM-DD" (horário Brasil)
 * para o instante UTC correspondente ao fim daquele dia (23:59:59.999 Brasil).
 */
export function brazilDateToUTCEnd(dateStr: string): Date {
  const start = brazilDateToUTCStart(dateStr);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
