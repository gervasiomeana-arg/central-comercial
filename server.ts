import express from 'express';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './server/db.js';
import { scheduler } from './server/scheduler.js';
import { ChannelTestQueue, registerWorkerTestRoutes } from './server/channelTests.js';
import { analyzeAndSuggestResponse } from './server/ai.js';
import { authManager, requireAdminAuth, passwordlessTestingEnabled, TESTING_ADMIN } from './server/auth.js';
import { testConnectorReal } from './server/connectors.js';
import type { Contact, Campaign, Application, PaymentRecord, ClientSubscription } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const channelTests = new ChannelTestQueue(path.join(__dirname, 'data/channel_test_jobs.json'));
registerWorkerTestRoutes(app, channelTests);

// Start background task runner
scheduler.start(30000);

// --- PUBLIC AUTH & HEALTH ROUTES ---

// Health & System Status (Public, does not reveal private business data)
app.get('/api/status', (req, res) => {
  const schedulerState = db.getSchedulerState();
  const persistenceStatus = db.getPersistenceStatus();
  const pipelineStatus = db.getAutomationPipelineStatus();

  res.json({
    appName: 'Central Comercial',
    status: 'online',
    version: '1.0.0',
    mode: isProduction ? 'production' : 'development',
    scheduler: schedulerState,
    storage: 'local_file_db',
    persistence: persistenceStatus,
    pipeline: pipelineStatus,
    adminConfigured: authManager.isConfigured(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
  });
});

// Auth Status Check
app.get('/api/auth/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (passwordlessTestingEnabled()) {
    return res.json({
      configured: true,
      authenticated: true,
      admin: { ...TESTING_ADMIN },
      setupKeyRequired: false,
      passwordlessTesting: true
    });
  }
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  }

  const session = authManager.validateSession(token);
  const isConfigured = authManager.isConfigured();

  res.json({
    configured: isConfigured,
    authenticated: Boolean(session),
    admin: session ? { id: session.adminId, email: session.email, name: session.name } : undefined,
    setupKeyRequired: !isConfigured
  });
});

// Credential changes are unnecessary while direct test access is enabled.
app.use(['/api/auth/setup', '/api/auth/recover', '/api/auth/login'], (req, res, next) => {
  if (passwordlessTestingEnabled()) {
    return res.status(409).json({ error: 'El acceso de pruebas es directo y no requiere contraseña. Recargue la página.' });
  }
  next();
});

// Setup First Admin Account (Requires the server Master Setup Key to prevent random visitors becoming admin)
app.post('/api/auth/setup', (req, res) => {
  try {
    const { email, password, name, setupKey } = req.body;
    const result = authManager.setupFirstAdmin(email, password, name, setupKey);

    db.addLog('info', 'seguridad', `Administrador inicial configurado: ${result.admin.email}`, {
      email: result.admin.email,
      ip: req.ip
    });

    res.json({
      success: true,
      sessionToken: result.sessionToken,
      admin: result.admin
    });
  } catch (err: any) {
    db.addLog('warning', 'seguridad', `Intento fallido de configuración de administrador: ${err.message}`, {
      ip: req.ip,
      error: err.message
    });
    res.status(400).json({ error: err.message });
  }
});

// One-time owner recovery. No credentials or recovery keys are logged.
let recoveryAttempts: number[] = [];
app.post('/api/auth/recover', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Se requiere JSON.' });
  }
  const now = Date.now();
  recoveryAttempts = recoveryAttempts.filter(t => now - t < 15 * 60 * 1000);
  if (recoveryAttempts.length >= 5) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Demasiados intentos. Espere 15 minutos.' });
  }
  recoveryAttempts.push(now);
  try {
    const { email, password, recoveryKey } = req.body;
    authManager.recoverPassword(email, password, recoveryKey);
    db.addLog('info', 'seguridad', 'Contraseña administrativa recuperada por el propietario; sesiones revocadas.');
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Admin Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const result = authManager.login(email, password);

    db.addLog('info', 'seguridad', `Inicio de sesión exitoso: ${result.admin.email}`, {
      email: result.admin.email,
      ip: req.ip
    });

    res.json({
      success: true,
      sessionToken: result.sessionToken,
      admin: result.admin
    });
  } catch (err: any) {
    db.addLog('warning', 'seguridad', `Intento fallido de inicio de sesión: ${err.message}`, {
      email: req.body.email,
      ip: req.ip
    });
    res.status(401).json({ error: err.message });
  }
});

