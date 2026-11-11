import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './server/db.js';
import { scheduler } from './server/scheduler.js';
import { analyzeAndSuggestResponse } from './server/ai.js';
import type { Contact, Campaign, Application, PaymentRecord, ClientSubscription } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Start background task runner
scheduler.start(30000);

// --- API ROUTES ---

// Health & System Status
app.get('/api/status', (req, res) => {
  const schedulerState = db.getSchedulerState();
  res.json({
    appName: 'Central Comercial',
    status: 'online',
    version: '1.0.0',
    mode: isProduction ? 'production' : 'development',
    scheduler: schedulerState,
    storage: 'local_file_db',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
  });
});

// Dashboard Metrics
app.get('/api/dashboard', (req, res) => {
  const appFilter = (req.query.app as string) || 'all';
  const period = (req.query.period as string) || 'all';
  const metrics = db.getDashboardMetrics(appFilter, period);
  res.json(metrics);
});

// Global Automation Pause / Resume
app.post('/api/automation/pause', (req, res) => {
  const state = db.setAutomationsPaused(true);
  res.json({ success: true, scheduler: state });
});

app.post('/api/automation/resume', (req, res) => {
  const state = db.setAutomationsPaused(false);
  res.json({ success: true, scheduler: state });
});

// --- APPLICATIONS ---
app.get('/api/applications', (req, res) => {
  res.json(db.getApplications());
});

app.get('/api/applications/:id', (req, res) => {
  const application = db.getApplicationById(req.params.id);
  if (!application) {
    return res.status(404).json({ error: 'Aplicación no encontrada' });
  }
  res.json(application);
});

