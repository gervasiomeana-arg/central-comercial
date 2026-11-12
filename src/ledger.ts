import type { AccountCharge, ClientSubscription, PaymentRecord } from './types.js';

export function accountingDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function cents(amount: number) {
  const value = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(value) || Math.abs(value / 100 - amount) > 0.00000001) throw new Error('El importe debe ser válido y tener hasta dos decimales.');
  return value;
}
export function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function addBillingMonths(anchor: string, months: number) {
  if (!validDay(anchor)) throw new Error('Fecha de inicio no válida.');
  const [year, month, day] = anchor.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}
export function validateLedgerSubscription(sub: ClientSubscription) {
  if (!validDay(sub.startDate) || !validDay(sub.ledgerStartDate || '') || sub.ledgerStartDate! < sub.startDate) throw new Error('Revisá las fechas de la cuenta corriente.');
  if (!['mensual', 'anual', 'trimestral', 'unico'].includes(sub.billingInterval)) throw new Error('Las pruebas gratuitas no generan vencimientos.');
  if (cents(sub.agreedAmount) <= 0 || !/^[A-Z]{3}$/.test(sub.currency)) throw new Error('Importe o moneda no válidos para la cuenta corriente.');
}
export function generateCharges(subscriptions: ClientSubscription[], existing: AccountCharge[], now = new Date()) {
  const today = accountingDay(now), charges = [...existing], ids = new Set(existing.map(c => c.id));
  const issues: string[] = [];
  for (const sub of subscriptions) {
    if (sub.ledgerEnabled !== true || sub.status !== 'activa') continue;
    try {
      validateLedgerSubscription(sub);
      const months = sub.billingInterval === 'anual' ? 12 : sub.billingInterval === 'trimestral' ? 3 : 1;
      const from = new Date(sub.ledgerStartDate!);
      const anchor = new Date(sub.startDate);
      const offset = sub.billingInterval === 'unico' ? 0 : Math.max(0, Math.floor(((from.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + from.getUTCMonth() - anchor.getUTCMonth()) / months) - 1);
      for (let period = offset; period < offset + 1500; period++) {
        const start = addBillingMonths(sub.startDate, period * months);
        if (start > today) break;
        if (start >= sub.ledgerStartDate!) {
          const id = `charge-${encodeURIComponent(sub.id)}-${start}`;
          if (!ids.has(id)) {
            charges.push({ id, clientId: sub.clientId, subscriptionId: sub.id, appId: sub.appId, currency: sub.currency, amount: sub.agreedAmount, periodStart: start, periodEnd: sub.billingInterval === 'unico' ? start : addBillingMonths(sub.startDate, (period + 1) * months), dueDate: start, status: 'vigente', createdAt: now.toISOString() });
            ids.add(id);
          }
        }
        if (sub.billingInterval === 'unico') break;
      }
    } catch (error: any) { issues.push(`${sub.planName}: ${error.message}`); }
  }
  return { charges, created: charges.length - existing.length, issues };
}

export function clientLedger(clientId: string, charges: AccountCharge[], payments: PaymentRecord[], subscriptions: ClientSubscription[], today = accountingDay()) {
  const subMap = new Map(subscriptions.filter(s => s.clientId === clientId).map(s => [s.id, s]));
  const credit = new Map<string, number>();
  const unassigned: PaymentRecord[] = [];
  const totals: Record<string, { charged: number; applied: number; outstanding: number; credit: number }> = {};
  const bucket = (currency: string) => totals[currency] ||= { charged: 0, applied: 0, outstanding: 0, credit: 0 };
  for (const payment of payments) {
    if (payment.clientId !== clientId || payment.status !== 'confirmado') continue;
    const sub = payment.subscriptionId ? subMap.get(payment.subscriptionId) : undefined;
    if (!payment.ledgerAssignedAt || !sub || sub.appId !== payment.appId || sub.currency !== payment.currency) { unassigned.push(payment); continue; }
    try { credit.set(sub.id, (credit.get(sub.id) || 0) + cents(payment.amount)); } catch { unassigned.push(payment); }
  }
  const rows = charges.filter(c => c.clientId === clientId).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)).map(charge => {
    if (charge.status === 'anulado') return { ...charge, paid: 0, remaining: 0, state: 'anulado' as const };
    const sub = subMap.get(charge.subscriptionId);
    const amount = cents(charge.amount);
    const available = sub && sub.appId === charge.appId && sub.currency === charge.currency ? (credit.get(sub.id) || 0) : 0;
    const paid = Math.min(available, amount);
    if (sub && available) credit.set(sub.id, available - paid);
    const summary = bucket(charge.currency);
    summary.charged += amount; summary.applied += paid; summary.outstanding += amount - paid;
    return { ...charge, paid: paid / 100, remaining: (amount - paid) / 100, state: paid === amount ? 'pagado' as const : charge.dueDate < today ? 'vencido' as const : 'pendiente' as const };
  });
  for (const [id, amount] of credit) { const sub = subMap.get(id); if (sub) bucket(sub.currency).credit += amount; }
  return { rows, unassigned, totals: Object.entries(totals).map(([currency, value]) => ({ currency, charged: value.charged / 100, applied: value.applied / 100, outstanding: value.outstanding / 100, credit: value.credit / 100 })) };
}
