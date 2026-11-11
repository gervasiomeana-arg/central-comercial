import React, { useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
  Bot,
  User,
  ShieldCheck,
  FileCheck,
  Layers,
  Phone,
  Mail,
  Plus
} from 'lucide-react';
import type {
  Conversation,
  Message,
  Contact,
  Application,
  Campaign,
  MessageClassification
} from '../types.js';

interface ConversationsViewProps {
  conversations: Conversation[];
  contacts: Contact[];
  applications: Application[];
  campaigns: Campaign[];
  onSendMessage: (
    convId: string,
    msg: { content: string; direction: 'inbound' | 'outbound'; channel: string; status: string; serviceConfirmationId?: string }
  ) => Promise<any>;
  onAiSuggest: (params: {
    appId: string;
    contactName: string;
    messageContent: string;
    conversationHistory: any[];
  }) => Promise<any>;
  onCreateConversation: (conv: Partial<Conversation>) => Promise<Conversation>;
  selectedAppFilter: string;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  conversations,
  contacts,
  applications,
  campaigns,
  onSendMessage,
  onAiSuggest,
  onCreateConversation,
  selectedAppFilter,
}) => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    conversations[0]?.id || null
  );
  const [replyText, setReplyText] = useState('');
  const [filterClassification, setFilterClassification] = useState<string>('all');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any | null>(null);

  // Simulation modal to test incoming message or stage new thread
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newConvContactId, setNewConvContactId] = useState(contacts[0]?.id || '');
  const [newConvAppId, setNewConvAppId] = useState(applications[0]?.id || '');
  const [newConvInitialMsg, setNewConvInitialMsg] = useState('');

  const filteredConversations = conversations.filter(conv => {
    const matchesApp =
      selectedAppFilter === 'all' || conv.appId === selectedAppFilter;
    const matchesClassification =
      filterClassification === 'all' || conv.classification === filterClassification;
    return matchesApp && matchesClassification;
  });

  const activeConv = conversations.find(c => c.id === selectedConvId) || filteredConversations[0] || null;
  const activeContact = activeConv ? contacts.find(c => c.id === activeConv.contactId) : null;
  const activeApp = activeConv ? applications.find(a => a.id === activeConv.appId) : null;
  const activeCampaign = activeConv?.campaignId ? campaigns.find(c => c.id === activeConv.campaignId) : null;

  // Handle requesting AI response suggestion
  const handleRequestAiSuggestion = async () => {
    if (!activeConv || !activeApp) return;

    // Get the last inbound message from prospect
    const inboundMessages = activeConv.messages.filter(m => m.direction === 'inbound');
    const lastInbound = inboundMessages[inboundMessages.length - 1];

    if (!lastInbound) {
      alert('Esta conversación no contiene un mensaje entrante reciente del prospecto para analizar.');
      return;
    }

    setIsAiLoading(true);
    try {
      const historyFormatted = activeConv.messages.slice(-5).map(m => ({
        direction: m.direction,
        content: m.content
      }));

      const suggestion = await onAiSuggest({
        appId: activeApp.id,
        contactName: activeContact?.contactPerson || activeContact?.orgName || 'Prospecto',
        messageContent: lastInbound.content,
        conversationHistory: historyFormatted
      });

      setAiSuggestion(suggestion);
    } catch (err: any) {
      alert(`Error al consultar Asistente IA: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (aiSuggestion?.suggestedResponse) {
      setReplyText(aiSuggestion.suggestedResponse);
    }
  };

  const handleSendManual = async () => {
    if (!activeConv || !replyText.trim()) return;

    // By policy: if there is no real connector confirmed, outbound is stored as pending / manual staging
    await onSendMessage(activeConv.id, {
      content: replyText,
      direction: 'outbound',
      channel: activeConv.channel,
      status: 'pendiente' // Never falsify delivery without provider verification
    });

    setReplyText('');
    setAiSuggestion(null);
  };

  const handleSimulateInboundMessage = async (incomingText: string) => {
    if (!activeConv) return;
    await onSendMessage(activeConv.id, {
      content: incomingText,
      direction: 'inbound',
      channel: activeConv.channel,
      status: 'enviado'
    });
  };

  const handleCreateNewConversation = async () => {
    if (!newConvContactId || !newConvAppId || !newConvInitialMsg) return;
    try {
      const conv = await onCreateConversation({
        contactId: newConvContactId,
        appId: newConvAppId,
        channel: 'email',
        classification: 'solicita_informacion',
        messages: [
          {
            id: `msg-${Date.now()}`,
            conversationId: '',
            direction: 'inbound',
            channel: 'email',
            content: newConvInitialMsg,
            status: 'enviado',
            createdAt: new Date().toISOString()
          }
        ]
      });
      setIsNewConvModalOpen(false);
      setSelectedConvId(conv.id);
      setNewConvInitialMsg('');
    } catch (err: any) {
      alert(`Error al crear conversación: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <span>Bandeja Unificada de Conversaciones Comerciales</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Atención exclusiva de prospectos comerciales. Asistente IA restringido estrictamente a las FAQ oficiales aprobadas.
            </p>
          </div>

          <button
            onClick={() => setIsNewConvModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center space-x-1.5 transition-colors self-start sm:self-auto shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar mensaje entrante</span>
          </button>
        </div>

        {/* Classification Filter Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-semibold mr-1">Filtrar por intención:</span>
          {[
            { id: 'all', label: 'Todas' },
            { id: 'interesado', label: 'Interesado' },
            { id: 'solicita_informacion', label: 'Info' },
            { id: 'solicita_demostracion', label: 'Demo' },
            { id: 'consulta_precio', label: 'Precio' },
            { id: 'quiere_suscribirse', label: 'Suscripción' },
            { id: 'informa_pago', label: 'Informa pago' },
            { id: 'requiere_intervencion', label: 'Intervención' },
            { id: 'no_interesado', label: 'No interesado' },
            { id: 'solicita_baja', label: 'Baja' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterClassification(f.id)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                filterClassification === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Inbox: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        {/* Left column: Conversations list (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col justify-between">
          <div className="space-y-2 overflow-y-auto max-h-[620px] pr-1">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>No hay conversaciones con este filtro.</p>
                <button
                  onClick={() => setIsNewConvModalOpen(true)}
                  className="mt-3 text-blue-600 hover:underline font-bold text-xs"
                >
                  + Cargar mensaje entrante
                </button>
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isSelected = activeConv?.id === conv.id;
                const contact = contacts.find(c => c.id === conv.contactId);
                const app = applications.find(a => a.id === conv.appId);
                const lastMsg = conv.messages[conv.messages.length - 1];

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setSelectedConvId(conv.id);
                      setAiSuggestion(null);
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-400'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="font-extrabold text-xs text-slate-900 line-clamp-1">
                        {contact?.orgName || 'Organización'}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(conv.lastMessageAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 line-clamp-2">
                      {lastMsg ? lastMsg.content : 'Sin mensajes'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-100 text-[10px]">
                      <span className="font-bold text-blue-800">{app?.name}</span>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded ${
                          conv.classification === 'informa_pago'
                            ? 'bg-amber-100 text-amber-900'
                            : conv.classification === 'requiere_intervencion'
                            ? 'bg-rose-100 text-rose-900'
                            : conv.classification === 'interesado'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {conv.classification.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Active Chat Thread + AI Assistant Panel (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          {activeConv ? (
            <>
              {/* Thread Info Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-sm text-slate-900">
                      {activeContact?.orgName}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">
                      {activeContact?.contactPerson || 'Contacto directo'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                    <span>App: <strong>{activeApp?.name}</strong></span>
                    {activeCampaign && <span>· Campaña: <strong>{activeCampaign.name}</strong></span>}
                    <span>· Canal: <strong>{activeConv.channel}</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 uppercase">
                    {activeConv.classification.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Chat Messages Feed */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex-1 min-h-[300px] max-h-[380px] overflow-y-auto space-y-3">
                {activeConv.messages.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    No hay mensajes en esta conversación.
                  </div>
                ) : (
                  activeConv.messages.map(msg => {
                    const isInbound = msg.direction === 'inbound';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 mb-1">
                          {isInbound ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                          <span>{isInbound ? (activeContact?.contactPerson || 'Prospecto') : 'Comercial'}</span>
                          <span>·</span>
                          <span>{new Date(msg.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div
                          className={`max-w-xl p-3.5 rounded-2xl text-xs leading-relaxed ${
                            isInbound
                              ? 'bg-slate-100 text-slate-900 rounded-tl-xs'
                              : 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>

                        {/* Status tracking flag (crucial: zero fake confirmation) */}
                        {!isInbound && (
                          <div className="mt-1 flex items-center space-x-1 text-[10px]">
                            {msg.status === 'enviado' ? (
                              <span className="text-emerald-700 flex items-center space-x-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Enviado ({msg.serviceConfirmationId || 'Confirmado por servicio'})</span>
                              </span>
                            ) : msg.status === 'pendiente' ? (
                              <span className="text-amber-700 flex items-center space-x-0.5">
                                <Clock className="w-3 h-3" />
                                <span>Borrador en cola (Pendiente de envío con credenciales)</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 flex items-center space-x-0.5">
                                <HelpCircle className="w-3 h-3" />
                                <span>Estado: {msg.status}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* AI Strict Knowledge Base Assistant Panel */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                      Asistente Comercial IA (Conocimiento Estricto Aprobado)
                    </span>
                  </div>

                  <button
                    onClick={handleRequestAiSuggestion}
                    disabled={isAiLoading}
                    className="px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{isAiLoading ? 'Analizando catálogo oficial...' : 'Generar sugerencia de respuesta'}</span>
                  </button>
                </div>

                {/* AI Output / Guardrail Warnings */}
                {aiSuggestion && (
                  <div className="p-3 bg-white border border-indigo-200 rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">
                        Intención detectada: <strong className="text-indigo-700">{aiSuggestion.classification}</strong> (Confianza: {Math.round(aiSuggestion.confidence * 100)}%)
                      </span>
                      {aiSuggestion.requiresHumanIntervention && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold border border-rose-200 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Requiere intervención manual</span>
                        </span>
                      )}
                    </div>

                    {aiSuggestion.interventionReason && (
                      <p className="text-[11px] text-rose-700 font-semibold bg-rose-50 p-2 rounded border border-rose-200">
                        ⚠️ Motivo de intervención: {aiSuggestion.interventionReason}
                      </p>
                    )}

                    {aiSuggestion.sourceFaqsUsed && aiSuggestion.sourceFaqsUsed.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        <span>Fuente aprobada utilizada: </span>
                        <span className="italic font-medium text-slate-700">{aiSuggestion.sourceFaqsUsed.join(' · ')}</span>
                      </div>
                    )}

                    <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-800 whitespace-pre-wrap font-sans text-xs">
                      {aiSuggestion.suggestedResponse}
                    </div>

                    <button
                      onClick={handleApplyAiSuggestion}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      Copiar sugerencia al editor de respuesta
                    </button>
                  </div>
                )}
              </div>

              {/* Reply Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Escribí tu respuesta comercial o cargá una sugerencia de la IA..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />

                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Se registrará como mensaje en cola sin confirmar entrega falsa</span>
                  </div>

                  <button
                    onClick={handleSendManual}
                    disabled={!replyText.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Preparar envío comercial</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400 text-xs">
              Seleccioná una conversación del panel lateral para revisar los mensajes y generar respuestas con asistencia de IA.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Register Incoming Prospect Message */}
      {isNewConvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                Registrar Mensaje Entrante de Prospecto
              </h3>
              <button
                onClick={() => setIsNewConvModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Contacto / Prospecto *</label>
                <select
                  value={newConvContactId}
                  onChange={e => setNewConvContactId(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2"
                >
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.orgName} ({c.contactPerson || 'Sin contacto'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Aplicación Consultada *</label>
                <select
                  value={newConvAppId}
                  onChange={e => setNewConvAppId(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2"
                >
                  {applications.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Contenido del Mensaje Recibido *</label>
                <textarea
                  rows={4}
                  value={newConvInitialMsg}
                  onChange={e => setNewConvInitialMsg(e.target.value)}
                  placeholder="Pegá aquí el mensaje recibido por email, WhatsApp o formulario web..."
                  className="w-full border border-slate-300 rounded p-2 text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end space-x-2">
              <button
                onClick={() => setIsNewConvModalOpen(false)}
                className="px-4 py-2 border rounded text-slate-600 font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateNewConversation}
                disabled={!newConvInitialMsg.trim()}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Crear Conversación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
