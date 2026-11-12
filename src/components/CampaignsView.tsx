import React, { useState } from 'react';
import {
  Send,
  Plus,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle2,
  Calendar,
  Users,
  Settings,
  Edit2,
  FileText,
  Sliders,
  ShieldAlert,
  Globe
} from 'lucide-react';
import type { Campaign, Application, ConnectorInfo } from '../types.js';

interface CampaignsViewProps {
  campaigns: Campaign[];
  applications: Application[];
  connectors: ConnectorInfo[];
  onSaveCampaign: (campaign: Campaign) => Promise<void>;
  selectedAppFilter: string;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  applications,
  connectors,
  onSaveCampaign,
  selectedAppFilter,
}) => {
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [activeTabModal, setActiveTabModal] = useState<'general' | 'mensaje' | 'horarios' | 'seguimientos'>('general');
  const [saving, setSaving] = useState(false);

  const displayedCampaigns = selectedAppFilter === 'all'
    ? campaigns
    : campaigns.filter(c => c.appId === selectedAppFilter);

  const handleOpenCreate = () => {
    setIsCreatingNew(true);
    const newCamp: Campaign = {
      id: `camp-${Date.now()}`,
      appId: selectedAppFilter !== 'all' ? selectedAppFilter : 'app-open-voley',
      name: 'Nueva Campaña Comercial',
      objective: 'Presentar propuesta de valor y coordinar demostración',
      country: 'Brasil',
      language: 'pt-BR',
      segment: 'Clubes y federaciones',
      channels: ['email'],
      messageTemplate: 'Olá {nombre},\n\nGostaria de apresentar nossa plataforma para a equipe do {organizacion}.\n\nDisponibilizamos teste gratuito.\n\nPodemos agendar uma demonstração?',
      followUpTemplates: [
        'Olá {nombre}, tudo bem? Queria verificar se você pôde analisar a mensagem anterior.'
      ],
      timezone: 'America/Sao_Paulo',
      sendWindowStart: '09:00',
      sendWindowEnd: '18:00',
      dailyLimit: 20,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      maxFollowUps: 2,
      followUpIntervalDays: 4,
      stopCriteria: ['respuesta_recibida', 'solicitud_baja'],
      mode: 'revision_previa',
      status: 'borrador',
      stats: {
        contactsCount: 0,
        messagesPending: 0,
        messagesSent: 0,
        messagesFailed: 0,
        messagesUnknown: 0,
        responsesReceived: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingCampaign(newCamp);
    setActiveTabModal('general');
  };

  const handleOpenEdit = (camp: Campaign) => {
    setIsCreatingNew(false);
    setEditingCampaign(JSON.parse(JSON.stringify(camp)));
    setActiveTabModal('general');
  };

  const handleSave = async () => {
    if (!editingCampaign || !editingCampaign.name) return;
    setSaving(true);
    try {
      await onSaveCampaign(editingCampaign);
      setEditingCampaign(null);
    } catch (err: any) {
      alert(`Error al guardar campaña: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Send className="w-5 h-5 text-blue-600" />
            <span>Campañas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Definición de objetivos, ventanas horarias por huso horario del destinatario, plantillas de mensajes y bloqueos de seguridad.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-3.5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center space-x-1.5 transition-colors self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Crear nueva campaña</span>
        </button>
      </div>

      {/* Campaigns list cards */}
      <div className="space-y-4">
        {displayedCampaigns.map(camp => {
          const app = applications.find(a => a.id === camp.appId);
          const isFuneraria = app?.id === 'app-funeraria' || app?.slug === 'funeraria';
          const isBlocked = camp.status === 'bloqueada_por_configuracion';

          return (
            <div
              key={camp.id}
              className={`bg-white border rounded-xl p-5 shadow-xs transition-all ${
                isBlocked ? 'border-amber-300' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      {app?.name || 'Aplicación'}
                    </span>

                    <h2 className="text-base font-black text-slate-900 tracking-tight">{camp.name}</h2>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        camp.status === 'activa'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : camp.status === 'bloqueada_por_configuracion'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : camp.status === 'pausada'
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {camp.status.replace(/_/g, ' ')}
                    </span>

                    {/* Mode badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      Modo: {camp.mode === 'revision_previa' ? 'Revisión previa' : camp.mode === 'manual' ? 'Manual' : 'Automático'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{camp.objective}</p>

                  {/* Blocking Reason Callout */}
                  {isBlocked && (
                    <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-300 text-amber-900 text-xs flex items-start space-x-2">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Activación bloqueada por configuración:</span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          {camp.blockingReason || 'Faltan credenciales en los conectores de salida requeridos o la aplicación se encuentra en desarrollo.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Funeraria Guardrail Warning */}
                  {isFuneraria && (
                    <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 text-slate-600" />
                      <span>Software en desarrollo. Las campañas de Funeraria se mantendrán desactivadas hasta autorizar formalmente su lanzamiento.</span>
                    </div>
                  )}

                  {/* Operational Settings Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-slate-500">
                    <div>
                      <span className="block text-slate-400">Canales habilitados:</span>
                      <span className="font-semibold text-slate-800 capitalize">
                        {camp.channels.join(', ')}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Límite diario:</span>
                      <span className="font-semibold text-slate-800">{camp.dailyLimit} envíos / día</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Ventana horaria ({camp.timezone}):</span>
                      <span className="font-semibold text-slate-800">
                        {camp.sendWindowStart} a {camp.sendWindowEnd}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Seguimientos máx:</span>
                      <span className="font-semibold text-slate-800">
                        {camp.maxFollowUps} (cada {camp.followUpIntervalDays} días)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side stats & edit trigger */}
                <div className="lg:w-64 bg-slate-50 rounded-xl p-3 border border-slate-200/80 shrink-0 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Destinatarios registrados:</span>
                    <span className="font-bold text-slate-900">{camp.stats.contactsCount}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mensajes enviados reales:</span>
                    <span className="font-bold text-emerald-700">{camp.stats.messagesSent}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Respuestas recibidas:</span>
                    <span className="font-bold text-indigo-700">{camp.stats.responsesReceived}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <button
                      onClick={() => handleOpenEdit(camp)}
                      className="w-full py-1.5 px-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center space-x-1.5 shadow-2xs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar configuración</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Drawer for Campaign Configuration */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {isCreatingNew ? 'Configurar Nueva Campaña' : `Editar Campaña: ${editingCampaign.name}`}
                </h3>
                <p className="text-xs text-slate-500">
                  Configurá todos los parámetros de prospección, horarios del receptor y plantillas con variables.
                </p>
              </div>
              <button
                onClick={() => setEditingCampaign(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 gap-2 pt-2 text-xs font-semibold">
              <button
                onClick={() => setActiveTabModal('general')}
                className={`py-2 px-3 border-b-2 transition-colors ${
                  activeTabModal === 'general'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white rounded-t'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                1. General y Aplicación
              </button>
              <button
                onClick={() => setActiveTabModal('mensaje')}
                className={`py-2 px-3 border-b-2 transition-colors ${
                  activeTabModal === 'mensaje'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white rounded-t'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Plantilla de Mensaje
              </button>
              <button
                onClick={() => setActiveTabModal('horarios')}
                className={`py-2 px-3 border-b-2 transition-colors ${
                  activeTabModal === 'horarios'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white rounded-t'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                3. Horarios y Límites
              </button>
              <button
                onClick={() => setActiveTabModal('seguimientos')}
                className={`py-2 px-3 border-b-2 transition-colors ${
                  activeTabModal === 'seguimientos'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white rounded-t'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                4. Seguimientos y Criterios
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {activeTabModal === 'general' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Aplicación a Promover *</label>
                      <select
                        value={editingCampaign.appId}
                        onChange={e => setEditingCampaign({ ...editingCampaign, appId: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                      >
                        {applications.map(app => (
                          <option key={app.id} value={app.id}>
                            {app.name} ({app.status === 'en_desarrollo' ? 'En desarrollo' : 'Activa'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Nombre de la Campaña *</label>
                      <input
                        type="text"
                        value={editingCampaign.name}
                        onChange={e => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-semibold"
                        placeholder="Ej. Open Voley — Clubes de Brasil"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Objetivo Comercial</label>
                    <input
                      type="text"
                      value={editingCampaign.objective}
                      onChange={e => setEditingCampaign({ ...editingCampaign, objective: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2"
                      placeholder="Coordinar demostración de 10 min o activar prueba de 14 días..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">País Destino</label>
                      <input
                        type="text"
                        value={editingCampaign.country}
                        onChange={e => setEditingCampaign({ ...editingCampaign, country: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Idioma del Mensaje</label>
                      <select
                        value={editingCampaign.language}
                        onChange={e => setEditingCampaign({ ...editingCampaign, language: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      >
                        <option value="pt-BR">Portugués (Brasil)</option>
                        <option value="es">Español</option>
                        <option value="en">Inglés</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Segmento</label>
                      <input
                        type="text"
                        value={editingCampaign.segment}
                        onChange={e => setEditingCampaign({ ...editingCampaign, segment: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Estado de la Campaña</label>
                    <select
                      value={editingCampaign.status}
                      onChange={e => setEditingCampaign({ ...editingCampaign, status: e.target.value as any })}
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                    >
                      <option value="borrador">Borrador</option>
                      <option value="lista">Lista para revisión</option>
                      <option value="activa">Activa (Ejecutar envíos en ventana)</option>
                      <option value="pausada">Pausada</option>
                      <option value="finalizada">Finalizada</option>
                      <option value="bloqueada_por_configuracion">Bloqueada por configuración</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Modo de Envío</label>
                    <select
                      value={editingCampaign.mode}
                      onChange={e => setEditingCampaign({ ...editingCampaign, mode: e.target.value as any })}
                      className="w-full border border-slate-300 rounded-lg p-2"
                    >
                      <option value="revision_previa">Revisión previa (Generar borrador y esperar aprobación manual)</option>
                      <option value="manual">Manual (100% asistido por operador)</option>
                      <option value="automatico">Automático (Envíos autónomos en horario permitido)</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTabModal === 'mensaje' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs">
                    <span className="font-bold block mb-1">Variables dinámicas disponibles:</span>
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      <span className="bg-white px-2 py-0.5 rounded border border-blue-300">{'{nombre}'}</span>
                      <span className="bg-white px-2 py-0.5 rounded border border-blue-300">{'{organizacion}'}</span>
                      <span className="bg-white px-2 py-0.5 rounded border border-blue-300">{'{cargo}'}</span>
                      <span className="bg-white px-2 py-0.5 rounded border border-blue-300">{'{pais}'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Plantilla del Primer Mensaje
                    </label>
                    <textarea
                      rows={6}
                      value={editingCampaign.messageTemplate}
                      onChange={e => setEditingCampaign({ ...editingCampaign, messageTemplate: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-3 font-mono text-xs leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {activeTabModal === 'horarios' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Zona Horaria Destinatario</label>
                      <input
                        type="text"
                        value={editingCampaign.timezone}
                        onChange={e => setEditingCampaign({ ...editingCampaign, timezone: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Hora Inicio Envíos</label>
                      <input
                        type="time"
                        value={editingCampaign.sendWindowStart}
                        onChange={e => setEditingCampaign({ ...editingCampaign, sendWindowStart: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Hora Fin Envíos</label>
                      <input
                        type="time"
                        value={editingCampaign.sendWindowEnd}
                        onChange={e => setEditingCampaign({ ...editingCampaign, sendWindowEnd: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Límite Diario de Envíos</label>
                      <input
                        type="number"
                        min="1"
                        max="150"
                        value={editingCampaign.dailyLimit}
                        onChange={e => setEditingCampaign({ ...editingCampaign, dailyLimit: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fecha de Inicio</label>
                      <input
                        type="date"
                        value={editingCampaign.startDate}
                        onChange={e => setEditingCampaign({ ...editingCampaign, startDate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fecha de Fin</label>
                      <input
                        type="date"
                        value={editingCampaign.endDate}
                        onChange={e => setEditingCampaign({ ...editingCampaign, endDate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTabModal === 'seguimientos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Cantidad Máxima de Seguimientos
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={editingCampaign.maxFollowUps}
                        onChange={e => setEditingCampaign({ ...editingCampaign, maxFollowUps: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Intervalo entre Seguimientos (Días)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={editingCampaign.followUpIntervalDays}
                        onChange={e => setEditingCampaign({ ...editingCampaign, followUpIntervalDays: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Criterios para Detener el Contacto
                    </label>
                    <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" checked disabled className="w-3.5 h-3.5 rounded text-blue-600" />
                        <span>Respuesta recibida del prospecto (Detención inmediata)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" checked disabled className="w-3.5 h-3.5 rounded text-blue-600" />
                        <span>Solicitud de baja o rechazo comercial (Opt-out permanente)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" checked disabled className="w-3.5 h-3.5 rounded text-blue-600" />
                        <span>Conversión a cliente o contratación</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setEditingCampaign(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={saving || !editingCampaign.name}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-xs"
              >
                {saving ? 'Guardando...' : 'Guardar Campaña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

