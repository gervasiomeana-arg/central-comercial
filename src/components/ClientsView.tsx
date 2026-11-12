import { AccountLedgerPanel } from './AccountLedgerPanel.js';
import { accountingDay, addBillingMonths } from '../ledger.js';
import React, { useState } from 'react';
import {
  CreditCard,
  Users,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileCheck,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Search,
  ExternalLink,
  Layers
} from 'lucide-react';
import type {
  Client,
  ClientSubscription,
  PaymentRecord,
  Application,
  AccountCharge
} from '../types.js';

interface ClientsViewProps {
  clients: Client[];
  accountCharges?: AccountCharge[];
  onReconcileLedger?: () => Promise<void>;
  onVoidCharge?: (id: string, reason: string) => Promise<void>;
  onAssignPayment?: (id: string, subId: string) => Promise<void>;
  subscriptions: ClientSubscription[];
  payments: PaymentRecord[];
  applications: Application[];
  onSaveSubscription: (sub: ClientSubscription) => Promise<void>;
  onSavePayment: (payment: Partial<PaymentRecord>) => Promise<void>;
  onReviewPayment: (id: string, review: { status: 'confirmado' | 'rechazado'; auditorNote?: string; reviewedBy?: string }) => Promise<void>;
  selectedAppFilter: string;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  accountCharges = [], onReconcileLedger, onVoidCharge, onAssignPayment,
  subscriptions,
  payments,
  applications,
  onSaveSubscription,
  onSavePayment,
  onReviewPayment,
  selectedAppFilter,
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(clients[0]?.id || null);
  const [activeTab, setActiveTab] = useState<'cta_corriente' | 'suscripciones' | 'todos_los_cobros'>('cta_corriente');

