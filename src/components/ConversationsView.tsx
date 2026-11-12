import { DraftReviewPanel, type DraftReviewInput } from './DraftReviewPanel.js';
import React, { useState, useEffect } from 'react';
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
  MessageClassification,
  CommercialTask
} from '../types.js';

interface ConversationsViewProps {
  conversations: Conversation[];
  contacts: Contact[];
  applications: Application[];
  campaigns: Campaign[];
  tasks?: CommercialTask[];
  onResolve?: (conversationId: string, note: string) => Promise<void>;
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
  onReviewDraft?: (conversationId: string, messageId: string, input: DraftReviewInput) => Promise<void>;
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
  onReviewDraft,
  tasks = [],
  onResolve,
}) => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    conversations[0]?.id || null
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string,string>>({});
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [replyError, setReplyError] = useState('');
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
    const contact = contacts.find(c => c.id === conv.contactId);
    const app = applications.find(a => a.id === conv.appId);
    const matchesSearch = !search.trim() || `${contact?.orgName || ''} ${contact?.contactPerson || ''} ${app?.name || ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'));
    const needsAttention = conv.requiresHumanIntervention && conv.messages.some(m => m.direction === 'inbound');
    return matchesApp && matchesClassification && matchesSearch && (!attentionOnly || needsAttention);
  }).sort((a,b) => Number(b.requiresHumanIntervention && b.messages.some(m=>m.direction==='inbound')) - Number(a.requiresHumanIntervention && a.messages.some(m=>m.direction==='inbound')) || b.lastMessageAt.localeCompare(a.lastMessageAt));

  const activeConv = filteredConversations.find(c => c.id === selectedConvId) || filteredConversations[0] || null;
  const activeContact = activeConv ? contacts.find(c => c.id === activeConv.contactId) : null;
  const activeApp = activeConv ? applications.find(a => a.id === activeConv.appId) : null;
  const activeCampaign = activeConv?.campaignId ? campaigns.find(c => c.id === activeConv.campaignId) : null;
  const activeId = activeConv?.id;
  const replyText = activeId ? replyDrafts[activeId] || '' : '';
  const setReplyText = (value:string) => { if(activeId) setReplyDrafts(previous=>({...previous,[activeId]:value})); };
  const activeTasks = tasks.filter(t=>t.relatedType==='conversacion' && t.relatedId===activeId && t.status==='pendiente');
  useEffect(()=>{setAiSuggestion(null);setFeedback('');setReplyError('');},[activeId]);

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

      setAiSuggestion({...suggestion, conversationId:activeConv.id});
    } catch (err: any) {
      alert(`Error al consultar Asistente IA: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (aiSuggestion?.suggestedResponse && aiSuggestion.conversationId === activeConv?.id) {
      setReplyText(aiSuggestion.suggestedResponse);
    }
  };

  const handleSendManual = async () => {
    if (!activeConv || !replyText.trim() || isSending) return;
    const id = activeConv.id, content = replyText.trim();
    setIsSending(true);setReplyError('');setFeedback('');
    try {
      await onSendMessage(id, { content, direction:'outbound', channel:activeConv.channel, status:'pendiente' });
      setReplyDrafts(previous=>({...previous,[id]:previous[id]?.trim()===content?'':previous[id]}));
      setAiSuggestion(null);setFeedback('Respuesta guardada en cola. La aceptación del correo se mostrará cuando el ejecutor confirme el envío.');
    } catch(error:any) { setReplyError(error.message || 'No se pudo guardar. El texto sigue en el editor.'); }
    finally { setIsSending(false); }
  };
  const handleResolve = async () => {
    if(!activeConv || !onResolve || isResolving)return;
    setIsResolving(true);setReplyError('');
    try { await onResolve(activeConv.id, 'Consulta revisada y marcada por el propietario desde Conversaciones.'); setFeedback('Consulta marcada como revisada. No se registró ningún pago ni envío.'); }
    catch(error:any) { setReplyError(error.message); }
    finally {setIsResolving(false);}
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
              <span>Conversaciones</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Consultas, respuestas y decisiones comerciales de tus aplicaciones.
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

        <div className="cc-inbox-filters">
          <label>Buscar organización<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, persona o aplicación"/></label>
          <label>Tipo de consulta<select value={filterClassification} onChange={e=>setFilterClassification(e.target.value)}>{[{id:'all',label:'Todas'},{id:'interesado',label:'Interesados'},{id:'solicita_informacion',label:'Información'},{id:'solicita_demostracion',label:'Demostración'},{id:'consulta_precio',label:'Precios'},{id:'quiere_suscribirse',label:'Suscripción'},{id:'informa_pago',label:'Informa pago'},{id:'requiere_intervencion',label:'Requiere tu respuesta'},{id:'no_interesado',label:'Sin interés'},{id:'solicita_baja',label:'Bajas'}].map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="cc-inbox-attention-filter"><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/>Necesitan mi respuesta</label>
        </div>
      </div>

      {replyError && <p className="cc-inbox-feedback is-error" role="alert">{replyError}</p>}
      {feedback && <p className="cc-inbox-feedback" role="status">{feedback}</p>}
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

              {activeConv.requiresHumanIntervention && activeConv.messages.some(m=>m.direction==='inbound') && <section className="cc-inbox-owner-card">
                <div><p className="cc-eyebrow">NECESITA TU CRITERIO</p><h2>Una consulta para vos</h2></div>
                <p>{activeTasks[0]?.description || activeConv.adminNote || 'Revisá el último mensaje y prepará una respuesta para este interesado.'}</p>
                {onResolve && <button className="cc-text-button" disabled={isResolving} onClick={handleResolve}>{isResolving?'Guardando…':'Marcar consulta revisada'}</button>}
                <small>Marcarla revisada no confirma pagos ni acredita entrega de mensajes.</small>
              </section>}
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

                        {onReviewDraft && msg.direction === 'outbound' && msg.channel === 'email' && msg.status === 'preparado' && <DraftReviewPanel key={`${msg.id}-${msg.draftRevision || 0}`} message={msg} recipient={activeContact?.email} onReview={input => onReviewDraft(activeConv.id, msg.id, input)}/>}
                        {/* Status tracking flag (crucial: zero fake confirmation) */}
                        {!isInbound && (
                          <div className="mt-1 flex items-center space-x-1 text-[10px]">
                            {msg.status === 'enviado' ? (
                              <span className="text-emerald-700 flex items-center space-x-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{msg.serviceConfirmationId ? `Envío registrado (${msg.serviceConfirmationId})` : 'Registro manual · sin comprobación del proveedor'}</span>
                              </span>
                            ) : msg.status === 'aceptado_proveedor' ? (<span className="text-emerald-700">Aceptado por el correo · entrega no confirmada</span>) : msg.status === 'entrega_confirmada' ? (<span className="text-emerald-700">Entrega confirmada por el proveedor</span>) : msg.status === 'envio_intentado' ? (<span className="text-amber-700">Envío en curso · esperando confirmación</span>) : msg.status === 'resultado_desconocido' ? (<span className="text-amber-700">Resultado incierto · revisar Enviados antes de reenviar</span>) : msg.status === 'fallido' ? (<span className="text-rose-700">Falló el envío: {msg.serviceError || 'revisar actividad'}</span>) : msg.status === 'preparado' ? (<span className="text-slate-500">Nota preparada · aún no enviada</span>) : msg.status === 'pendiente' ? (
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
                {aiSuggestion && aiSuggestion.conversationId === activeConv.id && (
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
                    <span>Se guarda en cola; el ejecutor confirmará la aceptación del correo.</span>
                  </div>

                  <button
                    onClick={handleSendManual}
                    disabled={!replyText.trim() || isSending}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending?'Guardando…':'Guardar respuesta en cola'}</span>
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

