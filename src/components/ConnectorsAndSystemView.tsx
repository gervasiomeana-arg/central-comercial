import React, { useState } from 'react';
import { RealChannelTests } from './RealChannelTests.js';
import {
  Settings,
  Server,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Key,
  Terminal,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  FileCode,
  Layers,
  Database,
  Cpu
} from 'lucide-react';
import type { ConnectorInfo, AuditLog, SchedulerState, PersistenceStatus } from '../types.js';

interface ConnectorsAndSystemViewProps {
  connectors: ConnectorInfo[];
  logs: AuditLog[];
  scheduler: SchedulerState;
  onTestConnector: (id: string) => Promise<any>;
  onToggleAutomations: () => void;
  geminiConfigured: boolean;
  persistenceStatus?: PersistenceStatus | null;
}

export const ConnectorsAndSystemView: React.FC<ConnectorsAndSystemViewProps> = ({
  connectors,
  logs,
  scheduler,
  onTestConnector,
  onToggleAutomations,
  geminiConfigured,
  persistenceStatus,
}) => {
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [logFilterLevel, setLogFilterLevel] = useState('all');
  const [logFilterModule, setLogFilterModule] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [activeTab, setActiveTab] = useState<'conectores' | 'scheduler_windows' | 'persistencia_db' | 'logs'>('conectores');

  const filteredLogs = logs.filter(l => {
    const matchesLevel = logFilterLevel === 'all' || l.level === logFilterLevel;
    const matchesModule = logFilterModule === 'all' || l.module === logFilterModule;
    return matchesLevel && matchesModule;
  });

  const handleTest = async (connId: string) => {
    setTestingConnectorId(connId);
    setTestResult(null);
    try {
      const res = await onTestConnector(connId);
      setTestResult({
        id: connId,
        success: res.success,
        message: res.message || (res.success ? 'Conexión verificada exitosamente.' : 'Pendiente de conexión: faltan credenciales.')
      });
    } catch (err: any) {
      setTestResult({
        id: connId,
        success: false,
        message: `Error al verificar conector: ${err.message}`
      });
    } finally {
      setTestingConnectorId(null);
    }
  };

  return (
    <div className="space-y-6">
      <RealChannelTests />
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <span>Conectores Externos, Automatizaciones y Auditoría</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Estado real de telecomunicaciones, motor programado de fondo y registro estructurado de eventos.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleAutomations}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 ${
                scheduler.automationsPaused
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
            >
              {scheduler.automationsPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Reanudar automatizaciones</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pausar automatizaciones</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTab('conectores')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'conectores'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Conectores Externos ({connectors.length})
          </button>
          <button
            onClick={() => setActiveTab('scheduler_windows')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'scheduler_windows'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Motor de Tareas y Ejecución en Windows
          </button>
          <button
            onClick={() => setActiveTab('persistencia_db')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'persistencia_db'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Persistencia y Base de Datos
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'logs'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Registro de Auditoría y Errores ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'conectores' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-xs flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-sm">Política de Conectores Reales (Sin Simulación Falsa)</span>
              <p className="text-[11px] text-blue-900 leading-relaxed">
                Si una función necesita credenciales o servicios externos, se muestra <strong>"Pendiente de conexión"</strong> explicando qué falta. Ningún mensaje se marcará jamás como enviado si no existe confirmación fehaciente del proveedor.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectors.map(conn => {
              const isTesting = testingConnectorId === conn.id;
              const result = testResult?.id === conn.id ? testResult : null;

              return (
                <div
                  key={conn.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">{conn.name}</h3>
                        <span className="font-mono text-[10px] text-slate-400 uppercase">{conn.type}</span>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          conn.status === 'conectado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : conn.status === 'error'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {conn.status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">{conn.statusDescription}</p>

                    {/* Missing requirements checklist */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                      <span className="font-bold text-slate-700 text-[11px] block">
                        Requerimientos técnicos para activar:
                      </span>
                      <ul className="space-y-1 text-[11px]">
                        {conn.missingRequirements.map((req, idx) => (
                          <li key={idx} className="flex items-start space-x-1.5 text-slate-600">
                            <span className="text-amber-600 font-bold">•</span>
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Config summary */}
                    <div className="text-[11px] space-y-0.5 pt-1 text-slate-500">
                      {Object.entries(conn.configSummary).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="capitalize">{k}:</span>
                          <span className="font-mono font-semibold text-slate-700">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Test result message */}
                    {result && (
                      <div
                        className={`p-2.5 rounded-lg text-xs font-semibold ${
                          result.success
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {result.message}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    {conn.documentationUrl ? (
                      <a
                        href={conn.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline flex items-center space-x-1"
                      >
                        <span>Documentación oficial</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">Sin guía externa</span>
                    )}

                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={isTesting}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                      {isTesting ? 'Verificando ping...' : 'Comprobar contrato'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'scheduler_windows' && (
        <div className="space-y-6">
          {/* Status Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 text-xs">
            <div className="flex items-center space-x-2 border-b pb-2">
              <Server className="w-5 h-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Motor de Tareas en Segundo Plano (Scheduler)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[11px]">Estado del proceso:</span>
                <span className={`text-base font-black ${scheduler.isRunning ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {scheduler.isRunning ? 'En ejecución periódica (30s)' : 'Detenido'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[11px]">Última verificación de tareas:</span>
                <span className="text-xs font-bold text-slate-800">
                  {scheduler.lastRunAt ? new Date(scheduler.lastRunAt).toLocaleTimeString('es') : 'Esperando ciclo inicial...'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[11px]">Automatizaciones globales:</span>
                <span className={`text-base font-black ${scheduler.automationsPaused ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {scheduler.automationsPaused ? 'PAUSADAS' : 'ACTIVAS'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs">
              <strong>ADVERTENCIA TÉCNICA FUNDAMENTAL:</strong> La aplicación publicada y el proceso que ejecuta trabajos programados son componentes distintos. Una pestaña abierta en el navegador <strong>NO</strong> garantiza trabajo autónomo continuo. Para ejecución desatendida, el servidor debe correr como proceso en background.
            </div>
          </div>

          {/* Windows autonomous execution instructions */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Ejecución Autónoma en Computadora Windows
                </h3>
              </div>
              <span className="font-mono text-[11px] bg-slate-100 px-2.5 py-0.5 rounded text-slate-700">
                scripts/run-scheduler-windows.bat
              </span>
            </div>

            <p className="text-slate-600 leading-relaxed">
              El repositorio incluye el archivo ejecutable <code>scripts\run-scheduler-windows.bat</code> y la guía completa <code>scripts\windows-service-setup.md</code> para poner en marcha el servidor y motor comercial sin depender del navegador ni de este chat.
            </p>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] space-y-1">
                <p className="text-emerald-400 font-bold"># Opción rápida con lanzador por lotes (.bat):</p>
                <p>1. Instalar Node.js v20+ LTS en Windows (https://nodejs.org)</p>
                <p>2. Doble clic en: scripts\run-scheduler-windows.bat</p>
                <p>3. El servidor y motor correrán autónomamente en http://localhost:3000</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] space-y-1">
                <p className="text-blue-400 font-bold"># Opción como Demonio de Fondo Permanente con PM2:</p>
                <p>npm install -g pm2</p>
                <p>pm2 start server.ts --name "central-comercial" --interpreter "node" --node-args="--loader tsx"</p>
                <p>pm2 save</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'persistencia_db' && (
        <div className="space-y-6 text-xs">
          {/* Storage Overview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Persistencia y Almacenamiento de Datos
                </h2>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                persistenceStatus?.postgresConfigured
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}>
                {persistenceStatus?.postgresConfigured ? 'Motor: PostgreSQL Remoto' : 'Motor: Archivo JSON Local con Fsync'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-400 text-[11px] block">Ruta del archivo local:</span>
                <span className="font-mono text-slate-700 font-bold break-all">
                  {persistenceStatus?.filePath || 'data/central_comercial_db.json'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-400 text-[11px] block">Tamaño y Respaldos:</span>
                <span className="text-slate-800 font-bold block">
                  {persistenceStatus?.fileSizeBytes ? `${(persistenceStatus.fileSizeBytes / 1024).toFixed(1)} KB` : 'Activo'}
                  {' · '}
                  <span className="text-blue-600">{persistenceStatus?.backupCount ?? 0} copias rotativas</span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 flex flex-col justify-between">
                <span className="text-slate-400 text-[11px] block">Respaldo Inmediato:</span>
                <a
                  href="/api/system/backup"
                  download
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-center transition-colors"
                >
                  Descargar Copia de Seguridad JSON
                </a>
              </div>
            </div>

            {/* Cloud Durability Warning */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2">
              <div className="flex items-center space-x-2 text-amber-900 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span className="text-xs uppercase tracking-wider">Aviso Crítico sobre Durabilidad en Servidor Publicado</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900">
                El sistema implementa escritura atómica con <code>fsync</code> y mantenimiento automático de los últimos 10 respaldos en <code>data/backups/</code>.
                Sin embargo, en entornos de hosting en contenedores (como Google Cloud Run sin volumen montado), <strong>el disco local es efímero</strong> y se restablece ante un nuevo despliegue. No afirmamos que los datos locales sobrevivan a una nueva publicación sin verificar la existencia de un volumen persistente o conectar una base de datos externa.
              </p>
            </div>
          </div>

          {/* PostgreSQL External Database Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Configuración de Base de Datos PostgreSQL
                </h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                persistenceStatus?.postgresConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {persistenceStatus?.postgresConfigured ? 'DATABASE_URL detectada' : 'Pendiente de configurar en .env'}
              </span>
            </div>

            <p className="text-slate-600 leading-relaxed text-xs">
              Para entornos en producción permanente o cuando se requiera persistencia garantizada ante cualquier reinicio o redespliegue de contenedor, configure la variable de entorno <code>DATABASE_URL</code> en su archivo <code>.env</code> o en las variables secretas de la plataforma.
            </p>

            <div className="p-3 bg-slate-900 text-slate-100 rounded-lg space-y-2 font-mono text-[11px]">
              <span className="text-emerald-400 block font-bold"># Formato de conexión PostgreSQL requerido:</span>
              <p className="text-amber-300 break-all select-all">
                postgresql://USUARIO:PASSWORD@HOST:PUERTO/NOMBRE_BD?sslmode=require
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-slate-700 text-[11px]">
              <span className="font-bold block text-slate-800">Pasos para activar PostgreSQL:</span>
              <ol className="list-decimal list-inside space-y-1">
                <li>Crear o aprovisionar una instancia PostgreSQL (ej. Cloud SQL, Neon, Supabase, o servidor propio).</li>
                <li>Reemplazar USUARIO, PASSWORD, HOST, PUERTO y NOMBRE_BD con las credenciales asignadas.</li>
                <li>Incluir <code>DATABASE_URL="postgresql://USUARIO:PASSWORD@HOST:PUERTO/NOMBRE_BD?sslmode=require"</code> en <code>.env</code>.</li>
                <li>Reiniciar el servidor: Central Comercial detectará la conexión y operará con persistencia cloud permanente.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Auditoría y Registro Estructurado de Eventos
              </h2>
              <p className="text-xs text-slate-500">
                Trazabilidad completa de envíos, detenciones, cobros y ejecución de tareas.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center space-x-2 text-xs">
              <select
                value={logFilterLevel}
                onChange={e => setLogFilterLevel(e.target.value)}
                className="border rounded p-1.5 text-xs"
              >
                <option value="all">Todos los niveles</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>

              <select
                value={logFilterModule}
                onChange={e => setLogFilterModule(e.target.value)}
                className="border rounded p-1.5 text-xs"
              >
                <option value="all">Todos los módulos</option>
                <option value="campañas">Campañas</option>
                <option value="conectores">Conectores</option>
                <option value="conversaciones">Conversaciones</option>
                <option value="pagos">Pagos</option>
                <option value="ia">IA</option>
                <option value="sistema">Sistema</option>
              </select>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">Fecha / Hora</th>
                  <th className="p-2.5">Nivel</th>
                  <th className="p-2.5">Módulo</th>
                  <th className="p-2.5">Mensaje</th>
                  <th className="p-2.5 text-right">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-[11px]">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="p-2.5 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('es')}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                          log.level === 'error'
                            ? 'bg-rose-100 text-rose-800'
                            : log.level === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td className="p-2.5 font-semibold text-slate-700 uppercase text-[10px]">
                      {log.module}
                    </td>
                    <td className="p-2.5 text-slate-800">{log.message}</td>
                    <td className="p-2.5 text-right">
                      {log.details ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-blue-600 hover:underline font-semibold text-[10px]"
                        >
                          Ver JSON
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JSON Log Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900">Detalles del Evento de Auditoría</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="font-semibold text-slate-800">{selectedLog.message}</p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto text-[11px] font-mono max-h-60">
              {JSON.stringify(selectedLog.details, null, 2)}
            </pre>
            <div className="text-right">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded font-semibold text-xs hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

