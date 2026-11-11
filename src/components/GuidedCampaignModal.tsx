import React, { useState, useEffect } from 'react';
import {
  Send,
  Layers,
  Users,
  Globe,
  Clock,
  Target,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import type { Campaign, Application, ConnectorInfo } from '../types.js';

interface GuidedCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: Application[];
  connectors: ConnectorInfo[];
  onSaveCampaign: (campaign: Campaign) => Promise<void>;
  preselectedAppId?: string;
}

export const GuidedCampaignModal: React.FC<GuidedCampaignModalProps> = ({
  isOpen,
  onClose,
  applications,
  connectors,
  onSaveCampaign,
  preselectedAppId,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Guided wizard fields
  const [appId, setAppId] = useState<string>(preselectedAppId || applications[0]?.id || 'app-open-voley');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('Presentar propuesta de valor y agendar llamada de demostración');
  const [segment, setSegment] = useState('');
  const [countries, setCountries] = useState<string[]>(['Brasil', 'Argentina', 'España']);
  const [language, setLanguage] = useState('es');
  const [channels, setChannels] = useState<('email' | 'whatsapp' | 'telegram')[]>(['email']);
  const [sendWindowStart, setSendWindowStart] = useState('09:00');
  const [sendWindowEnd, setSendWindowEnd] = useState('18:00');
  const [dailyLimit, setDailyLimit] = useState(20);

  // Message & Follow-up
  const [messageTemplate, setMessageTemplate] = useState('');
  const [followUpTemplate, setFollowUpTemplate] = useState('');

  // Advanced options toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxFollowUps, setMaxFollowUps] = useState(2);
  const [followUpIntervalDays, setFollowUpIntervalDays] = useState(4);
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [mode, setMode] = useState<'revision_previa' | 'manual' | 'automatico'>('revision_previa');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update defaults based on selected application
  useEffect(() => {
    const app = applications.find(a => a.id === appId);
    if (app) {
      if (!name || name.startsWith('Campaña Comercial')) {
        setName(`Campaña Comercial ${app.name}`);
      }
      if (!segment) {
        setSegment(app.targetAudience.split(',')[0] || 'Clubes y entrenadores');
      }
      if (app.countries.length > 0) {
        setCountries(app.countries.slice(0, 3));
      }
      if (app.languages.length > 0) {
        setLanguage(app.languages[0]);
      }

      // Generate initial message template strictly from verified facts
      const verifiedFact = app.verifiedFeatures.length > 0 ? app.verifiedFeatures[0] : app.description;
      const initialTemplate = `Hola {nombre},\n\nNos contactamos para presentarles ${app.name} para {organizacion}.\n\nFuncionalidad principal: ${verifiedFact}.\nSitio oficial: ${app.website}.\n\n¿Tendrían disponibilidad para coordinar una llamada de 10 minutos esta semana?\n\nSaludos cordiales,\nEquipo de ${app.name}`;
      setMessageTemplate(initialTemplate);

      const initialFollowUp = `Hola {nombre}, ¿cómo estás? Te escribo para consultar si pudieron evaluar la propuesta de ${app.name} enviada hace unos días. Quedo a disposición para cualquier consulta.`;
      setFollowUpTemplate(initialFollowUp);
    }
  }, [appId, applications]);

  if (!isOpen) return null;

  const currentApp = applications.find(a => a.id === appId);
  const isFuneraria = currentApp?.id === 'app-funeraria' || currentApp?.slug === 'funeraria';

  const handleSave = async (activateImmediately: boolean) => {
    setError(null);
    setSaving(true);

    try {
      if (!name.trim()) throw new Error('Debe asignar un nombre a la campaña.');

      let finalStatus: Campaign['status'] = activateImmediately ? 'activa' : 'borrador';
      let blockingReason: string | undefined;

      // Safety check: Funeraria in development cannot be activated
      if (isFuneraria || currentApp?.status === 'en_desarrollo') {
        finalStatus = 'bloqueada_por_configuracion';
        blockingReason = `La aplicación ${currentApp?.name || ''} está en desarrollo. La instrucción se guardó como borrador protegido.`;
      } else if (activateImmediately) {
        const needsEmail = channels.includes('email');
        const emailConn = connectors.find(c => c.type === 'email_smtp');
        if (needsEmail && emailConn?.status !== 'conectado') {
          finalStatus = 'bloqueada_por_configuracion';
          blockingReason = 'El conector SMTP de correo saliente está pendiente de conexión. La campaña se guardó y se activará cuando se configure el servidor.';
        }
      }

      const campaignData: Campaign = {
        id: `camp-${Date.now()}`,
        appId,
        name: name.trim(),
        objective: objective.trim(),
        country: countries.join(', '),
        language,
        segment: segment.trim(),
        channels,
        messageTemplate,
        followUpTemplates: [followUpTemplate],
        timezone,
        sendWindowStart,
        sendWindowEnd,
        dailyLimit,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        maxFollowUps,
        followUpIntervalDays,
        stopCriteria: ['respuesta_recibida', 'solicitud_baja', 'pago_informado'],
        mode,
        status: finalStatus,
        blockingReason,
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

      await onSaveCampaign(campaignData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la campaña guiada.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-inner shrink-0">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold tracking-tight">Nueva Instrucción Comercial Guiada</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  Paso {step} de 4
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina las reglas de la campaña para que el sistema organice y ejecute los envíos de forma autónoma.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-[11px] font-bold">
          <button
            onClick={() => setStep(1)}
            className={`flex items-center space-x-1.5 ${step === 1 ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>1</span>
            <span>Aplicación y Objetivo</span>
          </button>

          <span className="text-slate-300">→</span>

          <button
            onClick={() => setStep(2)}
            className={`flex items-center space-x-1.5 ${step === 2 ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>2</span>
            <span>Público e Idioma</span>
          </button>

          <span className="text-slate-300">→</span>

          <button
            onClick={() => setStep(3)}
            className={`flex items-center space-x-1.5 ${step === 3 ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>3</span>
            <span>Canales y Horarios</span>
          </button>

          <span className="text-slate-300">→</span>

          <button
            onClick={() => setStep(4)}
            className={`flex items-center space-x-1.5 ${step === 4 ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'}`}>4</span>
            <span>Vista Previa y Activación</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Application & Objective */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre de la Campaña *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                  placeholder="Ej. Prospección Clubes de Vóley España"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Aplicación Comercial *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {applications.map(app => {
                    const isSelected = app.id === appId;
                    const isDev = app.status === 'en_desarrollo';

                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setAppId(app.id)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{app.name}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                            isDev ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isDev ? 'En desarrollo' : 'Lista'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {app.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isFuneraria && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-950 text-xs flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Funeraria en desarrollo:</strong> La campaña se guardará como borrador y permanecerá bloqueada para envíos automáticos hasta autorizar formalmente su lanzamiento.
                  </span>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Objetivo Comercial Principal *</label>
                <select
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-medium"
                >
                  <option value="Presentar propuesta de valor y agendar llamada de demostración">
                    Presentar propuesta de valor y agendar demostración (Recomendado)
                  </option>
                  <option value="Invitar a prueba gratuita de evaluación">
                    Invitar a prueba o acceso de evaluación inicial
                  </option>
                  <option value="Consultar interés en auditoría de visibilidad digital">
                    Consultar interés técnico y enviar diagnóstico
                  </option>
                  <option value="Reactivar contactos anteriores">
                    Reactivación de prospectos que no respondieron anteriormente
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Target Audience, Countries & Language */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Público / Segmento Objetivo *</label>
                <input
                  type="text"
                  required
                  value={segment}
                  onChange={e => setSegment(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                  placeholder="Ej. Entrenadores de clubes formativos y directores deportivos"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Países Destinatarios</label>
                  <input
                    type="text"
                    value={countries.join(', ')}
                    onChange={e => setCountries(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    placeholder="Brasil, Argentina, España..."
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Separados por coma.</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Idioma Principal de Contacto</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-medium"
                  >
                    <option value="es">Español (es)</option>
                    <option value="pt-BR">Portugués Brasil (pt-BR)</option>
                    <option value="en">Inglés (en)</option>
                    <option value="it">Italiano (it)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-800 text-[11px] block">Adaptación Inteligente de Mensajes:</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  El sistema adaptará el mensaje inicial y las respuestas al idioma y contexto del destinatario utilizando exclusivamente los datos autorizados en la ficha de <strong>{currentApp?.name}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Channels, Schedule & Pacing */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Canales Permitidos *</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="p-3 rounded-lg border border-slate-200 bg-white flex items-center space-x-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={channels.includes('email')}
                      onChange={e => {
                        if (e.target.checked) setChannels([...channels, 'email']);
                        else if (channels.length > 1) setChannels(channels.filter(c => c !== 'email'));
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-900">Email</span>
                      <span className="text-[10px] text-slate-400">Canal prioritario</span>
                    </div>
                  </label>

                  <label className="p-3 rounded-lg border border-slate-200 bg-white flex items-center space-x-2 cursor-pointer hover:bg-slate-50 opacity-80">
                    <input
                      type="checkbox"
                      checked={channels.includes('whatsapp')}
                      onChange={e => {
                        if (e.target.checked) setChannels([...channels, 'whatsapp']);
                        else if (channels.length > 1) setChannels(channels.filter(c => c !== 'whatsapp'));
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-900">WhatsApp</span>
                      <span className="text-[10px] text-slate-400">Cloud API</span>
                    </div>
                  </label>

                  <label className="p-3 rounded-lg border border-slate-200 bg-white flex items-center space-x-2 cursor-pointer hover:bg-slate-50 opacity-60">
                    <input
                      type="checkbox"
                      checked={channels.includes('telegram')}
                      onChange={e => {
                        if (e.target.checked) setChannels([...channels, 'telegram']);
                        else if (channels.length > 1) setChannels(channels.filter(c => c !== 'telegram'));
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-900">Telegram</span>
                      <span className="text-[10px] text-slate-400">Directo</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Ventana Horaria de Envío (Huso del destinatario)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="time"
                      value={sendWindowStart}
                      onChange={e => setSendWindowStart(e.target.value)}
                      className="border border-slate-300 rounded p-1.5 text-xs text-center font-bold"
                    />
                    <span className="text-slate-400">a</span>
                    <input
                      type="time"
                      value={sendWindowEnd}
                      onChange={e => setSendWindowEnd(e.target.value)}
                      className="border border-slate-300 rounded p-1.5 text-xs text-center font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Límite Diario de Mensajes Salientes</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={dailyLimit}
                      onChange={e => setDailyLimit(Number(e.target.value))}
                      className="w-24 border border-slate-300 rounded p-1.5 text-xs font-bold text-center"
                    />
                    <span className="text-slate-500 text-[11px]">contactos / día</span>
                  </div>
                </div>
              </div>

              {/* Message Proposal */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-800 text-xs block">
                  Propuesta de Mensaje Inicial (Basado en Ficha Aprobada)
                </span>
                <textarea
                  rows={4}
                  value={messageTemplate}
                  onChange={e => setMessageTemplate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs font-mono leading-relaxed bg-slate-50"
                />
              </div>
            </div>
          )}

          {/* STEP 4: Plain-Language Summary Preview & Activation */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/50 border border-emerald-300 rounded-xl space-y-3">
                <div className="flex items-center space-x-2 text-emerald-950 font-extrabold text-sm">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <span>Vista Previa Comprensible de la Instrucción Comercial Recurrente</span>
                </div>

                <div className="p-3 bg-white border border-emerald-200 rounded-lg text-slate-800 leading-relaxed text-xs space-y-2">
                  <p>
                    <strong>Instrucción activa para {currentApp?.name}:</strong> Contactar de forma organizada a prospectos del segmento <em>"{segment}"</em> en <em>{countries.join(', ')}</em> en idioma <em>{language.toUpperCase()}</em>.
                  </p>
                  <p>
                    <strong>Ritmo de ejecución:</strong> Envíos vía <em>{channels.join(', ').toUpperCase()}</em> entre las <em>{sendWindowStart} y las {sendWindowEnd} hs</em> (máximo <em>{dailyLimit} contactos por día</em>).
                  </p>
                  <p>
                    <strong>Reglas de detención inteligente:</strong> Si el destinatario responde o solicita la baja, los seguimientos automáticos <strong>se detienen de inmediato</strong>. Si consulta por precios no verificados o pide descuentos, se deriva una tarea urgente al administrador.
                  </p>
                </div>
              </div>

              {/* Collapsible Advanced Technical Options */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-slate-500" />
                    <span>Configuración Técnica Avanzada (Opcional)</span>
                  </div>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAdvanced && (
                  <div className="p-4 bg-white border-t border-slate-200 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Máximo de Seguimientos</label>
                        <input
                          type="number"
                          min="0"
                          max="5"
                          value={maxFollowUps}
                          onChange={e => setMaxFollowUps(Number(e.target.value))}
                          className="w-full border border-slate-300 rounded p-1.5 text-xs text-center"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Días entre Seguimientos</label>
                        <input
                          type="number"
                          min="1"
                          max="15"
                          value={followUpIntervalDays}
                          onChange={e => setFollowUpIntervalDays(Number(e.target.value))}
                          className="w-full border border-slate-300 rounded p-1.5 text-xs text-center"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Modo de Aprobación</label>
                        <select
                          value={mode}
                          onChange={e => setMode(e.target.value as any)}
                          className="w-full border border-slate-300 rounded p-1.5 text-xs bg-white"
                        >
                          <option value="revision_previa">Revisión previa humana</option>
                          <option value="automatico">Completamente desatendido</option>
                          <option value="manual">Manual paso a paso</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Plantilla de 1er Seguimiento</label>
                      <textarea
                        rows={2}
                        value={followUpTemplate}
                        onChange={e => setFollowUpTemplate(e.target.value)}
                        className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono bg-slate-50"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as any)}
              className="px-3.5 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs hover:bg-slate-100 flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3.5 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs hover:bg-slate-100"
            >
              Cancelar
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep((step + 1) as any)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 flex items-center space-x-1 shadow-xs"
            >
              <span>Siguiente</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-bold text-xs hover:bg-slate-300 transition-colors disabled:opacity-50"
              >
                Guardar como Borrador
              </button>

              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 transition-colors flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Guardar y Activar Instrucción</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
