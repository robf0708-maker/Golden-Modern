import { brazilDateToUTCStart } from "../utils/timezone";

/** Data local Brasil (YYYY-MM-DD) a partir de um instante UTC. */
export function utcInstantToBrazilDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Próximo dia civil no fuso Brasil, a partir de YYYY-MM-DD. */
export function addOneBrazilCalendarDay(ymd: string): string {
  const startUtc = brazilDateToUTCStart(ymd);
  const nextUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return nextUtc.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function buildChartPoints(
  dailyGross: Map<string, number>,
  startYmd: string,
  endYmd: string
): Array<{ date: string; gross: number }> {
  const points: Array<{ date: string; gross: number }> = [];
  let cur = startYmd;
  while (true) {
    points.push({ date: cur, gross: dailyGross.get(cur) || 0 });
    if (cur >= endYmd) break;
    cur = addOneBrazilCalendarDay(cur);
  }
  return points;
}