// Admin Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  }

  authManager.logout(token);
  res.json({ success: true });
});

// --- PROTECTED ADMINISTRATIVE ROUTES ---
// ALL endpoints below require real authenticated admin token
const adminRouter = express.Router();
adminRouter.use(requireAdminAuth);

adminRouter.get('/channel-tests', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...channelTests.status(), workerConfigured: (process.env.CHANNEL_TEST_WORKER_KEY || '').length >= 32 });
});

adminRouter.post('/channel-tests', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if ((process.env.CHANNEL_TEST_WORKER_KEY || '').length < 32) {
    return res.status(409).json({ error: 'Falta configurar la clave privada del ejecutor. No se envió ningún mensaje.' });
  }
  if (!Array.isArray(req.body.channels) || req.body.channels.length < 1 || req.body.channels.length > 2) {
    return res.status(400).json({ error: 'Seleccione uno o dos canales.' });
  }
  try { return res.json({ jobs: channelTests.enqueue(req.body.channels) }); }
  catch (error: any) { return res.status(409).json({ error: error.message }); }
});

// Automation Pipeline Status: explicitly separating each stage (Requirement 3)
adminRouter.get('/automation/pipeline', (req, res) => {
  res.json(db.getAutomationPipelineStatus());
});

// Persistence & Backup status (Requirement 5)
adminRouter.get('/system/persistence', (req, res) => {
  res.json(db.getPersistenceStatus());
});