app.post('/api/applications', (req, res) => {
  try {
    const body: Application = req.body;
    if (!body.name || !body.slug) {
      return res.status(400).json({ error: 'Nombre y identificador (slug) son obligatorios.' });
    }
    const saved = db.saveApplication(body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/applications/:id', (req, res) => {
  try {
    const body: Application = req.body;
    body.id = req.params.id;
    const saved = db.saveApplication(body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONTACTS ---
app.get('/api/contacts', (req, res) => {
  let contacts = db.getContacts();
  const search = (req.query.search as string || '').toLowerCase();
  const appFilter = req.query.app as string;
  const statusFilter = req.query.status as string;

  if (search) {
    contacts = contacts.filter(c =>
      c.orgName.toLowerCase().includes(search) ||
      c.contactPerson.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search) ||
      c.phone.toLowerCase().includes(search) ||
      c.country.toLowerCase().includes(search)
    );
  }
  if (appFilter && appFilter !== 'all') {
    contacts = contacts.filter(c => c.interestedAppIds.includes(appFilter));
  }
  if (statusFilter && statusFilter !== 'all') {
    contacts = contacts.filter(c => c.status === statusFilter);
  }

  res.json(contacts);
});

app.get('/api/contacts/:id', (req, res) => {
  const contact = db.getContactById(req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contacto no encontrado' });
  }
  res.json(contact);
});

app.post('/api/contacts', (req, res) => {
  try {
    const body: Partial<Contact> = req.body;
    if (!body.orgName) {
      return res.status(400).json({ error: 'El nombre de la organización es obligatorio.' });
    }

    const newContact: Contact = {
      id: `cont-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orgName: body.orgName,
      contactPerson: body.contactPerson || '',
      role: body.role || '',
      orgType: body.orgType || 'club',
      country: body.country || '',
      language: body.language || 'es',
      timezone: body.timezone || 'America/Argentina/Buenos_Aires',
      website: body.website || '',
      email: body.email || '',
      phone: body.phone || '',
      source: body.source || 'Carga manual directa',
      sourceReviewDate: body.sourceReviewDate || new Date().toISOString().split('T')[0],
      interestedAppIds: body.interestedAppIds || [],
      assignedTo: body.assignedTo || 'Administrador',
      notes: body.notes || '',
      history: [],
      preferredChannel: body.preferredChannel || 'email',
      permission: body.permission || 'desconocido',
      status: body.status || 'prospecto',
      nextFollowUpDate: body.nextFollowUpDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = db.saveContact(newContact);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contacts/:id', (req, res) => {
  try {
    const existing = db.getContactById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    const updated: Contact = {
      ...existing,
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    };
    const saved = db.saveContact(updated);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  const success = db.deleteContact(req.params.id);
  res.json({ success });
});

// Check duplicates
app.post('/api/contacts/check-duplicates', (req, res) => {
  const { contact, excludeId } = req.body;
  const duplicates = db.findDuplicateContacts(contact, excludeId);
  const hasDuplicates =
    duplicates.matchedByEmail.length > 0 ||
    duplicates.matchedByPhone.length > 0 ||
    duplicates.matchedByDomain.length > 0;

  res.json({
    hasDuplicates,
    matches: duplicates
  });
});

// Merge duplicate contacts
app.post('/api/contacts/merge', (req, res) => {
  try {
    const { targetId, sourceId } = req.body;
    if (!targetId || !sourceId) {
      return res.status(400).json({ error: 'targetId y sourceId son obligatorios.' });
    }
    const merged = db.mergeContacts(targetId, sourceId);
    res.json({ success: true, contact: merged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Import Preview & Validation
app.post('/api/contacts/import-preview', (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'El contenido CSV es inválido o está vacío.' });
    }

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'El archivo CSV debe contener encabezados y al menos una fila de datos.' });
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

    const previewRows: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const rawCols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (rawCols.length === 0 || rawCols.every(c => !c)) continue;

      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = rawCols[idx] || '';
      });

      const orgName = rowObj['organizacion'] || rowObj['empresa'] || rowObj['club'] || rowObj['nombre_organizacion'] || rawCols[0] || '';
      const email = rowObj['email'] || rowObj['correo'] || '';
      const phone = rowObj['telefono'] || rowObj['whatsapp'] || '';
      const contactPerson = rowObj['contacto'] || rowObj['persona'] || rowObj['nombre'] || '';
      const country = rowObj['pais'] || '';
      const website = rowObj['sitio_web'] || rowObj['web'] || rowObj['url'] || '';
      const source = rowObj['fuente'] || 'Importación CSV';

      if (!orgName) {
        errors.push(`Fila ${i + 1}: Nombre de organización vacío.`);
      }

      previewRows.push({
        rowIndex: i + 1,
        orgName,
        contactPerson,
        email,
        phone,
        country,
        website,
        source,
        isValid: Boolean(orgName)
      });
    }

    res.json({
      totalRows: lines.length - 1,
      validRowsCount: previewRows.filter(r => r.isValid).length,
      invalidRowsCount: errors.length,
      errors,
      preview: previewRows.slice(0, 15),
      allRows: previewRows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Import Commit
app.post('/api/contacts/import-commit', (req, res) => {
  try {
    const { rows, appId } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Se esperaba un arreglo de filas para importar.' });
    }

    let importedCount = 0;
    const created: Contact[] = [];

    for (const r of rows) {
      if (!r.orgName) continue;
      const newContact: Contact = {
        id: `cont-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        orgName: r.orgName,
        contactPerson: r.contactPerson || '',
        role: r.role || '',
        orgType: r.orgType || 'club',
        country: r.country || '',
        language: r.language || 'es',
        timezone: r.timezone || 'America/Argentina/Buenos_Aires',
        website: r.website || '',
        email: r.email || '',
        phone: r.phone || '',
        source: r.source || 'Importación masiva CSV',
        sourceReviewDate: new Date().toISOString().split('T')[0],
        interestedAppIds: appId ? [appId] : [],
        assignedTo: 'Administrador',
        notes: `Importado en lote el ${new Date().toLocaleDateString('es')}.`,
        history: [{
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'creacion',
          description: 'Contacto importado desde archivo CSV',
          author: 'Administrador'
        }],
        preferredChannel: r.email ? 'email' : (r.phone ? 'whatsapp' : 'email'),
        permission: 'desconocido',
        status: 'prospecto',
        nextFollowUpDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.saveContact(newContact);
      created.push(newContact);
      importedCount++;
    }

    db.addLog('info', 'contactos', `Importación CSV completada: ${importedCount} contactos creados.`);
    res.json({ success: true, importedCount, created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export
app.get('/api/contacts/export', (req, res) => {
  const contacts = db.getContacts();
  const headers = ['ID', 'Organizacion', 'Persona_Contacto', 'Cargo', 'Tipo', 'Pais', 'Email', 'Telefono', 'Sitio_Web', 'Fuente', 'Permiso', 'Estado', 'Proximo_Seguimiento'];
  
  const rows = contacts.map(c => [
    c.id,
    `"${c.orgName.replace(/"/g, '""')}"`,
    `"${c.contactPerson.replace(/"/g, '""')}"`,
    `"${c.role.replace(/"/g, '""')}"`,
    c.orgType,
    `"${c.country}"`,
    c.email,
    c.phone,
    `"${c.website}"`,
    `"${c.source.replace(/"/g, '""')}"`,
    c.permission,
    c.status,
    c.nextFollowUpDate || ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contactos_central_comercial.csv"');
  res.send(csv);
});

// --- CAMPAIGNS ---
app.get('/api/campaigns', (req, res) => {
  res.json(db.getCampaigns());
});

app.get('/api/campaigns/:id', (req, res) => {
  const camp = db.getCampaignById(req.params.id);
  if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json(camp);
});

app.post('/api/campaigns', (req, res) => {
  try {
    const body: Campaign = req.body;
    if (!body.name || !body.appId) {
      return res.status(400).json({ error: 'Nombre de campaña y aplicación asociada son obligatorios.' });
    }
    const result = db.saveCampaign(body);
    if (result.error) {
      return res.status(400).json({ error: result.error, campaign: result.campaign });
    }
    res.json(result.campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/campaigns/:id', (req, res) => {
  try {
    const body: Campaign = req.body;
    body.id = req.params.id;
    const result = db.saveCampaign(body);
    if (result.error) {
      return res.status(400).json({ error: result.error, campaign: result.campaign });
    }
    res.json(result.campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONVERSATIONS & INBOX ---
app.get('/api/conversations', (req, res) => {
  res.json(db.getConversations());
});

app.get('/api/conversations/:id', (req, res) => {
  const conv = db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json(conv);
});

// AI Assistant Response Suggestion Endpoint
app.post('/api/conversations/ai-suggest', async (req, res) => {
  try {
    const { appId, contactName, messageContent, conversationHistory } = req.body;
    const app = db.getApplicationById(appId);
    if (!app) {
      return res.status(404).json({ error: 'Aplicación comercial no encontrada.' });
    }

    const suggestion = await analyzeAndSuggestResponse(
      app,
      contactName || 'Prospecto',
      messageContent || '',
      conversationHistory || []
    );

    // If suggestion requires human intervention, create a high-priority task for admin
    if (suggestion.requiresHumanIntervention) {
      db.saveTask({
        id: `task-ai-escalate-${Date.now()}`,
        title: `Intervención requerida: Consulta de ${contactName || 'Prospecto'} (${app.name})`,
        description: `Motivo: ${suggestion.interventionReason || 'Consulta no cubierta por FAQ oficial'}. Mensaje recibido: "${messageContent}"`,
        priority: 'alta',
        category: 'intervencion_ia',
        relatedType: 'conversacion',
        dueDate: null,
        status: 'pendiente',
        createdAt: new Date().toISOString()
      });
    }

    res.json(suggestion);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add message to conversation
app.post('/api/conversations/:id/messages', (req, res) => {
  try {
    const { content, direction, channel, status, serviceConfirmationId } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'El contenido del mensaje no puede estar vacío.' });
    }

    // Safety rule: Never mark as sent if not confirmed!
    let finalStatus = status;
    if (direction === 'outbound' && !serviceConfirmationId && status === 'enviado') {
      finalStatus = 'resultado_desconocido';
    }

    const newMsg = db.addMessageToConversation(req.params.id, {
      conversationId: req.params.id,
      direction: direction || 'outbound',
      channel: channel || 'email',
      content,
      status: finalStatus || 'pendiente',
      serviceConfirmationId
    });

    res.json(newMsg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new conversation
app.post('/api/conversations', (req, res) => {
  try {
    const body = req.body;
    const newConv = {
      id: `conv-${Date.now()}`,
      contactId: body.contactId,
      appId: body.appId,
      campaignId: body.campaignId || null,
      channel: body.channel || 'email',
      classification: body.classification || 'sin_clasificar',
      requiresHumanIntervention: Boolean(body.requiresHumanIntervention),
      adminNote: body.adminNote || '',
      messages: body.messages || [],
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const saved = db.saveConversation(newConv);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CLIENTS & CURRENT ACCOUNT (CUENTA CORRIENTE) ---
app.get('/api/clients', (req, res) => {
  res.json(db.getClients());
});

app.post('/api/clients/convert-from-contact', (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) return res.status(400).json({ error: 'contactId es obligatorio.' });
    const client = db.convertContactToClient(contactId);
    res.json(client);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Subscriptions
app.get('/api/subscriptions', (req, res) => {
  res.json(db.getSubscriptions());
});

app.post('/api/subscriptions', (req, res) => {
  try {
    const body: ClientSubscription = req.body;
    if (!body.clientId || !body.appId || !body.planName) {
      return res.status(400).json({ error: 'Cliente, aplicación y plan son obligatorios.' });
    }
    body.id = body.id || `sub-${Date.now()}`;
    const saved = db.saveSubscription(body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Payments & Manual Confirmation Workflow
app.get('/api/payments', (req, res) => {
  res.json(db.getPayments());
});

app.post('/api/payments', (req, res) => {
  try {
    const body: PaymentRecord = req.body;
    if (!body.clientId || !body.amount || !body.currency) {
      return res.status(400).json({ error: 'Cliente, importe y moneda son obligatorios.' });
    }

    body.id = body.id || `pay-${Date.now()}`;
    // Force manual confirmation status initially as requested
    body.status = body.status || 'pendiente_confirmacion_manual';

    const saved = db.savePayment(body);

    if (saved.status === 'pendiente_confirmacion_manual') {
      db.saveTask({
        id: `task-pay-review-${saved.id}`,
        title: `Revisar y auditar pago de ${saved.currency} ${saved.amount}`,
        description: `Comprobante / Referencia: ${saved.referenceNumber || 'Sin número'}. Revisar extracto bancario o pasarela y confirmar manualmente.`,
        priority: 'alta',
        category: 'revision_pago',
        relatedType: 'pago',
        relatedId: saved.id,
        dueDate: null,
        status: 'pendiente',
        createdAt: new Date().toISOString()
      });
    }

    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/:id/review', (req, res) => {
  try {
    const { status, auditorNote, reviewedBy } = req.body;
    const payments = db.getPayments();
    const payment = payments.find(p => p.id === req.params.id);
    if (!payment) return res.status(404).json({ error: 'Registro de pago no encontrado.' });

    payment.status = status; // 'confirmado' | 'rechazado' | 'pendiente_confirmacion_manual'
    payment.auditorNote = auditorNote || payment.auditorNote;
    payment.reviewedBy = reviewedBy || 'Administrador Comercial';
    payment.reviewedAt = new Date().toISOString();

    db.savePayment(payment);

    // If confirmed, mark any associated task as completed
    if (status === 'confirmado' || status === 'rechazado') {
      const task = db.getTasks().find(t => t.relatedId === payment.id && t.status === 'pendiente');
      if (task) {
        task.status = 'completada';
        db.saveTask(task);
      }
    }

    db.addLog(
      status === 'confirmado' ? 'info' : 'warning',
      'pagos',
      `Auditoría de pago ID ${payment.id}: ${status.toUpperCase()} por ${payment.reviewedBy}`,
      { paymentId: payment.id, amount: payment.amount, currency: payment.currency, status }
    );

    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TASKS ---
app.get('/api/tasks', (req, res) => {
  res.json(db.getTasks());
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const existing = db.getTasks().find(t => t.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' });
    Object.assign(existing, req.body);
    db.saveTask(existing);
    res.json(existing);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONNECTORS ---
app.get('/api/connectors', (req, res) => {
  res.json(db.getConnectors());
});

app.post('/api/connectors/:id/test', (req, res) => {
  const connector = db.getConnectors().find(c => c.id === req.params.id);
  if (!connector) return res.status(404).json({ error: 'Conector no encontrado' });

  // Real connection verification logic (contract test)
  if (connector.status === 'pendiente_conexion') {
    return res.json({
      success: false,
      status: 'pendiente_conexion',
      message: 'Prueba de ping no realizada: faltan credenciales requeridas.',
      missingRequirements: connector.missingRequirements
    });
  }

  res.json({
    success: true,
    status: connector.status,
    lastPingAt: new Date().toISOString()
  });
});

app.put('/api/connectors/:id', (req, res) => {
  try {
    const updated = db.updateConnector(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- LOGS & AUDIT ---
app.get('/api/logs', (req, res) => {
  const logs = db.getRaw().logs;
  const level = req.query.level as string;
  const moduleName = req.query.module as string;

  let filtered = logs;
  if (level && level !== 'all') {
    filtered = filtered.filter(l => l.level === level);
  }
  if (moduleName && moduleName !== 'all') {
    filtered = filtered.filter(l => l.module === moduleName);
  }

  res.json(filtered);
});

// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Central Comercial] Servidor activo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Error starting Central Comercial server:', err);
});