  // New Subscription Modal
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subClientId, setSubClientId] = useState(clients[0]?.id || '');
  const [subAppId, setSubAppId] = useState(applications[0]?.id || '');
  const [subPlanName, setSubPlanName] = useState('');
  const [subCurrency, setSubCurrency] = useState('USD');
  const [subAmount, setSubAmount] = useState<number>(0);
  const [subInterval, setSubInterval] = useState<ClientSubscription['billingInterval']>('mensual');
  const [subStatus, setSubStatus] = useState<ClientSubscription['status']>('activa');

  const [subLedgerEnabled, setSubLedgerEnabled] = useState(true);
  const [subPlanId, setSubPlanId] = useState('');

  const [subStartDate, setSubStartDate] = useState(accountingDay());
  const [subRenewalDate, setSubRenewalDate] = useState(addBillingMonths(accountingDay(), 1));
  const trialDays = applications.find(a => a.id === subAppId)?.trialVerified ? applications.find(a => a.id === subAppId)?.trialDurationDays : null;
  React.useEffect(() => {
    if (!subStartDate) return;
    try {
      if (subInterval === 'unico') setSubRenewalDate(subStartDate);
      else if (subInterval === 'prueba') {
        if (trialDays) { const end = new Date(subStartDate + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + trialDays); setSubRenewalDate(end.toISOString().slice(0, 10)); }
        else setSubRenewalDate('');
      } else setSubRenewalDate(addBillingMonths(subStartDate, subInterval === 'anual' ? 12 : subInterval === 'trimestral' ? 3 : 1));
    } catch { setSubRenewalDate(''); }
  }, [subStartDate, subInterval, subAppId, trialDays]);

  // New Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payClientId, setPayClientId] = useState(clients[0]?.id || '');
  const [payAppId, setPayAppId] = useState(applications[0]?.id || '');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payCurrency, setPayCurrency] = useState('USD');
  const [payMethod, setPayMethod] = useState<PaymentRecord['method']>('transferencia_bancaria');
  const [paySubscriptionId, setPaySubscriptionId] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(accountingDay());

  // Payment Review Modal
  const [reviewingPayment, setReviewingPayment] = useState<PaymentRecord | null>(null);
  const [auditorNote, setAuditorNote] = useState('');
  const [auditorName, setAuditorName] = useState('Administrador Comercial');

  const displayedClients = selectedAppFilter === 'all' ? clients : clients.filter(c => subscriptions.some(s => s.clientId === c.id && s.appId === selectedAppFilter));
  const selectedClient = displayedClients.find(c => c.id === selectedClientId) || displayedClients[0] || null;

  // Subscriptions for selected client
  const clientSubscriptions = selectedClient
    ? subscriptions.filter(s => s.clientId === selectedClient.id && (selectedAppFilter === 'all' || s.appId === selectedAppFilter))
    : [];

  // Payments for selected client
  const clientPayments = selectedClient
    ? payments.filter(p => p.clientId === selectedClient.id && (selectedAppFilter === 'all' || p.appId === selectedAppFilter))
    : [];

  // Group payments by currency for selected client (Never mix without conversion)
  const clientBalancesByCurrency = React.useMemo(() => {
    const map: Record<string, { confirmed: number; pending: number }> = {};
    for (const p of clientPayments) {
      const cur = p.currency || 'USD';
      if (!map[cur]) map[cur] = { confirmed: 0, pending: 0 };
      if (p.status === 'confirmado') map[cur].confirmed += p.amount;
      if (p.status === 'pendiente_confirmacion_manual') map[cur].pending += p.amount;
    }
    return map;
  }, [clientPayments]);

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subClientId || !subAppId || !subPlanName) return;

    try {
      await onSaveSubscription({
        id: `sub-${Date.now()}`,
        clientId: subClientId,
        appId: subAppId,
        planId: subPlanId || `plan-${Date.now()}`,
        ledgerEnabled: subLedgerEnabled && subInterval !== 'prueba',
        planName: subPlanName,
        currency: subCurrency,
        agreedAmount: subAmount,
        billingInterval: subInterval,
        startDate: subStartDate,
        renewalDate: subRenewalDate,
        status: subStatus
      });
      setIsSubModalOpen(false);
    } catch (err: any) {
      alert(`Error al registrar suscripción: ${err.message}`);
    }
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payClientId || !payAmount || !payCurrency) return;

    try {
      await onSavePayment({
        clientId: payClientId,
        subscriptionId: paySubscriptionId || undefined,
        appId: payAppId,
        amount: Number(payAmount),
        currency: payCurrency,
        method: payMethod,
        referenceNumber: payRef,
        paymentDate: payDate,
        status: 'pendiente_confirmacion_manual' // Always starts as pending manual audit
      });
      setIsPaymentModalOpen(false);
      setPayRef('');
    } catch (err: any) {
      alert(`Error al registrar cobro: ${err.message}`);
    }
  };

  const handleExecuteReview = async (decision: 'confirmado' | 'rechazado') => {
    if (!reviewingPayment) return;
    try {
      await onReviewPayment(reviewingPayment.id, {
        status: decision,
        auditorNote,
        reviewedBy: auditorName
      });
      setReviewingPayment(null);
      setAuditorNote('');
    } catch (err: any) {
      alert(`Error al auditar pago: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <span>Clientes y pagos</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestión multi-aplicación por cliente. En esta fase la revisión y confirmación de cobros es 100% manual por auditoría.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (selectedClient) setSubClientId(selectedClient.id);
                setIsSubModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600" />
              <span>Registrar suscripción</span>
            </button>

            <button
              onClick={() => {
                if (selectedClient) setPayClientId(selectedClient.id);
                setIsPaymentModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <DollarSign className="w-4 h-4" />
              <span>Informar pago recibido</span>
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-xs">
          <button
            onClick={() => setActiveTab('cta_corriente')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'cta_corriente'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Cuenta Corriente por Cliente
          </button>
          <button
            onClick={() => setActiveTab('todos_los_cobros')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'todos_los_cobros'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Auditoría Global de Cobros ({payments.length})
          </button>
        </div>
      </div>

      {activeTab === 'cta_corriente' ? (
        /* Main 2-columns: Client List (4 cols) & Client Ledger (8 cols) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Client selector (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Clientes registrados ({displayedClients.length})
            </h2>

            {displayedClients.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-lg">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p>No hay clientes convertidos aún.</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  En la solapa Contactos podés presionar "Convertir a Cliente Oficial" manteniendo todo su historial.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {displayedClients.map(client => {
                  const isSelected = selectedClient?.id === client.id;
                  const clientSubs = subscriptions.filter(s => s.clientId === client.id);

                  return (
                    <div
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-400'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h3 className="font-extrabold text-sm text-slate-900">{client.orgName}</h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {clientSubs.length} apps
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{client.contactPerson || client.email}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                        <span>{client.country || 'Sin país'}</span>
                        <span className="text-emerald-700 font-bold">Cliente activo</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Client Ledger & Subscriptions (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            {selectedClient ? (
              <>
                {/* Client Profile Header */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Cuenta de Cliente
                      </span>
                      <h2 className="text-lg font-black text-slate-900">{selectedClient.orgName}</h2>
                      <p className="text-xs text-slate-600">
                        Contacto: {selectedClient.contactPerson} · {selectedClient.email} · {selectedClient.phone}
                      </p>
                    </div>

                    {/* Currency Balances Callouts (Separated, NEVER mixed) */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.keys(clientBalancesByCurrency).length === 0 ? (
                        <span className="text-slate-400 text-xs italic">Sin cobros registrados</span>
                      ) : (
                        Object.keys(clientBalancesByCurrency).map(cur => (
                          <div key={cur} className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                            <span className="text-[10px] text-emerald-800 font-bold block">{cur} Confirmado:</span>
                            <span className="text-sm font-extrabold text-emerald-950">
                              {cur} {clientBalancesByCurrency[cur].confirmed.toLocaleString('es', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Multi-app Subscriptions section */}
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Suscripciones Contratadas ({clientSubscriptions.length})
                      </span>
                      <button
                        onClick={() => {
                          setSubClientId(selectedClient.id);
                          setIsSubModalOpen(true);
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800"
                      >
                        + Agregar suscripción de otra app
                      </button>
                    </div>

                    {clientSubscriptions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay suscripciones activas registradas para este cliente.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {clientSubscriptions.map(sub => {
                          const app = applications.find(a => a.id === sub.appId);
                          return (
                            <div key={sub.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="font-extrabold text-slate-900">{app?.name}</span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                    sub.status === 'activa'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : sub.status === 'en_prueba'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {sub.status.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="font-semibold text-slate-700">{sub.planName}</p>
                              <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60 mt-1">
                                <span>Importe acordado:</span>
                                <span className="font-black text-slate-900">
                                  {sub.currency} {sub.agreedAmount} / {sub.billingInterval}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {onReconcileLedger && onVoidCharge && onAssignPayment && <AccountLedgerPanel clientId={selectedClient.id} charges={accountCharges.filter(c => selectedAppFilter === 'all' || c.appId === selectedAppFilter)} payments={clientPayments} subscriptions={clientSubscriptions} applications={applications} onReconcile={onReconcileLedger} onVoid={onVoidCharge} onAssign={onAssignPayment} onSaveSubscription={onSaveSubscription}/>}
                {/* Payments & Receipts Ledger */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Historial de Cobros y Comprobantes
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Cada pago debe auditarse manualmente contra extracto bancario o pasarela.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setPayClientId(selectedClient.id);
                        setIsPaymentModalOpen(true);
                      }}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                    >
                      + Registrar cobro recibido
                    </button>
                  </div>

                  {clientPayments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No hay pagos registrados para este cliente.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-x-auto text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="p-2.5">Fecha</th>
                            <th className="p-2.5">Aplicación</th>
                            <th className="p-2.5">Importe</th>
                            <th className="p-2.5">Método / Ref</th>
                            <th className="p-2.5">Estado</th>
                            <th className="p-2.5 text-right">Auditoría</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {clientPayments.map(pay => {
                            const app = applications.find(a => a.id === pay.appId);
                            const isPending = pay.status === 'pendiente_confirmacion_manual';

                            return (
                              <tr key={pay.id} className="hover:bg-slate-50/80">
                                <td className="p-2.5 text-slate-600">{pay.paymentDate}</td>
                                <td className="p-2.5 font-bold text-slate-800">{app?.name || 'App'}</td>
                                <td className="p-2.5 font-black text-slate-900">
                                  {pay.currency} {pay.amount.toLocaleString('es', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-2.5">
                                  <span className="capitalize text-slate-700">{pay.method.replace('_', ' ')}</span>
                                  {pay.referenceNumber && (
                                    <span className="block font-mono text-[10px] text-slate-400">
                                      Ref: {pay.referenceNumber}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  <span
                                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                                      pay.status === 'confirmado'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : pay.status === 'rechazado'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                                    }`}
                                  >
                                    {pay.status === 'pendiente_confirmacion_manual'
                                      ? 'Pendiente de auditoría'
                                      : pay.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right">
                                  {isPending ? (
                                    <button
                                      onClick={() => setReviewingPayment(pay)}
                                      className="px-2.5 py-1 bg-amber-600 text-white rounded font-bold text-[10px] hover:bg-amber-700 shadow-2xs"
                                    >
                                      Auditar pago
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">
                                      {pay.reviewedBy || 'Auditado'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
                Seleccioná un cliente de la lista para ver sus suscripciones y cuenta corriente.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Global Payments Auditor Table */
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Auditoría Global de Cobros (Todos los Clientes)
              </h2>
              <p className="text-xs text-slate-500">
                Verificación manual obligatoria de transferencias y comprobantes de pago.
              </p>
            </div>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
            >
              + Registrar cobro recibido
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">Fecha</th>
                  <th className="p-2.5">Cliente</th>
                  <th className="p-2.5">Aplicación</th>
                  <th className="p-2.5">Importe</th>
                  <th className="p-2.5">Método / Referencia</th>
                  <th className="p-2.5">Estado</th>
                  <th className="p-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {payments.map(pay => {
                  const client = clients.find(c => c.id === pay.clientId);
                  const app = applications.find(a => a.id === pay.appId);
                  const isPending = pay.status === 'pendiente_confirmacion_manual';

                  return (
                    <tr key={pay.id} className="hover:bg-slate-50/80">
                      <td className="p-2.5 text-slate-600">{pay.paymentDate}</td>
                      <td className="p-2.5 font-extrabold text-slate-900">{client?.orgName || pay.clientId}</td>
                      <td className="p-2.5 font-bold text-slate-800">{app?.name || 'App'}</td>
                      <td className="p-2.5 font-black text-slate-900">
                        {pay.currency} {pay.amount.toLocaleString('es', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5">
                        <span className="capitalize text-slate-700">{pay.method.replace('_', ' ')}</span>
                        {pay.referenceNumber && (
                          <span className="block font-mono text-[10px] text-slate-400">
                            Ref: {pay.referenceNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            pay.status === 'confirmado'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pay.status === 'rechazado'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {pay.status === 'pendiente_confirmacion_manual' ? 'Pendiente' : pay.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        {isPending ? (
                          <button
                            onClick={() => setReviewingPayment(pay)}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded font-bold text-[10px] hover:bg-amber-700 shadow-2xs"
                          >
                            Auditar
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">✓ Auditado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Subscription */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-extrabold text-slate-900">Registrar Nueva Suscripción</h3>
              <button onClick={() => setIsSubModalOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleCreateSubscription} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Cliente *</label>
                <select
                  value={subClientId}
                  onChange={e => setSubClientId(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.orgName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Aplicación Comercial *</label>
                <select
                  value={subAppId}
                  onChange={e => { setSubAppId(e.target.value); setSubPlanId(''); setSubPlanName(''); setSubAmount(0); }}
                  className="w-full border rounded p-2"
                >
                  {applications.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <label className="block text-xs font-semibold">Plan del catálogo<select className="w-full border rounded p-2 mt-1" value={subPlanId} onChange={e => {
                const plan = applications.find(a => a.id === subAppId)?.plans.find(p => p.id === e.target.value);
                setSubPlanId(e.target.value);
                if (plan && plan.price !== null) { setSubPlanName(plan.name); setSubAmount(plan.price); setSubCurrency(plan.currency); if (plan.interval !== 'por_definir') setSubInterval(plan.interval); }
              }}><option value="">Importe acordado con el cliente</option>{applications.find(a => a.id === subAppId)?.plans.filter(p => p.verified && !p.archived && p.price !== null).map(p => <option key={p.id} value={p.id}>{p.name} · {p.currency} {p.price} / {p.interval}</option>)}</select></label>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre del Plan *</label>
                <input
                  type="text"
                  required
                  value={subPlanName}
                  onChange={e => setSubPlanName(e.target.value)}
                  className="w-full border rounded p-2 font-bold"
                  placeholder="Club Pro / Agency / etc."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Moneda *</label>
                  <select
                    value={subCurrency}
                    onChange={e => setSubCurrency(e.target.value)}
                    className="w-full border rounded p-2 font-bold"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                    <option value="ARS">ARS</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Importe Acordado *</label>
                  <input
                    type="number"
                    required
                    value={subAmount}
                    min={subInterval === 'prueba' ? '0' : '0.01'} step="0.01"
                    onChange={e => setSubAmount(Number(e.target.value))}
                    className="w-full border rounded p-2 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Período Contratado</label>
                  <select
                    value={subInterval}
                    onChange={e => setSubInterval(e.target.value as any)}
                    className="w-full border rounded p-2"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="unico">Pago único</option>
                    <option value="prueba">Prueba gratuita</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Estado Inicial</label>
                  <select
                    value={subStatus}
                    onChange={e => setSubStatus(e.target.value as any)}
                    className="w-full border rounded p-2 font-bold"
                  >
                    <option value="activa">Activa</option>
                    <option value="en_prueba">En prueba</option>
                    <option value="vencida">Vencida</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs"><label>Inicio<input required type="date" className="w-full border rounded p-2 mt-1" value={subStartDate} onChange={e => setSubStartDate(e.target.value)}/></label><label>Próxima renovación / fin de prueba<input required type="date" min={subStartDate} className="w-full border rounded p-2 mt-1" readOnly={subLedgerEnabled && subInterval !== 'prueba'} value={subRenewalDate} onChange={e => setSubRenewalDate(e.target.value)}/></label></div>
              <label className="flex items-start gap-3 text-xs"><input type="checkbox" checked={subLedgerEnabled && subInterval !== 'prueba'} disabled={subInterval === 'prueba'} onChange={e => setSubLedgerEnabled(e.target.checked)}/><span>Registrar vencimientos automáticamente desde hoy. No realiza débitos ni confirma pagos.</span></label>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsSubModalOpen(false)}
                  className="px-4 py-2 border rounded text-slate-600 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700"
                >
                  Registrar Suscripción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Payment Received */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-extrabold text-slate-900">Registrar Cobro Recibido</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleCreatePayment} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Cliente *</label>
                <select
                  value={payClientId}
                  onChange={e => { setPayClientId(e.target.value); setPaySubscriptionId(''); }}
                  className="w-full border rounded p-2"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.orgName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Aplicación Comercial *</label>
                <select
                  value={payAppId}
                  onChange={e => { setPayAppId(e.target.value); setPaySubscriptionId(''); }}
                  className="w-full border rounded p-2"
                >
                  {applications.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <label className="block text-xs font-semibold">Aplicar a suscripción<select className="w-full border rounded p-2 mt-1" value={paySubscriptionId} onChange={e => setPaySubscriptionId(e.target.value)}><option value="">Sin asignar por ahora</option>{subscriptions.filter(s => s.clientId === payClientId && s.appId === payAppId && s.currency === payCurrency).map(s => <option key={s.id} value={s.id}>{s.planName}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Moneda *</label>
                  <select
                    value={payCurrency}
                    onChange={e => { setPayCurrency(e.target.value); setPaySubscriptionId(''); }}
                    className="w-full border rounded p-2 font-bold"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                    <option value="ARS">ARS</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Importe Cobrado *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payAmount}
                    onChange={e => setPayAmount(Number(e.target.value))}
                    className="w-full border rounded p-2 font-black text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Método de Cobro</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full border rounded p-2"
                  >
                    <option value="transferencia_bancaria">Transferencia Bancaria</option>
                    <option value="stripe">Stripe</option>
                    <option value="mercadopago">Mercado Pago</option>
                    <option value="tarjeta">Tarjeta de Crédito</option>
                    <option value="efectivo">Efectivo / Caja</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Fecha de Operación</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full border rounded p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  N° Comprobante / Referencia de Transferencia
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="Ej. OP-994821 / TX-BRL-882"
                  className="w-full border rounded p-2 font-mono text-xs"
                />
              </div>

              <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-amber-900 text-[11px]">
                ℹ️ El cobro se registrará en estado <strong>"Pendiente de confirmación manual"</strong> para que el auditor verifique los fondos antes de impactarlo en firme.
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 border rounded text-slate-600 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700"
                >
                  Registrar Cobro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Audit Review Workflow for Payment */}
      {reviewingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b pb-2 text-slate-900 font-extrabold text-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Auditoría y Confirmación Manual de Pago</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex justify-between font-black text-sm text-slate-900">
                <span>Importe declarado:</span>
                <span className="text-emerald-700">
                  {reviewingPayment.currency} {reviewingPayment.amount.toFixed(2)}
                </span>
              </div>
              <p className="text-slate-600">Método: {reviewingPayment.method.replace('_', ' ')}</p>
              <p className="font-mono text-slate-500">
                Comprobante / Ref: {reviewingPayment.referenceNumber || 'Sin número'}
              </p>
              <p className="text-slate-400 text-[10px]">Fecha declarada: {reviewingPayment.paymentDate}</p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Nombre del Auditor *</label>
              <input
                type="text"
                value={auditorName}
                onChange={e => setAuditorName(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Nota de Auditoría / Verificación bancaria
              </label>
              <textarea
                rows={2}
                value={auditorNote}
                onChange={e => setAuditorNote(e.target.value)}
                placeholder="Verificado con extracto bancario del día..."
                className="w-full border rounded p-2 text-xs"
              />
            </div>

            <div className="pt-3 border-t flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setReviewingPayment(null)}
                className="px-3 py-2 border rounded text-slate-600"
              >
                Volver
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => handleExecuteReview('rechazado')}
                  className="px-3.5 py-2 bg-rose-600 text-white font-bold rounded hover:bg-rose-700"
                >
                  Rechazar pago
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteReview('confirmado')}
                  className="px-4 py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700"
                >
                  ✓ Confirmar e Impactar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

