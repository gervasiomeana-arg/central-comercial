import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountingDay, addBillingMonths, cents, clientLedger, generateCharges } from '../src/ledger.js';
import type { ClientSubscription, PaymentRecord } from '../src/types.js';

const sub = (patch: Partial<ClientSubscription> = {}) => ({ id: 'sub', clientId: 'client', appId: 'voley', planId: 'plan', planName: 'Plan DT', currency: 'USD', agreedAmount: 20, billingInterval: 'mensual', startDate: '2026-01-31', renewalDate: '2026-02-28', status: 'activa', ledgerEnabled: true, ledgerStartDate: '2026-01-31', ...patch } as ClientSubscription);
const pay = (id: string, amount: number, patch: Partial<PaymentRecord> = {}) => ({ id, clientId: 'client', appId: 'voley', subscriptionId: 'sub', amount, currency: 'USD', status: 'confirmado', ledgerAssignedAt: '2026-02-01T12:00:00Z', ...patch } as PaymentRecord);
const now = new Date('2026-03-31T18:00:00Z');

test('monthly periods stay anchored to the original calendar day, including leap years', () => {
  assert.equal(addBillingMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addBillingMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addBillingMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addBillingMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(accountingDay(new Date('2026-11-12T01:00:00Z')), '2026-11-11');
});
test('repeated cycles and restarts never duplicate charges or rewrite prior amounts', () => {
  const first = generateCharges([sub()], [], now);
  assert.equal(first.created, 3);
  const next = generateCharges([sub({ agreedAmount: 35 })], first.charges, new Date('2026-04-30T18:00:00Z'));
  assert.equal(next.created, 1);
  assert.deepEqual(next.charges.map(c => c.amount), [20, 20, 20, 35]);
  assert.equal(generateCharges([sub()], next.charges, now).created, 0);
});
test('old subscriptions do not create debts before explicit ledger activation', () => {
  const result = generateCharges([sub({ startDate: '2000-01-31', ledgerStartDate: '2026-03-12' })], [], now);
  assert.equal(result.created, 1);
  assert.equal(result.charges[0].periodStart, '2026-03-31');
  assert.equal(generateCharges([sub({ ledgerEnabled: false })], [], now).created, 0);
});
test('trials, expired and cancelled subscriptions never generate automatic charges', () => {
  for (const status of ['en_prueba', 'cancelada', 'vencida'] as const) assert.equal(generateCharges([sub({ status })], [], now).created, 0);
  const trial = generateCharges([sub({ billingInterval: 'prueba' })], [], now);
  assert.equal(trial.created, 0); assert.equal(trial.issues.length, 1);
});
test('one-time, annual and quarterly agreements generate their own correct periods', () => {
  assert.equal(generateCharges([sub({ billingInterval: 'unico' })], [], now).created, 1);
  assert.equal(generateCharges([sub({ billingInterval: 'anual' })], [], now).created, 1);
  assert.equal(generateCharges([sub({ billingInterval: 'trimestral' })], [], new Date('2026-04-30T18:00:00Z')).created, 2);
});
test('only confirmed, explicitly assigned payments reduce balances; partial payments carry forward', () => {
  const charges = generateCharges([sub()], [], now).charges;
  const ledger = clientLedger('client', charges, [pay('valid', 25), pay('pending', 100, { status: 'pendiente_confirmacion_manual' }), pay('unassigned', 100, { ledgerAssignedAt: undefined })], [sub()], '2026-03-31');
  assert.deepEqual(ledger.rows.map(c => c.remaining), [0, 15, 20]);
  assert.deepEqual(ledger.rows.map(c => c.state), ['pagado', 'vencido', 'pendiente']);
  assert.equal(ledger.totals[0].outstanding, 35);
  assert.equal(ledger.unassigned.length, 1);
});
test('currency, app, client and subscription boundaries prevent applying unrelated money', () => {
  const charges = generateCharges([sub()], [], now).charges;
  const unrelated = [pay('ars', 100, { currency: 'ARS' }), pay('app', 100, { appId: 'visibility' }), pay('sub', 100, { subscriptionId: 'other' }), pay('client', 100, { clientId: 'other' })];
  assert.equal(clientLedger('client', charges, unrelated, [sub()]).totals[0].outstanding, 60);
});
test('overpayments become credit, rejected payments do not count and voided charges stay voided', () => {
  const charges = generateCharges([sub()], [], now).charges;
  charges[0] = { ...charges[0], status: 'anulado', voidReason: 'Corrección' };
  const ledger = clientLedger('client', charges, [pay('credit', 50), pay('rejected', 500, { status: 'rechazado' })], [sub()]);
  assert.equal(ledger.totals[0].credit, 10);
  assert.equal(ledger.totals[0].outstanding, 0);
  assert.equal(ledger.rows[0].state, 'anulado');
  assert.equal(generateCharges([sub()], charges, now).created, 0);
});
test('fractional prices use cents without binary rounding loss and invalid amounts are rejected', () => {
  const subscription = sub({ agreedAmount: 0.1 });
  const charges = generateCharges([subscription], [], now).charges;
  assert.equal(clientLedger('client', charges, [pay('one', 0.1), pay('two', 0.2)], [subscription]).totals[0].outstanding, 0);
  for (const amount of [-1, NaN, Infinity, 0.001]) assert.throws(() => cents(amount));
});
