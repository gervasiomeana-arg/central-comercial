import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { commercialCatalog, mergeCommercialCatalog, verifiedPriceSummary } from '../server/commercial-catalog.js';

test('empty databases receive all four products with source-backed prices for the three published apps', () => {
  const result = mergeCommercialCatalog([]);
  assert.equal(result.applications.length, 4);
  const [voley, visibility, neuro, funeraria] = result.applications;
  assert.deepEqual(voley.plans.filter(p => p.currency === 'ARS').map(p => p.price), [30000, 52500, 148500]);
  assert.deepEqual(voley.plans.filter(p => p.currency === 'USD' && p.price !== null).map(p => p.price), [20, 35, 99]);
  assert.deepEqual(visibility.plans.map(p => p.price), [30, 50, 100, 200, 350]);
  assert.equal(visibility.plans[0].interval, 'unico');
  assert.equal(neuro.plans[0].price, 20); assert.equal(neuro.trialDurationDays, 2);
  for (const app of [voley, visibility, neuro]) for (const p of app.plans) { assert.ok(p.sourceUrl?.startsWith('https://')); assert.ok(p.verifiedAt); assert.equal(p.verified, true); }
  assert.equal(funeraria.status, 'en_desarrollo'); assert.equal(funeraria.campaignsAllowed, false); assert.equal(funeraria.plans.length, 0);
});
test('migration keeps existing IDs, custom tariffs, websites, notes and relationships', () => {
  const source = commercialCatalog()[0];
  const previous = { ...source, id: 'owner-custom-id', commercialCatalogVersion: undefined, website: 'https://my-custom-domain.example', internalNotes: 'Información del propietario', plans: [{ id: 'custom-plan', name: 'Convenio especial', price: 75, currency: 'USD', interval: 'mensual' as const, features: [], verified: true }] };
  const before = JSON.stringify(previous);
  const result = mergeCommercialCatalog([previous]);
  assert.equal(result.applications.length, 4);
  assert.equal(result.applications[0].id, 'owner-custom-id');
  assert.equal(result.applications[0].website, previous.website);
  assert.equal(result.applications[0].internalNotes, previous.internalNotes);
  assert.deepEqual(result.applications[0].plans[0], previous.plans[0]);
  assert.equal(JSON.stringify(previous), before);
});
test('repeat startup does not duplicate products or overwrite later owner edits', () => {
  const first = mergeCommercialCatalog([]).applications;
  first[0].plans[0].price = 31000;
  first[0].trialDurationDays = 8;
  const next = mergeCommercialCatalog(first);
  assert.equal(next.changed, false);
  assert.deepEqual(next.applications, first);
});
test('known seed prices are archived without deletion and excluded from commercial answers', () => {
  const previous = { ...commercialCatalog()[0], commercialCatalogVersion: undefined, plans: [{ id: 'ov-plan-club-basico', name: 'Club Básico', price: 29, currency: 'USD', interval: 'mensual' as const, features: [], verified: false }] };
  const app = mergeCommercialCatalog([previous]).applications[0];
  assert.equal(app.plans[0].archived, true);
  assert.equal(app.plans[0].price, 29);
  assert.ok(!verifiedPriceSummary(app).includes('Club Básico'));
  assert.ok(verifiedPriceSummary(app).includes('USD 20'));
});
test('Brasil remains separate from the general USD table and never becomes BRL', () => {
  const app = commercialCatalog()[0];
  const brazil = app.plans.filter(p => p.market === 'Brasil');
  assert.equal(brazil.length, 3);
  assert.ok(brazil.every(p => p.currency === 'USD' && p.price === null));
  assert.ok(verifiedPriceSummary(app).includes('Precio a consultar'));
  assert.ok(verifiedPriceSummary(app).includes('General, excepto Brasil'));
});
test('normalizes known aliases without replacing custom product IDs', () => {
  const previous = { ...commercialCatalog()[2], id: 'neuro-existing', slug: 'neuro-planeta', name: 'Neuro Planeta', commercialCatalogVersion: undefined };
  const result = mergeCommercialCatalog([previous]);
  assert.equal(result.applications.filter(a => /neuro/i.test(a.name)).length, 1);
  assert.equal(result.applications[0].id, 'neuro-existing');
});