// Download JSON database backup file
adminRouter.get('/system/backup', (req, res) => {
  const data = db.getRaw();
  const filename = `central_comercial_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(data, null, 2));
});

// Dashboard Metrics
adminRouter.get('/dashboard', (req, res) => {
  const appFilter = (req.query.app as string) || 'all';
  const period = (req.query.period as string) || 'all';
  const metrics = db.getDashboardMetrics(appFilter, period);
  res.json(metrics);
});

// Executive Summary: answering What is it doing, What did it achieve, What does it need from me
adminRouter.get('/dashboard/executive', (req, res) => {
  const appFilter = (req.query.app as string) || 'all';
  const period = (req.query.period as string) || 'all';
  const summary = db.getExecutiveSummary(appFilter, period);
  res.json(summary);
});

// Global Automation Pause / Resume
adminRouter.post('/automation/pause', (req, res) => {
  const state = db.setAutomationsPaused(true);
  res.json({ success: true, scheduler: state });
});

adminRouter.post('/automation/resume', (req, res) => {
  const state = db.setAutomationsPaused(false);
  res.json({ success: true, scheduler: state });
});

// --- APPLICATIONS ---
adminRouter.get('/applications', (req, res) => {
  res.json(db.getApplications());
});

adminRouter.get('/applications/:id', (req, res) => {
  const application = db.getApplicationById(req.params.id);
  if (!application) {
    return res.status(404).json({ error: 'Aplicación no encontrada' });
  }
  res.json(application);
});

adminRouter.post('/applications', (req, res) => {
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

adminRouter.put('/applications/:id', (req, res) => {
  try {
    const body: Application = req.body;
    body.id = req.params.id;
    const saved = db.saveApplication(body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin verification toggle for a plan (Requirement 2)
adminRouter.post('/applications/:appId/plans/:planId/verify', (req, res) => {
  try {
    const { verified } = req.body;
    const updated = db.verifyPlan(req.params.appId, req.params.planId, Boolean(verified));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin verification toggle for an FAQ (Requirement 2)
adminRouter.post('/applications/:appId/faqs/:faqId/verify', (req, res) => {
  try {
    const { approved } = req.body;
    const updated = db.verifyFaq(req.params.appId, req.params.faqId, Boolean(approved));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONTACTS ---
adminRouter.get('/contacts', (req, res) => {
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

adminRouter.get('/contacts/:id', (req, res) => {
  const contact = db.getContactById(req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contacto no encontrado' });
  }
  res.json(contact);
});

adminRouter.post('/contacts', (req, res) => {
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
      assignedTo: (req as any).admin?.name || 'Administrador',
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

adminRouter.put('/contacts/:id', (req, res) => {
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

adminRouter.delete('/contacts/:id', (req, res) => {
  const success = db.deleteContact(req.params.id);
  res.json({ success });
});

// Check duplicates
adminRouter.post('/contacts/check-duplicates', (req, res) => {
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
adminRouter.post('/contacts/merge', (req, res) => {
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
adminRouter.post('/contacts/import-preview', (req, res) => {
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
adminRouter.post('/contacts/import-commit', (req, res) => {
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
        assignedTo: (req as any).admin?.name || 'Administrador',
        notes: `Importado en lote el ${new Date().toLocaleDateString('es')}.`,
        history: [{
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'creacion',
          description: 'Contacto importado desde archivo CSV',
          author: (req as any).admin?.name || 'Administrador'
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
adminRouter.get('/contacts/export', (req, res) => {
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
adminRouter.get('/campaigns', (req, res) => {
  res.json(db.getCampaigns());
});

adminRouter.get('/campaigns/:id', (req, res) => {
  const camp = db.getCampaignById(req.params.id);
  if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json(camp);
});

adminRouter.post('/campaigns', (req, res) => {
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

adminRouter.put('/campaigns/:id', (req, res) => {
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

// Próximo Hito: End-to-end email sandbox simulation run
adminRouter.post('/campaigns/sandbox-test-run', async (req, res) => {
  try {
    const { appId, testEmail, testOrgName, contactPerson } = req.body;
    if (!appId || !testEmail) {
      return res.status(400).json({ error: 'Debe especificar la aplicación (appId) y el correo electrónico de prueba (testEmail).' });
    }
    const result = await db.executeEmailSandboxRun({
      appId,
      testEmail,
      testOrgName: testOrgName || 'Club de Prueba Controlada',
      contactPerson: contactPerson || 'Administrador Evaluador'
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONVERSATIONS & INBOX ---
adminRouter.get('/conversations', (req, res) => {
  res.json(db.getConversations());
});

adminRouter.get('/conversations/:id', (req, res) => {
  const conv = db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json(conv);
});

// AI Assistant Response Suggestion Endpoint (Uses only verified plans & approved FAQs)
adminRouter.post('/conversations/ai-suggest', async (req, res) => {
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
adminRouter.post('/conversations/:id/messages', (req, res) => {
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
adminRouter.post('/conversations', (req, res) => {
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
adminRouter.get('/clients', (req, res) => {
  res.json(db.getClients());
});

adminRouter.post('/clients/convert-from-contact', (req, res) => {
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
adminRouter.get('/subscriptions', (req, res) => {
  res.json(db.getSubscriptions());
});

adminRouter.post('/subscriptions', (req, res) => {
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

// Payments & STRICT Manual Confirmation Workflow (Requirement 6)
adminRouter.get('/payments', (req, res) => {
  res.json(db.getPayments());
});

adminRouter.post('/payments', (req, res) => {
  try {
    const body: PaymentRecord = req.body;
    if (!body.clientId || !body.amount || !body.currency) {
      return res.status(400).json({ error: 'Cliente, importe y moneda son obligatorios.' });
    }

    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
      return res.status(400).json({ error: 'El importe debe ser un número finito mayor que cero.' });
    }
    if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) {
      return res.status(400).json({ error: 'La moneda debe ser un código de tres letras mayúsculas, por ejemplo USD.' });
    }
    if (body.id && db.getPayments().some(p => p.id === body.id)) {
      return res.status(409).json({ error: 'Ese pago ya existe. No se sobrescriben movimientos desde el alta de pagos.' });
    }
    body.id = body.id || `pay-${crypto.randomUUID()}`;

    // STRICT REQUIREMENT 6: ALL new payments MUST stay in pending status, even if the request tries to send it as confirmed!
    body.status = 'pendiente_confirmacion_manual';
    body.reviewedBy = undefined;
    body.reviewedAt = undefined;

    const saved = db.savePayment(body);

    db.saveTask({
      id: `task-pay-review-${saved.id}`,
      title: `Revisar y auditar pago de ${saved.currency} ${saved.amount}`,
      description: `Comprobante / Referencia: ${saved.referenceNumber || 'Sin número'}. Revisar extracto bancario y confirmar manualmente.`,
      priority: 'alta',
      category: 'revision_pago',
      relatedType: 'pago',
      relatedId: saved.id,
      dueDate: null,
      status: 'pendiente',
      createdAt: new Date().toISOString()
    });

    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Review payment (ONLY authenticated admin can confirm or reject!)
adminRouter.post('/payments/:id/review', (req, res) => {
  try {
    const { status, auditorNote } = req.body;
    if (status !== 'confirmado' && status !== 'rechazado') {
      return res.status(400).json({ error: 'El estado solo puede ser "confirmado" o "rechazado".' });
    }

    const payments = db.getPayments();
    const payment = payments.find(p => p.id === req.params.id);
    if (!payment) return res.status(404).json({ error: 'Registro de pago no encontrado.' });

    const admin = (req as any).admin;
    payment.status = status;
    payment.auditorNote = auditorNote || payment.auditorNote;
    payment.reviewedBy = admin?.email || 'Administrador Central';
    payment.reviewedAt = new Date().toISOString();

    db.savePayment(payment);

    // If confirmed/rejected, complete pending task
    const task = db.getTasks().find(t => t.relatedId === payment.id && t.status === 'pendiente');
    if (task) {
      task.status = 'completada';
      db.saveTask(task);
    }

    db.addLog(
      status === 'confirmado' ? 'info' : 'warning',
      'pagos',
      `Auditoría de pago ID ${payment.id}: ${status.toUpperCase()} por ${payment.reviewedBy}`,
      { paymentId: payment.id, amount: payment.amount, currency: payment.currency, status, auditor: payment.reviewedBy }
    );

    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TASKS ---
adminRouter.get('/tasks', (req, res) => {
  res.json(db.getTasks());
});

adminRouter.put('/tasks/:id', (req, res) => {
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

// --- CONNECTORS (REAL PROVIDER VERIFICATION: Requirement 4) ---
adminRouter.get('/connectors', (req, res) => {
  res.json(db.getConnectors());
});

adminRouter.post('/connectors/:id/test', async (req, res) => {
  const connector = db.getConnectors().find(c => c.id === req.params.id);
  if (!connector) return res.status(404).json({ error: 'Conector no encontrado' });

  // Execute REAL provider network check (does not send messages!)
  const testResult = await testConnectorReal(connector);

  if (testResult.success) {
    connector.status = 'conectado';
    connector.lastPingAt = new Date().toISOString();
    connector.lastError = undefined;
    connector.statusDescription = `Conectado y verificado con el proveedor: ${testResult.message}`;
    db.save();
    db.addLog('info', 'conectores', `Conector ${connector.name} verificado exitosamente con proveedor real.`);
  } else {
    connector.status = connector.configSummary.host !== 'No configurado' ? 'error' : 'pendiente_conexion';
    connector.lastError = testResult.errorDetails || testResult.message;
    connector.statusDescription = testResult.message;
    db.save();
    db.addLog('warning', 'conectores', `Fallo al verificar conector ${connector.name}: ${testResult.message}`);
  }

  res.json({
    success: testResult.success,
    status: connector.status,
    message: testResult.message,
    errorDetails: testResult.errorDetails,
    providerResponse: testResult.providerResponse,
    lastPingAt: connector.lastPingAt
  });
});

adminRouter.put('/connectors/:id', (req, res) => {
  try {
    const updated = db.updateConnector(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- LOGS & AUDIT ---
adminRouter.get('/logs', (req, res) => {
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

// Mount protected adminRouter on /api
app.use('/api', adminRouter);

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

