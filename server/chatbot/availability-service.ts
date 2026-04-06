import { storage } from "../storage";
import type { Barber, BreakSchedule } from "@shared/schema";
import { getNowAsUtcLocal, getBrazilDateString, getBrazilTimeString } from "../utils/timezone";

export function getDayOfWeekFromDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return dayNames[d.getUTCDay()];
}

export function getBarberBreakForDate(barber: Barber, date: string): { start: string; end: string } | null {
  const dayNames: (keyof BreakSchedule)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  const dayKey = dayNames[dateObj.getUTCDay()];

  if (barber.breakSchedule && barber.breakSchedule[dayKey]?.enabled) {
    const dayBreak = barber.breakSchedule[dayKey];
    if (dayBreak.start && dayBreak.end) {
      return { start: dayBreak.start, end: dayBreak.end };
    }
  }

  if (barber.lunchStart && barber.lunchEnd) {
    return { start: barber.lunchStart, end: barber.lunchEnd };
  }

  return null;
}

export function normalizeDateStr(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return dateStr;
}

export function formatDateBrazil(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export function formatTimeBrazil(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export interface SlotInfo {
  barberName: string;
  barberId: string;
  time: string;
  date: string;
}

export async function checkBarberAvailabilityWithDuration(
  barbershopId: string,
  barberId: string,
  date: string,
  serviceDuration: number
): Promise<string[]> {
  const barber = await storage.getBarber(barberId);
  const barbershop = await storage.getBarbershop(barbershopId);

  if (!barber || !barbershop) {
    console.log(`[Availability] Barber ou barbershop não encontrado (barberId=${barberId})`);
    return [];
  }

  const normalizedDate = normalizeDateStr(date);
  const startOfDay = new Date(`${normalizedDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${normalizedDate}T23:59:59.999Z`);
  const appointments = await storage.getAppointments(barbershopId, startOfDay, endOfDay);

  const barberAppointments = appointments.filter(a =>
    a.barberId === barberId && a.status !== 'cancelled'
  );

  const dayOfWeek = getDayOfWeekFromDate(normalizedDate);
  const workingHours = barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }> | null;
  const daySchedule = workingHours?.[dayOfWeek];

  console.log(`[Availability] ${barber.name} | Data: ${normalizedDate} (${dayOfWeek}) | Expediente: ${daySchedule?.open}-${daySchedule?.close} | Habilitado: ${daySchedule?.enabled} | Duração serviço: ${serviceDuration}min`);
  console.log(`[Availability] ${barber.name} | Agendamentos existentes: ${barberAppointments.length} -> ${barberAppointments.map(a => `${formatTimeBrazil(new Date(a.startTime))}-${formatTimeBrazil(new Date(a.endTime))}`).join(', ') || 'nenhum'}`);

  if (!daySchedule?.enabled) {
    console.log(`[Availability] ${barber.name} | Dia ${dayOfWeek} NÃO habilitado - retornando 0 slots`);
    return [];
  }

  const [openH, openM] = daySchedule.open.split(':').map(Number);
  const [closeH, closeM] = daySchedule.close.split(':').map(Number);
  const closeMins = closeH * 60 + closeM;

  const dayBreak = getBarberBreakForDate(barber, normalizedDate);
  let lunchStartMins = 0;
  let lunchEndMins = 0;
  if (dayBreak) {
    const [lunchStartH, lunchStartM] = dayBreak.start.split(':').map(Number);
    const [lunchEndH, lunchEndM] = dayBreak.end.split(':').map(Number);
    lunchStartMins = lunchStartH * 60 + lunchStartM;
    lunchEndMins = lunchEndH * 60 + lunchEndM;
    console.log(`[Availability] ${barber.name} | Intervalo: ${dayBreak.start}-${dayBreak.end}`);
  } else {
    console.log(`[Availability] ${barber.name} | Sem intervalo configurado`);
  }

  const slots: string[] = [];
  const discardedSlots: string[] = [];
  const interval = barbershop.bookingIntervalMinutes || 30;

  for (let h = openH; h < closeH || (h === closeH && 0 < closeM); h++) {
    for (let m = (h === openH ? openM : 0); m < 60; m += interval) {
      if (h === closeH && m >= closeM) break;

      const startMins = h * 60 + m;
      const endMins = startMins + serviceDuration;
      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      if (endMins > closeMins) {
        discardedSlots.push(`${time} (ultrapassa fechamento ${closeH}:${closeM.toString().padStart(2, '0')})`);
        continue;
      }

      if (dayBreak) {
        const overlapsLunch = (startMins >= lunchStartMins && startMins < lunchEndMins) ||
                             (endMins > lunchStartMins && endMins <= lunchEndMins) ||
                             (startMins < lunchStartMins && endMins > lunchEndMins);
        if (overlapsLunch) {
          discardedSlots.push(`${time} (conflita com intervalo ${dayBreak.start}-${dayBreak.end})`);
          continue;
        }
      }

      const slotStart = new Date(`${normalizedDate}T${time}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

      const hasConflict = barberAppointments.some(a => {
        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        const newStart = slotStart.getTime();
        const newEnd = slotEnd.getTime();

        return (newStart < aEnd && newEnd > aStart);
      });

      if (hasConflict) {
        discardedSlots.push(`${time} (conflito com agendamento existente)`);
      } else {
        slots.push(time);
      }
    }
  }

  console.log(`[Availability] ${barber.name} em ${normalizedDate}: ${slots.length} slots disponíveis, ${discardedSlots.length} descartados`);
  if (slots.length > 0) {
    console.log(`[Availability] ${barber.name} | Primeiros slots: [${slots.slice(0, 8).join(', ')}]`);
  }
  if (discardedSlots.length > 0) {
    console.log(`[Availability] ${barber.name} | Descartados: ${discardedSlots.slice(0, 10).join(', ')}`);
  }

  return slots;
}

export async function checkBarberAvailability(barbershopId: string, barberId: string, date: string): Promise<string[]> {
  const barber = await storage.getBarber(barberId);
  const barbershop = await storage.getBarbershop(barbershopId);

  if (!barber || !barbershop) return [];

  const normalizedDate = normalizeDateStr(date);
  const startOfDay = new Date(`${normalizedDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${normalizedDate}T23:59:59.999Z`);
  const appointments = await storage.getAppointments(barbershopId, startOfDay, endOfDay);

  const barberAppointments = appointments.filter(a =>
    a.barberId === barberId && a.status !== 'cancelled'
  );

  const dayOfWeek = getDayOfWeekFromDate(normalizedDate);
  const workingHours = barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }> | null;
  const daySchedule = workingHours?.[dayOfWeek];

  if (!daySchedule?.enabled) return [];

  const [openH, openM] = daySchedule.open.split(':').map(Number);
  const [closeH, closeM] = daySchedule.close.split(':').map(Number);

  const slots: string[] = [];
  const interval = barbershop.bookingIntervalMinutes || 30;

  const dayBreak = getBarberBreakForDate(barber, normalizedDate);
  let lunchStartMins = 0;
  let lunchEndMins = 0;
  if (dayBreak) {
    const [lunchStartH, lunchStartM] = dayBreak.start.split(':').map(Number);
    const [lunchEndH, lunchEndM] = dayBreak.end.split(':').map(Number);
    lunchStartMins = lunchStartH * 60 + lunchStartM;
    lunchEndMins = lunchEndH * 60 + lunchEndM;
  }

  for (let h = openH; h < closeH || (h === closeH && 0 < closeM); h++) {
    for (let m = (h === openH ? openM : 0); m < 60; m += interval) {
      if (h === closeH && m >= closeM) break;

      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const currentMins = h * 60 + m;

      if (dayBreak) {
        if (currentMins >= lunchStartMins && currentMins < lunchEndMins) continue;
      }

      const slotTime = new Date(`${normalizedDate}T${time}:00.000Z`);
      const hasConflict = barberAppointments.some(a => {
        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        return slotTime.getTime() >= aStart && slotTime.getTime() < aEnd;
      });

      if (!hasConflict) {
        slots.push(time);
      }
    }
  }

  return slots;
}

export function filterFutureSlots(
  slots: string[],
  date: string,
  minAdvanceMinutes: number
): string[] {
  const nowLocal = getNowAsUtcLocal();
  const todayStr = getBrazilDateString();
  const normalizedDate = normalizeDateStr(date);

  if (normalizedDate !== todayStr) {
    return slots;
  }

  const minBookableTime = new Date(nowLocal.getTime() + minAdvanceMinutes * 60 * 1000);
  const minBookableStr = `${minBookableTime.getUTCHours().toString().padStart(2, '0')}:${minBookableTime.getUTCMinutes().toString().padStart(2, '0')}`;

  return slots.filter(s => s >= minBookableStr);
}

export function getMinBookableTimeStr(minAdvanceMinutes: number): string {
  const nowLocal = getNowAsUtcLocal();
  const minBookableTime = new Date(nowLocal.getTime() + minAdvanceMinutes * 60 * 1000);
  return `${minBookableTime.getUTCHours().toString().padStart(2, '0')}:${minBookableTime.getUTCMinutes().toString().padStart(2, '0')}`;
}

export interface NextAvailableSlotResult {
  slot: SlotInfo | null;
  allSlots: SlotInfo[];
  searchedDate: string;
  searchedNextDay: boolean;
}

export async function getNextAvailableSlot(params: {
  barbershopId: string;
  barberId?: string;
  barbers: Barber[];
  serviceDuration: number;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
  startDate?: string;
}): Promise<NextAvailableSlotResult> {
  const { barbershopId, barberId, barbers, serviceDuration, minAdvanceMinutes, maxDaysAhead, startDate } = params;
  const today = getBrazilDateString();
  const searchStart = startDate ? normalizeDateStr(startDate) : today;

  const barbersToCheck = barberId ? barbers.filter(b => b.id === barberId) : barbers;

  const findSlotsForDate = async (dateStr: string): Promise<SlotInfo[]> => {
    const results: SlotInfo[] = [];
    const normalized = normalizeDateStr(dateStr);

    for (const b of barbersToCheck) {
      const rawSlots = await checkBarberAvailabilityWithDuration(barbershopId, b.id, normalized, serviceDuration);
      const futureSlots = filterFutureSlots(rawSlots, normalized, minAdvanceMinutes);

      console.log(`[Availability] getNextAvailableSlot - ${b.name} em ${normalized}: ${rawSlots.length} total, ${futureSlots.length} futuros`);

      for (const slot of futureSlots) {
        results.push({ barberName: b.name, barberId: b.id, time: slot, date: normalized });
      }
    }

    results.sort((a, b) => a.time.localeCompare(b.time));
    return results;
  };

  let allSlots = await findSlotsForDate(searchStart);

  if (allSlots.length > 0) {
    return {
      slot: allSlots[0],
      allSlots,
      searchedDate: searchStart,
      searchedNextDay: false,
    };
  }

  const [sy, sm, sd] = searchStart.split('-').map(Number);
  const baseDate = new Date(Date.UTC(sy, sm - 1, sd));

  for (let i = 1; i <= Math.min(maxDaysAhead, 14); i++) {
    const nextDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const nextDateStr = `${nextDate.getUTCFullYear()}-${(nextDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${nextDate.getUTCDate().toString().padStart(2, '0')}`;

    allSlots = await findSlotsForDate(nextDateStr);
    if (allSlots.length > 0) {
      console.log(`[Availability] getNextAvailableSlot - Encontrou ${allSlots.length} slots em ${nextDateStr}`);
      return {
        slot: allSlots[0],
        allSlots,
        searchedDate: nextDateStr,
        searchedNextDay: true,
      };
    }
  }

  return {
    slot: null,
    allSlots: [],
    searchedDate: searchStart,
    searchedNextDay: true,
  };
}

export interface BarberAvailabilitySummary {
  barberId: string;
  barberName: string;
  slotsToday: number;
  firstSlotToday: string | null;
  firstSlotDate: string;
  firstSlotTime: string | null;
}

export async function getAvailabilitySummaryForBarbers(params: {
  barbershopId: string;
  barbers: Barber[];
  serviceDuration: number;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
}): Promise<{
  summaries: BarberAvailabilitySummary[];
  earliestBarber: BarberAvailabilitySummary | null;
}> {
  const { barbershopId, barbers, serviceDuration, minAdvanceMinutes, maxDaysAhead } = params;
  const today = getBrazilDateString();
  const summaries: BarberAvailabilitySummary[] = [];
  let earliestBarber: BarberAvailabilitySummary | null = null;

  for (const b of barbers) {
    const rawSlots = await checkBarberAvailabilityWithDuration(barbershopId, b.id, today, serviceDuration);
    const futureSlots = filterFutureSlots(rawSlots, today, minAdvanceMinutes);

    console.log(`[Availability] Summary - ${b.name}: ${rawSlots.length} slots total, ${futureSlots.length} futuros, primeiros: [${futureSlots.slice(0, 5).join(', ')}]`);

    const summary: BarberAvailabilitySummary = {
      barberId: b.id,
      barberName: b.name,
      slotsToday: futureSlots.length,
      firstSlotToday: futureSlots.length > 0 ? futureSlots[0] : null,
      firstSlotDate: today,
      firstSlotTime: futureSlots.length > 0 ? futureSlots[0] : null,
    };

    if (futureSlots.length > 0) {
      if (!earliestBarber || futureSlots[0] < (earliestBarber.firstSlotTime || '99:99')) {
        earliestBarber = summary;
      }
    }

    summaries.push(summary);
  }

  if (!earliestBarber) {
    const [ty, tm, td] = today.split('-').map(Number);
    const baseDate = new Date(Date.UTC(ty, tm - 1, td));

    for (let i = 1; i <= Math.min(maxDaysAhead, 7); i++) {
      const nextDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDateStr = `${nextDate.getUTCFullYear()}-${(nextDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${nextDate.getUTCDate().toString().padStart(2, '0')}`;

      for (const b of barbers) {
        const slots = await checkBarberAvailabilityWithDuration(barbershopId, b.id, nextDateStr, serviceDuration);
        if (slots.length > 0) {
          const idx = summaries.findIndex(s => s.barberId === b.id);
          if (idx >= 0) {
            summaries[idx].firstSlotDate = nextDateStr;
            summaries[idx].firstSlotTime = slots[0];
          }

          if (!earliestBarber || nextDateStr < earliestBarber.firstSlotDate ||
              (nextDateStr === earliestBarber.firstSlotDate && slots[0] < (earliestBarber.firstSlotTime || '99:99'))) {
            earliestBarber = summaries[idx >= 0 ? idx : 0];
          }
        }
      }

      if (earliestBarber) break;
    }
  }

  console.log(`[Availability] Summary completo. Barbeiro mais próximo: ${earliestBarber?.barberName || 'nenhum'} às ${earliestBarber?.firstSlotTime || 'N/A'} em ${earliestBarber?.firstSlotDate || 'N/A'}`);

  return { summaries, earliestBarber };
}

// Retorna o barbeiro com menos agendamentos hoje (mais slots disponíveis = menos ocupado)
export function getLeastBusyBarber(summaries: BarberAvailabilitySummary[]): BarberAvailabilitySummary | null {
  const available = summaries.filter(s => s.firstSlotTime !== null);
  if (available.length === 0) return null;

  return available.reduce((best, curr) => {
    if (curr.slotsToday > best.slotsToday) return curr;
    if (curr.slotsToday === best.slotsToday && (curr.firstSlotTime || '99:99') < (best.firstSlotTime || '99:99')) return curr;
    return best;
  });
}

export function isSlotValid(time: string, availableSlots: string[]): boolean {
  return availableSlots.includes(time);
}

export function isDateInPast(date: string): boolean {
  const todayStr = getBrazilDateString();
  return date < todayStr;
}

export function isTimeInPast(date: string, time: string): boolean {
  const todayStr = getBrazilDateString();
  if (date !== todayStr) return false;

  const nowLocal = getNowAsUtcLocal();
  const currentTimeStr = `${nowLocal.getUTCHours().toString().padStart(2, '0')}:${nowLocal.getUTCMinutes().toString().padStart(2, '0')}`;
  return time <= currentTimeStr;
}

export function isTimeBeforeMinAdvance(date: string, time: string, minAdvanceMinutes: number): boolean {
  const todayStr = getBrazilDateString();
  if (date !== todayStr) return false;

  const minBookableStr = getMinBookableTimeStr(minAdvanceMinutes);
  return time < minBookableStr;
}

export function isDateTooFarAhead(date: string, maxDaysAhead: number): boolean {
  const nowLocal = getNowAsUtcLocal();
  const maxDate = new Date(Date.UTC(
    nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + maxDaysAhead
  ));
  const [y, m, d] = date.split('-').map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));
  return targetDate > maxDate;
}