test('database startup persists the catalog while preserving commercial records', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'central-catalog-test-'));
  try {
    await fs.mkdir(path.join(directory, 'server')); await fs.mkdir(path.join(directory, 'data')); await fs.mkdir(path.join(directory, 'src'));
    await fs.copyFile(new URL('../src/ledger.ts', import.meta.url), path.join(directory, 'src', 'ledger.ts'));
    await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    for (const file of ['db.ts', 'commercial-catalog.ts', 'campaign-preparation.ts', 'sales-director.ts']) await fs.copyFile(new URL(`../server/${file}`, import.meta.url), path.join(directory, 'server', file));
    const original = { version: 1, applications: [{ ...commercialCatalog()[0], commercialCatalogVersion: undefined }], contacts: [{ id: 'saved-contact', orgName: 'Datos existentes' }], campaigns: [], conversations: [{ id: 'saved-conversation', messages: [] }], clients: [{ id: 'saved-client' }], subscriptions: [{ id: 'saved-subscription', agreedAmount: 37 }], payments: [{ id: 'saved-payment', amount: 37, currency: 'USD', status: 'pendiente_confirmacion_manual' }], tasks: [], connectors: [], logs: [] };
    const filename = path.join(directory, 'data', 'central_comercial_db.json');
    await fs.writeFile(filename, JSON.stringify(original));
    const { db } = await import(pathToFileURL(path.join(directory, 'server', 'db.ts')).href);
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.equal(saved.applications.length, 4);
    for (const field of ['contacts', 'campaigns', 'conversations', 'clients', 'subscriptions', 'payments'] as const) assert.deepEqual(saved[field], original[field]);
    const { accountingDay, addBillingMonths, clientLedger } = await import('../src/ledger.js');
    const day = accountingDay();
    const subscription = db.saveSubscription({ id: 'ledger-sub', clientId: 'saved-client', appId: 'app-open-voley', planId: 'manual', planName: 'Plan acordado', currency: 'USD', agreedAmount: 20, billingInterval: 'mensual', startDate: day, renewalDate: addBillingMonths(day, 1), status: 'activa', ledgerEnabled: true });
    assert.equal(db.getAccountCharges().length, 1);
    assert.equal(db.processLedger().created, 0);
    assert.throws(() => db.saveSubscription({ ...subscription, currency: 'ARS' }));
    const payment = db.savePayment({ id: 'linked-payment', clientId: 'saved-client', appId: 'app-open-voley', subscriptionId: subscription.id, amount: 25, currency: 'USD', method: 'transferencia_bancaria', referenceNumber: 'fixture', paymentDate: day, status: 'confirmado' });
    assert.equal(payment.status, 'pendiente_confirmacion_manual');
    payment.status = 'confirmado'; db.savePayment(payment); db.processLedger();
    const ledger = clientLedger('saved-client', db.getAccountCharges(), db.getPayments(), db.getSubscriptions());
    assert.equal(ledger.totals[0].outstanding, 0);
    assert.equal(ledger.totals[0].credit, 5);
    assert.throws(() => db.assignPaymentToSubscription('saved-payment', subscription.id, 'test-operator'));
    const charge = db.getAccountCharges()[0];
    db.voidAccountCharge(charge.id, 'Corrección de prueba aislada', 'test-operator');
    assert.equal(db.processLedger().created, 0);
    assert.equal(db.getAccountCharges()[0].status, 'anulado');

  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('archives the historical annual NeuroPlaneta seed without losing its record', () => {
  const previous = { ...commercialCatalog()[2], commercialCatalogVersion: '2026-11-12.1', plans: [{ id: 'old-custom-seed-id', name: 'Plan Familia Anual', price: 99, currency: 'USD', interval: 'anual' as const, features: [], verified: false }] };
  const app = mergeCommercialCatalog([previous]).applications[0];
  assert.equal(app.plans[0].archived, true);
  assert.equal(app.plans[0].price, 99);
  assert.ok(!verifiedPriceSummary(app).includes('Anual'));
});
