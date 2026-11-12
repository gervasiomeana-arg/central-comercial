import React, { useState } from 'react';
import type { Message } from '../types.js';

export type DraftReviewInput = { action: 'edit' | 'approve' | 'reject'; expectedRevision: number; content?: string };
export function DraftReviewPanel({ message, recipient, onReview }: { message: Message; recipient?: string; onReview: (input: DraftReviewInput) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recipientChanged = message.reviewStatus === 'approved' && message.approvedRecipient !== recipient?.trim().toLowerCase();
  const act = async (action: DraftReviewInput['action']) => {
    setBusy(true); setError('');
    try { await onReview({ action, expectedRevision: message.draftRevision || 0, ...(action === 'edit' ? { content } : {}) }); setEditing(false); }
    catch (err: any) { setError(err.message || 'No se pudo guardar la revisión.'); }
    finally { setBusy(false); }
  };
  return <div className="max-w-xl w-full rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
    <p className="font-semibold text-slate-800">{recipientChanged ? 'El destinatario cambió · Revisá la aprobación' : message.reviewStatus === 'approved' ? 'Aprobado · Sin enviar' : message.reviewStatus === 'rejected' ? 'Descartado · Sin enviar' : 'Borrador por revisar · Sin enviar'}</p>
    <p className="text-slate-600 break-all">Para: {recipient || 'Contacto sin email'}</p>
    {recipientChanged && <p className="text-amber-800 break-all">La revisión anterior correspondía a {message.approvedRecipient}.</p>}
    {message.reviewedAt && <p className="text-slate-500">Revisado el {new Date(message.reviewedAt).toLocaleString('es-AR')}</p>}
    {editing && <label className="block">Nota de promoción<textarea aria-label="Editar nota de promoción" className="mt-2 w-full border border-slate-300 rounded-lg p-3" value={content} maxLength={20000} onChange={e => setContent(e.target.value)} disabled={busy}/></label>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {editing ? <><button disabled={busy || !content.trim()} onClick={() => act('edit')} className="px-3 py-2 rounded-lg bg-blue-600 text-white">Guardar nota</button><button disabled={busy} onClick={() => { setEditing(false); setContent(message.content); }} className="px-3 py-2 border rounded-lg">Cancelar edición</button></> : <>
        <button disabled={busy} onClick={() => setEditing(true)} className="px-3 py-2 border rounded-lg">Editar nota</button>
        {(message.reviewStatus !== 'approved' || recipientChanged) && <button disabled={busy} onClick={() => act('approve')} className="px-3 py-2 bg-blue-600 text-white rounded-lg">Aprobar nota</button>}
        {message.reviewStatus !== 'rejected' && <button disabled={busy} onClick={() => act('reject')} className="px-3 py-2 border rounded-lg">Descartar</button>}
      </>}
    </div>
    <p className="text-slate-500">La aprobación guarda tu revisión. El envío se habilitará al conectar el correo.</p>
  </div>;
}
