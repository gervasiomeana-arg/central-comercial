import React, { useState } from 'react';
import {
  Layers,
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Edit2,
  Save,
  X,
  FileText,
  DollarSign,
  HelpCircle,
  ShieldAlert,
  Globe
} from 'lucide-react';
import type { Application, PlanItem, FaqItem } from '../types.js';

interface ApplicationsViewProps {
  applications: Application[];
  onSaveApplication: (app: Application) => Promise<void>;
  selectedAppFilter: string;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  onSaveApplication,
  selectedAppFilter,
}) => {
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // New application empty template
  const createEmptyApp = (): Application => ({
    id: `app-custom-${Date.now()}`,
    name: '',
    slug: '',
    description: '',
    targetAudience: '',
    countries: ['Argentina', 'España', 'México'],
    languages: ['es'],
    website: '',
    verifiedFeatures: [''],
    trialAvailable: true,
    trialVerified: false,
    trialDurationDays: null,
    plans: [
      {
        id: `plan-${Date.now()}`,
        name: 'Estándar (Borrador)',
        price: null,
        currency: 'USD',
        interval: 'mensual',
        features: ['Característica principal'],
        verified: false,
        verificationNotes: 'Plan en borrador. Pendiente de verificación por la dirección.'
      }
    ],
    registerUrl: '',
    paymentUrl: '',
    faqs: [
      {
        id: `faq-${Date.now()}`,
        question: '¿Cómo funciona el servicio?',
        answer: 'Respuesta comercial en revisión...',
        approved: false,
        verified: false,
        verificationNotes: 'FAQ en borrador. Requiere aprobación para usarse en IA y mensajes.'
      }
    ],
    promotionalMaterials: [],
    status: 'en_desarrollo',
    campaignsAllowed: false,
    internalNotes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const handleStartEdit = (app: Application) => {
    setEditingApp(JSON.parse(JSON.stringify(app)));
    setIsCreatingNew(false);
  };

  const handleStartCreate = () => {
    setEditingApp(createEmptyApp());
    setIsCreatingNew(true);
  };

  const handleSave = async () => {
    if (!editingApp || !editingApp.name) return;
    setSaving(true);
    try {
      // Funeraria safety guardrail
      if (editingApp.id === 'app-funeraria' || editingApp.slug === 'funeraria') {
        if (editingApp.status === 'en_desarrollo') {
          editingApp.campaignsAllowed = false;
        }
      }
      await onSaveApplication(editingApp);
      setSaveSuccessMessage(`Ficha de "${editingApp.name}" guardada con éxito.`);
      setEditingApp(null);
      setIsCreatingNew(false);
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`Error al guardar aplicación: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Helper for adding/editing plan
  const handleAddPlan = () => {
    if (!editingApp) return;
    const newPlan: PlanItem = {
      id: `plan-${Date.now()}`,
      name: 'Nuevo Plan (Borrador)',
      price: null,
      currency: 'USD',
      interval: 'mensual',
      features: ['Característica 1'],
      verified: false,
      verificationNotes: 'Plan en borrador. Pendiente de verificación por la dirección.'
    };
    setEditingApp({
      ...editingApp,
      plans: [...editingApp.plans, newPlan]
    });
  };

  const handleRemovePlan = (index: number) => {
    if (!editingApp) return;
    const updated = [...editingApp.plans];
    updated.splice(index, 1);
    setEditingApp({ ...editingApp, plans: updated });
  };

  // Helper for adding FAQ
  const handleAddFaq = () => {
    if (!editingApp) return;
    const newFaq: FaqItem = {
      id: `faq-${Date.now()}`,
      question: '',
      answer: '',
      approved: false,
      verified: false,
      verificationNotes: 'FAQ en borrador. Requiere aprobación para usarse en IA y mensajes.'
    };
    setEditingApp({
      ...editingApp,
      faqs: [...editingApp.faqs, newFaq]
    });
  };

  const handleRemoveFaq = (index: number) => {
    if (!editingApp) return;
    const updated = [...editingApp.faqs];
    updated.splice(index, 1);
    setEditingApp({ ...editingApp, faqs: updated });
  };

  const displayedApps = selectedAppFilter === 'all'
    ? applications
    : applications.filter(a => a.id === selectedAppFilter);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>Fichas de Aplicaciones Comerciales</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configuración oficial de precios, funcionalidades aprobadas, FAQs autorizadas y estado de campañas.
          </p>
        </div>

        <button
          onClick={handleStartCreate}
          className="px-3.5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center space-x-1.5 transition-colors self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar aplicación</span>
        </button>
      </div>

      {saveSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Applications Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {displayedApps.map(app => {
          const isFuneraria = app.id === 'app-funeraria' || app.slug === 'funeraria';
          const isNeuro = app.id === 'app-neuroplaneta' || app.slug === 'neuroplaneta';

          return (
            <div
              key={app.id}
              className={`bg-white border rounded-xl shadow-xs overflow-hidden flex flex-col justify-between transition-all ${
                isFuneraria ? 'border-amber-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-5">
                {/* Header card with status badges */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">{app.name}</h2>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          app.status === 'en_desarrollo'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : app.status === 'lista'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {app.status === 'en_desarrollo'
                          ? 'En desarrollo'
                          : app.status === 'lista'
                          ? 'Lista para campaña'
                          : 'Pausada'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 mt-1 text-xs">
                      {app.website.startsWith('http') ? (
                        <a
                          href={app.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center space-x-1 font-semibold"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>{app.website}</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Sitio web: {app.website || 'Pendiente de configurar'}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartEdit(app)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center space-x-1 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                </div>

                <p className="text-xs text-slate-600 mt-3 leading-relaxed">{app.description}</p>

                {/* Funeraria Guardrail Warning Box */}
                {isFuneraria && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold">
                      <Lock className="w-4 h-4 text-amber-700" />
                      <span>POLÍTICA DE LANZAMIENTO ESTRICTA</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      Software funerario en desarrollo activo. Las campañas comerciales se encuentran estrictamente bloqueadas hasta completar su información técnica y autorizar su lanzamiento formal.
                    </p>
                  </div>
                )}

                {/* NeuroPlaneta Health Disclaimer Box */}
                {isNeuro && (
                  <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold">
                      <ShieldAlert className="w-4 h-4 text-blue-700" />
                      <span>PAUTA INFRANQUEABLE DE COMUNICACIÓN</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-blue-800">
                      NeuroPlaneta ofrece actividades y juegos para niños acompañados de adultos. <strong>Bajo ningún concepto debe presentarse como herramienta de diagnóstico ni tratamiento médico o psicológico.</strong>
                    </p>
                  </div>
                )}

                {/* Target Audience & Target Countries */}
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Público objetivo</span>
                    <span className="text-slate-700 font-medium">{app.targetAudience || 'No definido'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Países e Idiomas</span>
                    <span className="text-slate-700 font-medium">
                      {app.countries.join(', ')} ({app.languages.join(', ')})
                    </span>
                  </div>
                </div>

                {/* Verified features list */}
                <div className="mt-3 text-xs">
                  <span className="text-slate-400 font-semibold uppercase text-[10px] block mb-1">
                    Funcionalidades verificadas en producción
                  </span>
                  <ul className="space-y-1">
                    {app.verifiedFeatures.map((feat, idx) => (
                      <li key={idx} className="flex items-start space-x-1.5 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plans & Pricing Summary with Verification Status */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">
                      Planes y Precios
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      app.trialVerified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}>
                      {app.trialVerified ? `✓ Prueba verificada: ${app.trialDurationDays}d` : '⚠️ Prueba NO verificada'}
                    </span>
                  </div>

                  {app.plans.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay planes configurados todavía.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {app.plans.map(p => (
                        <div
                          key={p.id}
                          className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                            p.verified
                              ? 'bg-emerald-50/30 border-emerald-300'
                              : 'bg-amber-50/40 border-amber-300'
                          }`}
                        >
                          <div className="flex justify-between items-start font-bold">
                            <span className="text-slate-900">{p.name}</span>
                            <span className={p.verified ? 'text-emerald-700 font-extrabold' : 'text-amber-800'}>
                              {p.price !== null ? `${p.currency} ${p.price} / ${p.interval}` : 'Por cotizar'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              p.verified
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}>
                              {p.verified ? '✓ Verificado oficial' : '⚠️ No verificado (Excluido)'}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1">
                            {p.features.join(' · ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Approved FAQs Count */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span className="flex items-center space-x-1">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Base de conocimiento IA:</span>
                  </span>
                  <div className="flex space-x-1 text-[11px]">
                    <span className="font-bold text-emerald-700">
                      {app.faqs.filter(f => f.approved && f.verified).length} aprobadas
                    </span>
                    <span>·</span>
                    <span className="text-amber-700 font-medium">
                      {app.faqs.filter(f => !f.verified).length} en revisión
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[11px]">
                  Enlace registro: {app.registerUrl.startsWith('http') ? 'Configurado' : 'Pendiente'}
                </span>
                <button
                  onClick={() => handleStartEdit(app)}
                  className="font-bold text-blue-600 hover:text-blue-800"
                >
                  Configurar condiciones →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Drawer for Editing or Creating Application */}
      {editingApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {isCreatingNew ? 'Agregar Nueva Aplicación Comercial' : `Editar Ficha: ${editingApp.name}`}
                </h3>
                <p className="text-xs text-slate-500">
                  Toda la información aquí definida alimenta la base de conocimiento estricta del Asistente Comercial IA.
                </p>
              </div>
              <button
                onClick={() => setEditingApp(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre Comercial *</label>
                  <input
                    type="text"
                    value={editingApp.name}
                    onChange={e => setEditingApp({ ...editingApp, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500"
                    placeholder="Ej. Open Voley"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Slug / Identificador *</label>
                  <input
                    type="text"
                    value={editingApp.slug}
                    onChange={e => setEditingApp({ ...editingApp, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="ej. open-voley"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Descripción Comercial Oficial</label>
                <textarea
                  rows={2}
                  value={editingApp.description}
                  onChange={e => setEditingApp({ ...editingApp, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500"
                  placeholder="Resumen del valor que aporta la aplicación a sus clientes..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sitio Web Oficial</label>
                  <input
                    type="text"
                    value={editingApp.website}
                    onChange={e => setEditingApp({ ...editingApp, website: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500"
                    placeholder="https://openvoley.com"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Estado de la Aplicación</label>
                  <select
                    value={editingApp.status}
                    onChange={e => {
                      const newStatus = e.target.value as Application['status'];
                      setEditingApp({
                        ...editingApp,
                        status: newStatus,
                        // If funeraria or en_desarrollo, enforce campaign locking
                        campaignsAllowed: newStatus === 'en_desarrollo' ? false : editingApp.campaignsAllowed
                      });
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="en_desarrollo">En desarrollo (Campañas bloqueadas)</option>
                    <option value="lista">Lista para campaña</option>
                    <option value="pausada">Pausada</option>
                  </select>
                </div>
              </div>

              {/* Strict Disclaimer for Funeraria or NeuroPlaneta */}
              {editingApp.slug === 'funeraria' && editingApp.status === 'en_desarrollo' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Funeraria se mantendrá con campañas estrictamente desactivadas mientras permanezca "En desarrollo".
                  </span>
                </div>
              )}

              {editingApp.slug === 'neuroplaneta' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Aviso Legal y Limitación Médica (Obligatorio)
                  </label>
                  <input
                    type="text"
                    value={editingApp.medicalDisclaimer || ''}
                    onChange={e => setEditingApp({ ...editingApp, medicalDisclaimer: e.target.value })}
                    className="w-full border border-blue-300 rounded-lg p-2 text-xs text-blue-900 bg-blue-50/50"
                  />
                </div>
              )}

              {/* Target Audience & Countries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Público Objetivo</label>
                  <input
                    type="text"
                    value={editingApp.targetAudience}
                    onChange={e => setEditingApp({ ...editingApp, targetAudience: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    placeholder="Entrenadores, directores deportivos, clubes..."
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Países (separados por coma)</label>
                  <input
                    type="text"
                    value={editingApp.countries.join(', ')}
                    onChange={e => setEditingApp({
                      ...editingApp,
                      countries: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    placeholder="Brasil, Argentina, España..."
                  />
                </div>
              </div>

              {/* Trial Period with Official Verification Toggle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">¿Ofrece prueba gratuita inicial?</span>
                    <span className="text-[11px] text-slate-500">Permite registrar prospectos en fase de evaluación sin cargo.</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={editingApp.trialAvailable}
                      onChange={e => setEditingApp({ ...editingApp, trialAvailable: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    {editingApp.trialAvailable && (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={editingApp.trialDurationDays || 14}
                          onChange={e => setEditingApp({ ...editingApp, trialDurationDays: Number(e.target.value) })}
                          className="w-16 border border-slate-300 rounded p-1 text-xs text-center"
                        />
                        <span className="text-slate-600">días</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="modalTrialVerified"
                    checked={editingApp.trialVerified}
                    onChange={e => setEditingApp({ ...editingApp, trialVerified: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <label htmlFor="modalTrialVerified" className={`text-xs font-bold cursor-pointer ${
                    editingApp.trialVerified ? 'text-emerald-800' : 'text-amber-800'
                  }`}>
                    {editingApp.trialVerified
                      ? '✓ Período de prueba verificado y autorizado formalmente'
                      : '⚠️ Período de prueba NO verificado (la IA y mensajes no prometerán días de prueba)'}
                  </label>
                </div>
              </div>

              {/* Plans Section */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">Planes y Precios Oficiales</span>
                    <p className="text-[11px] text-slate-500">
                      Solo los planes marcados como "Verificados" se utilizarán en IA y automatizaciones.
                    </p>
                  </div>
                  <button
                    onClick={handleAddPlan}
                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar plan</span>
                  </button>
                </div>

                {editingApp.plans.map((plan, idx) => (
                  <div key={plan.id || idx} className={`p-3 border rounded-lg space-y-2 ${
                    plan.verified ? 'bg-emerald-50/20 border-emerald-300' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={plan.name}
                        onChange={e => {
                          const updated = [...editingApp.plans];
                          updated[idx].name = e.target.value;
                          setEditingApp({ ...editingApp, plans: updated });
                        }}
                        className="border border-slate-300 rounded p-1.5 text-xs font-bold"
                        placeholder="Nombre del plan"
                      />
                      <div className="flex items-center space-x-1">
                        <select
                          value={plan.currency}
                          onChange={e => {
                            const updated = [...editingApp.plans];
                            updated[idx].currency = e.target.value;
                            setEditingApp({ ...editingApp, plans: updated });
                          }}
                          className="border border-slate-300 rounded p-1.5 text-xs font-semibold"
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="BRL">BRL</option>
                          <option value="ARS">ARS</option>
                        </select>
                        <input
                          type="number"
                          value={plan.price !== null ? plan.price : ''}
                          onChange={e => {
                            const updated = [...editingApp.plans];
                            updated[idx].price = e.target.value === '' ? null : Number(e.target.value);
                            setEditingApp({ ...editingApp, plans: updated });
                          }}
                          className="border border-slate-300 rounded p-1.5 text-xs font-bold w-20"
                          placeholder="Precio"
                        />
                      </div>
                      <select
                        value={plan.interval}
                        onChange={e => {
                          const updated = [...editingApp.plans];
                          updated[idx].interval = e.target.value as any;
                          setEditingApp({ ...editingApp, plans: updated });
                        }}
                        className="border border-slate-300 rounded p-1.5 text-xs"
                      >
                        <option value="mensual">Mensual</option>
                        <option value="anual">Anual</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="unico">Pago único</option>
                        <option value="por_definir">Por definir</option>
                      </select>
                      <button
                        onClick={() => handleRemovePlan(idx)}
                        className="text-rose-600 hover:text-rose-800 text-xs font-bold self-center text-right"
                      >
                        Eliminar
                      </button>
                    </div>

                    <input
                      type="text"
                      value={plan.features.join(', ')}
                      onChange={e => {
                        const updated = [...editingApp.plans];
                        updated[idx].features = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        setEditingApp({ ...editingApp, plans: updated });
                      }}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs"
                      placeholder="Características (separadas por coma)..."
                    />

                    {/* Verification Toggle */}
                    <div className="pt-1 flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`planVer-${idx}`}
                        checked={plan.verified}
                        onChange={e => {
                          const updated = [...editingApp.plans];
                          updated[idx].verified = e.target.checked;
                          updated[idx].verificationNotes = e.target.checked ? 'Verificado por administrador' : 'No verificado';
                          setEditingApp({ ...editingApp, plans: updated });
                        }}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <label htmlFor={`planVer-${idx}`} className={`text-[11px] font-bold cursor-pointer ${
                        plan.verified ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        {plan.verified
                          ? '✓ Plan Verificado y Autorizado para Automatizaciones'
                          : '⚠️ No verificado (Conservar para revisión sin usar en IA ni campañas)'}
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* FAQs Section (AI Knowledge Base) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">
                      Preguntas y Respuestas Oficiales Aprobadas
                    </span>
                    <p className="text-[11px] text-slate-500">
                      La IA responderá ÚNICAMENTE con estas respuestas comerciales.
                    </p>
                  </div>
                  <button
                    onClick={handleAddFaq}
                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar FAQ</span>
                  </button>
                </div>

                {editingApp.faqs.map((faq, idx) => (
                  <div key={faq.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 text-[11px]">Pregunta #{idx + 1}</span>
                      <button
                        onClick={() => handleRemoveFaq(idx)}
                        className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                      >
                        Eliminar
                      </button>
                    </div>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={e => {
                        const updated = [...editingApp.faqs];
                        updated[idx].question = e.target.value;
                        setEditingApp({ ...editingApp, faqs: updated });
                      }}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs font-semibold"
                      placeholder="¿Pregunta frecuente del prospecto?"
                    />
                    <textarea
                      rows={2}
                      value={faq.answer}
                      onChange={e => {
                        const updated = [...editingApp.faqs];
                        updated[idx].answer = e.target.value;
                        setEditingApp({ ...editingApp, faqs: updated });
                      }}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs"
                      placeholder="Respuesta oficial autorizada..."
                    />

                    {/* FAQ Official Verification Toggle */}
                    <div className="pt-1 flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`faqVer-${idx}`}
                        checked={Boolean(faq.verified && faq.approved)}
                        onChange={e => {
                          const updated = [...editingApp.faqs];
                          updated[idx].verified = e.target.checked;
                          updated[idx].approved = e.target.checked;
                          updated[idx].verificationNotes = e.target.checked
                            ? 'Respuesta verificada y autorizada para respuestas comerciales e IA.'
                            : 'Respuesta no verificada oficialmente. Excluida de automatizaciones e IA.';
                          setEditingApp({ ...editingApp, faqs: updated });
                        }}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <label htmlFor={`faqVer-${idx}`} className={`text-[11px] font-bold cursor-pointer ${
                        faq.verified && faq.approved ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        {faq.verified && faq.approved
                          ? '✓ FAQ Aprobada y Verificada Oficialmente (Activa para IA y respuestas automáticas)'
                          : '⚠️ No verificada (Conservada para revisión; excluida de IA y respuestas)'}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setEditingApp(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={saving || !editingApp.name}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Guardando...' : 'Guardar ficha oficial'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
