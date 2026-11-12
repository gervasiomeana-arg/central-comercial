import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  Copy,
  Trash2,
  Edit2,
  ExternalLink,
  Phone,
  Mail,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Calendar,
  Clock,
  ArrowRight,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  UserCheck
} from 'lucide-react';
import type { Contact, Application } from '../types.js';

interface ContactsViewProps {
  contacts: Contact[];
  applications: Application[];
  onSaveContact: (contact: Partial<Contact>) => Promise<Contact>;
  onDeleteContact: (id: string) => Promise<void>;
  onCheckDuplicates: (contact: Partial<Contact>, excludeId?: string) => Promise<{ hasDuplicates: boolean; matches: any }>;
  onMergeContacts: (targetId: string, sourceId: string) => Promise<void>;
  onPreviewCsv: (csvContent: string) => Promise<any>;
  onCommitCsv: (rows: any[], appId?: string) => Promise<number>;
  onConvertToClient: (contactId: string) => Promise<void>;
  selectedAppFilter: string;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  applications,
  onSaveContact,
  onDeleteContact,
  onCheckDuplicates,
  onMergeContacts,
  onPreviewCsv,
  onCommitCsv,
  onConvertToClient,
  selectedAppFilter,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Edit / Create contact modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formContact, setFormContact] = useState<Partial<Contact>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);

  // Duplicate Resolution Modal State
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');

  // CSV Import Modal State
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvPreviewData, setCsvPreviewData] = useState<any | null>(null);
  const [csvTargetAppId, setCsvTargetAppId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Filter contacts
  const filteredContacts = contacts.filter(c => {
    const matchesSearch =
      c.orgName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.country.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesApp =
      selectedAppFilter === 'all' || c.interestedAppIds.includes(selectedAppFilter);

    return matchesSearch && matchesStatus && matchesApp;
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormContact({
      orgName: '',
      contactPerson: '',
      role: '',
      orgType: 'club',
      country: 'Brasil',
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      website: '',
      email: '',
      phone: '',
      source: 'Directorio oficial verificado',
      sourceReviewDate: new Date().toISOString().split('T')[0],
      interestedAppIds: selectedAppFilter !== 'all' ? [selectedAppFilter] : ['app-open-voley'],
      assignedTo: 'Administrador',
      notes: '',
      preferredChannel: 'email',
      permission: 'desconocido',
      status: 'prospecto',
      nextFollowUpDate: null
    });
    setDuplicateWarning(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setIsEditing(true);
    setFormContact({ ...contact });
    setDuplicateWarning(null);
    setIsModalOpen(true);
  };

  const handleFormChange = async (key: keyof Contact, val: any) => {
    const updated = { ...formContact, [key]: val };
    setFormContact(updated);

    // Dynamic duplicate check when email, phone, or website changes
    if (key === 'email' || key === 'phone' || key === 'website') {
      if (updated.email?.length || updated.phone?.length || updated.website?.length) {
        try {
          const res = await onCheckDuplicates(updated, isEditing ? formContact.id : undefined);
          if (res.hasDuplicates) {
            setDuplicateWarning(res.matches);
          } else {
            setDuplicateWarning(null);
          }
        } catch {
          // ignore check errors in background
        }
      }
    }
  };

  const handleSubmitSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContact.orgName) return;

    try {
      const saved = await onSaveContact(formContact);
      setIsModalOpen(false);
      setSelectedContact(saved);
    } catch (err: any) {
      alert(`Error al guardar contacto: ${err.message}`);
    }
  };

  const handleTriggerMergeModal = (matches: any, candidate: Partial<Contact>) => {
    setDuplicateMatches(matches);
    const firstMatch =
      matches.matchedByEmail[0] ||
      matches.matchedByPhone[0] ||
      matches.matchedByDomain[0];
    if (firstMatch && candidate.id) {
      setSelectedTargetId(firstMatch.id);
      setSelectedSourceId(candidate.id);
    }
    setMergeModalOpen(true);
  };

  const handleExecuteMerge = async () => {
    if (!selectedTargetId || !selectedSourceId) return;
    try {
      await onMergeContacts(selectedTargetId, selectedSourceId);
      setMergeModalOpen(false);
      setIsModalOpen(false);
      alert('Contactos fusionados exitosamente. El historial se unificó.');
    } catch (err: any) {
      alert(`Error al fusionar contactos: ${err.message}`);
    }
  };

  // CSV Import preview handler
  const handleParseCsv = async (content: string) => {
    setCsvRawText(content);
    try {
      const preview = await onPreviewCsv(content);
      setCsvPreviewData(preview);
    } catch (err: any) {
      alert(`Error al procesar CSV: ${err.message}`);
    }
  };

  const handleCommitImport = async () => {
    if (!csvPreviewData || !csvPreviewData.allRows) return;
    setIsImporting(true);
    try {
      const imported = await onCommitCsv(csvPreviewData.allRows, csvTargetAppId || undefined);
      alert(`Importación completada con éxito. Se importaron ${imported} contactos verificados.`);
      setCsvModalOpen(false);
      setCsvPreviewData(null);
      setCsvRawText('');
    } catch (err: any) {
      alert(`Error al importar contactos: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Contactos</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro comercial soberano con fuente verificable, detección de duplicados y trazabilidad histórica.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCsvModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Importar CSV</span>
            </button>

            <a
              href="/api/contacts/export"
              download
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Exportar CSV</span>
            </a>

            <button
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo contacto</span>
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por organización, persona, email, teléfono o país..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs text-slate-700 font-medium focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos los estados comerciales</option>
              <option value="prospecto">Prospecto inicial</option>
              <option value="contactado">Contactado</option>
              <option value="interesado">Interesado</option>
              <option value="en_prueba">En prueba gratuita</option>
              <option value="cliente">Cliente oficial</option>
              <option value="baja_solicitada">Baja solicitada / No contactar</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end text-xs text-slate-500">
            <span>{filteredContacts.length} contactos filtrados</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Contacts List + Contact Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Contact table / cards (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {filteredContacts.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No se encontraron contactos</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No hay contactos registrados con estos criterios. Podés agregar un contacto manualmente o importar un lote en formato CSV.
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-4 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
              >
                + Cargar primer contacto
              </button>
            </div>
          ) : (
            filteredContacts.map(contact => {
              const isSelected = selectedContact?.id === contact.id;
              const hasPhone = Boolean(contact.phone);
              const hasEmail = Boolean(contact.email);

              return (
                <div
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`bg-white border rounded-xl p-4 shadow-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-extrabold text-sm text-slate-900">{contact.orgName}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {contact.orgType}
                        </span>
                      </div>

                      {contact.contactPerson && (
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          {contact.contactPerson} {contact.role ? `· ${contact.role}` : ''}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                        {contact.country && <span>📍 {contact.country}</span>}
                        {hasEmail && (
                          <span className="flex items-center space-x-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{contact.email}</span>
                          </span>
                        )}
                        {hasPhone && (
                          <span className="flex items-center space-x-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{contact.phone}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider block mb-1 ${
                          contact.status === 'cliente'
                            ? 'bg-emerald-100 text-emerald-800'
                            : contact.status === 'interesado'
                            ? 'bg-indigo-100 text-indigo-800'
                            : contact.status === 'en_prueba'
                            ? 'bg-blue-100 text-blue-800'
                            : contact.status === 'baja_solicitada'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {contact.status.replace('_', ' ')}
                      </span>

                      <span className="text-[10px] text-slate-400 block">
                        Fuente: {contact.source || 'Directa'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right column: Selected Contact Detail & Actions (5 cols) */}
        <div className="lg:col-span-5">
          {selectedContact ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs sticky top-24 space-y-4 text-xs">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Ficha de Prospecto
                  </span>
                  <h2 className="text-base font-black text-slate-900">{selectedContact.orgName}</h2>
                  <p className="text-xs text-slate-600">
                    {selectedContact.contactPerson || 'Sin persona de contacto asignada'}
                  </p>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleOpenEdit(selectedContact)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    title="Editar contacto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`¿Eliminar contacto ${selectedContact.orgName}? Esta acción es irreversible.`)) {
                        onDeleteContact(selectedContact.id);
                        setSelectedContact(null);
                      }
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50"
                    title="Eliminar contacto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Conversion to Client Button */}
              {selectedContact.status !== 'cliente' ? (
                <button
                  onClick={async () => {
                    await onConvertToClient(selectedContact.id);
                    setSelectedContact({ ...selectedContact, status: 'cliente' });
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center space-x-2 shadow-xs"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Convertir a Cliente Oficial (Conservar historial)</span>
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Registrado como Cliente Oficial</span>
                </div>
              )}

              {/* Verified Source & Review Date */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-700 block">Fuente verificable del dato:</span>
                <p className="text-slate-800">{selectedContact.source || 'No especificada'}</p>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 mt-1">
                  <span>Última revisión: {selectedContact.sourceReviewDate || 'Hoy'}</span>
                  <span>Permiso: {selectedContact.permission}</span>
                </div>
              </div>

              {/* Contact Data Details */}
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-800">{selectedContact.email || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Teléfono:</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedContact.phone || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Sitio Web:</span>
                  {selectedContact.website ? (
                    <a
                      href={selectedContact.website.startsWith('http') ? selectedContact.website : `https://${selectedContact.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center space-x-1"
                    >
                      <span>{selectedContact.website}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">País y Zona horaria:</span>
                  <span className="text-slate-800">
                    {selectedContact.country} ({selectedContact.timezone})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Canal preferido:</span>
                  <span className="font-semibold text-slate-800 uppercase text-[10px]">
                    {selectedContact.preferredChannel}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Próximo seguimiento:</span>
                  <span className="font-bold text-amber-700">
                    {selectedContact.nextFollowUpDate || 'Sin programar'}
                  </span>
                </div>
              </div>

              {/* Interested Applications */}
              <div>
                <span className="font-bold text-slate-700 block mb-1">Aplicaciones de interés:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedContact.interestedAppIds.map(appId => {
                    const app = applications.find(a => a.id === appId);
                    return (
                      <span
                        key={appId}
                        className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold"
                      >
                        {app?.name || appId}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              {selectedContact.notes && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Notas internas:</span>
                  <p className="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] whitespace-pre-wrap">
                    {selectedContact.notes}
                  </p>
                </div>
              )}

              {/* History Timeline */}
              <div className="pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-700 block mb-2">Historial de Interacciones:</span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedContact.history && selectedContact.history.length > 0 ? (
                    selectedContact.history.map(item => (
                      <div key={item.id} className="text-[11px] p-2 rounded bg-slate-50 border border-slate-100">
                        <div className="flex justify-between text-slate-400 text-[10px]">
                          <span>{new Date(item.timestamp).toLocaleString('es')}</span>
                          <span>{item.author}</span>
                        </div>
                        <p className="text-slate-800 mt-0.5">{item.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic text-[11px]">Sin registros en el historial.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
              Seleccioná un contacto de la lista para ver sus datos completos, fuente verificable y línea de tiempo.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create or Edit Contact */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-extrabold text-slate-900">
                {isEditing ? `Editar Contacto: ${formContact.orgName}` : 'Registrar Nuevo Contacto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSave} className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Duplicate Detection Alert */}
              {duplicateWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                  <div className="flex items-center space-x-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>¡POSIBLE CONTACTO DUPLICADO DETECTADO!</span>
                  </div>
                  <p className="text-[11px]">
                    Se encontraron coincidencias por email, teléfono o dominio web en la base de datos.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTriggerMergeModal(duplicateWarning, formContact)}
                    className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 transition-colors"
                  >
                    Revisar y Fusionar con registro existente
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre de Organización / Club *</label>
                  <input
                    type="text"
                    required
                    value={formContact.orgName || ''}
                    onChange={e => handleFormChange('orgName', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="Ej. Minas Tênis Clube"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tipo de Organización</label>
                  <select
                    value={formContact.orgType || 'club'}
                    onChange={e => handleFormChange('orgType', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value="club">Club Deportivo</option>
                    <option value="asociacion">Asociación / Federación</option>
                    <option value="agencia">Agencia de Marketing / Digital</option>
                    <option value="empresa">Empresa / PYME</option>
                    <option value="familia">Familia / Educador</option>
                    <option value="funeraria">Funeraria / Cochería</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Persona de Contacto</label>
                  <input
                    type="text"
                    value={formContact.contactPerson || ''}
                    onChange={e => handleFormChange('contactPerson', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="Ej. Carlos Eduardo"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cargo / Rol</label>
                  <input
                    type="text"
                    value={formContact.role || ''}
                    onChange={e => handleFormChange('role', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="Ej. Entrenador Principal / Dir. Deportivo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email Oficial</label>
                  <input
                    type="email"
                    value={formContact.email || ''}
                    onChange={e => handleFormChange('email', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="ejemplo@club.com"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Teléfono con código internacional (+país)
                  </label>
                  <input
                    type="text"
                    value={formContact.phone || ''}
                    onChange={e => handleFormChange('phone', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    placeholder="+55 31 99999-9999"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">País</label>
                  <input
                    type="text"
                    value={formContact.country || ''}
                    onChange={e => handleFormChange('country', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="Brasil, Argentina, España..."
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Idioma</label>
                  <select
                    value={formContact.language || 'pt-BR'}
                    onChange={e => handleFormChange('language', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  >
                    <option value="pt-BR">Portugués (Brasil)</option>
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                    <option value="it">Italiano</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Zona Horaria</label>
                  <input
                    type="text"
                    value={formContact.timezone || 'America/Sao_Paulo'}
                    onChange={e => handleFormChange('timezone', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sitio Web Oficial</label>
                  <input
                    type="text"
                    value={formContact.website || ''}
                    onChange={e => handleFormChange('website', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="https://club.com.br"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Fuente Verificable del Dato *</label>
                  <input
                    type="text"
                    required
                    value={formContact.source || ''}
                    onChange={e => handleFormChange('source', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                    placeholder="Ej. Directorio Oficial Federación Paulista 2026"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Estado Comercial</label>
                  <select
                    value={formContact.status || 'prospecto'}
                    onChange={e => handleFormChange('status', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="prospecto">Prospecto</option>
                    <option value="contactado">Contactado</option>
                    <option value="interesado">Interesado</option>
                    <option value="en_prueba">En prueba gratuita</option>
                    <option value="cliente">Cliente oficial</option>
                    <option value="baja_solicitada">Baja solicitada</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Permiso de Contacto</label>
                  <select
                    value={formContact.permission || 'desconocido'}
                    onChange={e => handleFormChange('permission', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="desconocido">Desconocido (Primer contacto)</option>
                    <option value="autorizado">Autorizado expresamente</option>
                    <option value="revocado">Revocado (Opt-out)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Próximo Seguimiento</label>
                  <input
                    type="date"
                    value={formContact.nextFollowUpDate || ''}
                    onChange={e => handleFormChange('nextFollowUpDate', e.target.value || null)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              {/* Apps of Interest Checkboxes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Aplicaciones de Interés</label>
                <div className="flex flex-wrap gap-2">
                  {applications.map(app => {
                    const checked = formContact.interestedAppIds?.includes(app.id);
                    return (
                      <label
                        key={app.id}
                        className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer flex items-center space-x-1.5 transition-colors ${
                          checked
                            ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const current = formContact.interestedAppIds || [];
                            const updated = e.target.checked
                              ? [...current, app.id]
                              : current.filter(id => id !== app.id);
                            handleFormChange('interestedAppIds', updated);
                          }}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        <span>{app.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Notas Comerciales</label>
                <textarea
                  rows={3}
                  value={formContact.notes || ''}
                  onChange={e => handleFormChange('notes', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                  placeholder="Detalles sobre el contacto, requerimientos específicos..."
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-xs"
                >
                  {isEditing ? 'Guardar Cambios' : 'Registrar Contacto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Duplicate Merge Comparison */}
      {mergeModalOpen && duplicateMatches && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4 text-xs">
            <div className="flex items-center space-x-2 text-amber-700 font-extrabold text-sm border-b pb-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Fusión de Contactos Duplicados</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Seleccione cuál será el registro <strong>principal (destino)</strong> que conservará la ficha y cuál se integrará y unificará en el historial.
            </p>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Registro Destino (Conservado):</label>
                <select
                  value={selectedTargetId}
                  onChange={e => setSelectedTargetId(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 text-xs font-semibold"
                >
                  {[
                    ...duplicateMatches.matchedByEmail,
                    ...duplicateMatches.matchedByPhone,
                    ...duplicateMatches.matchedByDomain
                  ].map(c => (
                    <option key={c.id} value={c.id}>
                      {c.orgName} ({c.contactPerson}) - {c.email || c.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end space-x-2">
              <button
                onClick={() => setMergeModalOpen(false)}
                className="px-4 py-1.5 border rounded text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteMerge}
                className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded hover:bg-blue-700"
              >
                Confirmar Fusión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: CSV Import with Validation & Live Preview */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Importación CSV con Validación Previa
                </h3>
              </div>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <p className="text-slate-600">
                Pegá el contenido CSV o cargá un archivo. Formato esperado de columnas:
                <br />
                <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-mono mt-1 inline-block">
                  organizacion, persona, cargo, email, telefono, pais, sitio_web, fuente
                </code>
              </p>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Vincular prospectos a la aplicación:
                </label>
                <select
                  value={csvTargetAppId}
                  onChange={e => setCsvTargetAppId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                >
                  <option value="">Seleccionar aplicación (Opcional)</option>
                  {applications.map(app => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Pegar contenido CSV:</label>
                <textarea
                  rows={4}
                  value={csvRawText}
                  onChange={e => handleParseCsv(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-[11px]"
                  placeholder={`organizacion, persona, cargo, email, telefono, pais, sitio_web, fuente\nClub Paulistano, Marcos Silva, Coord. Vôlei, msilva@paulistano.org.br, +55 11 98888-7777, Brasil, https://paulistano.org.br, Federação Paulista 2026`}
                />
              </div>

              {/* Live Preview Table */}
              {csvPreviewData && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>
                      Vista previa: {csvPreviewData.validRowsCount} filas válidas / {csvPreviewData.invalidRowsCount} con error
                    </span>
                    {csvPreviewData.invalidRowsCount > 0 && (
                      <span className="text-rose-600">Revisar filas sin nombre de organización</span>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Organización</th>
                          <th className="p-2">Contacto</th>
                          <th className="p-2">Email</th>
                          <th className="p-2">Teléfono</th>
                          <th className="p-2">País</th>
                          <th className="p-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreviewData.preview.map((row: any, idx: number) => (
                          <tr key={idx} className={row.isValid ? 'bg-white' : 'bg-rose-50 text-rose-900'}>
                            <td className="p-2 font-semibold">{row.orgName || '(Vacío)'}</td>
                            <td className="p-2">{row.contactPerson || '—'}</td>
                            <td className="p-2">{row.email || '—'}</td>
                            <td className="p-2 font-mono">{row.phone || '—'}</td>
                            <td className="p-2">{row.country || '—'}</td>
                            <td className="p-2 font-bold">{row.isValid ? '✓ Válido' : '✗ Inválido'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setCsvModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancelar
              </button>

              <button
                onClick={handleCommitImport}
                disabled={!csvPreviewData || csvPreviewData.validRowsCount === 0 || isImporting}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isImporting ? 'Importando...' : `Confirmar Importación (${csvPreviewData?.validRowsCount || 0} contactos)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

