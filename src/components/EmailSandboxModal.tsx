import React, { useState } from 'react';
import {
  Mail,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  CreditCard,
  UserCheck,
  Send,
  MessageSquare,
  HelpCircle,
  FileText,
  X
} from 'lucide-react';
import { api } from '../api.js';
import type { Application, EmailSandboxRunResponse, SandboxStepResult } from '../types.js';

interface EmailSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: Application[];
  onComplete?: () => void;
}

export const EmailSandboxModal: React.FC<EmailSandboxModalProps> = ({
  isOpen,
  onClose,
  applications,
  onComplete,
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string>(
    applications.find(a => a.status === 'lista')?.id || applications[0]?.id || 'app-open-voley'
  );
  const [testEmail, setTestEmail] = useState('gervasiomeana@gmail.com');
  const [testOrgName, setTestOrgName] = useState('Club de Vóley San Martín');
  const [testPerson, setTestPerson] = useState('Gervasio Meana');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EmailSandboxRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRun = async () => {
    if (!testEmail.trim() || !testEmail.includes('@')) {
      setError('Ingrese una dirección de correo válida para la prueba.');
      return;
    }
    setError(null);
    setRunning(true);
    setResult(null);

    try {
      const response = await api.runEmailSandbox({
        appId: selectedAppId,
        testEmail: testEmail.trim().toLowerCase(),
        testOrgName: testOrgName.trim(),
        contactPerson: testPerson.trim()
      });
      setResult(response);
      if (onComplete) onComplete();
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar validación de email en sandbox.');
    } finally {
      setRunning(false);
    }
  };

  const getStepIcon = (step: number) => {
    switch (step) {
      case 1: return UserCheck;
      case 2: return FileText;
      case 3: return Send;
      case 4: return MessageSquare;
      case 5: return Sparkles;
      case 6: return CheckCircle2;
      case 7: return CreditCard;
      default: return CheckCircle2;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-inner shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold tracking-tight">Validación del Recorrido Completo por Email</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  Próximo Hito
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Prueba segura y controlada con una dirección de prueba propia sin contactar prospectos reales.
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

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex items-start space-x-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-xs block">Recorrido Seguro de Punta a Punta:</span>
              <p className="text-[11px] text-blue-900 leading-relaxed">
                Este test recorre las 7 etapas obligatorias para una sola campaña:
                <br />
                <span className="font-semibold">
                  Contacto verificado → Mensaje aprobado → Envío registrado → Respuesta asociada → Atención IA → Interesado calificado → Pago manual.
                </span>
                <br />
                Permite comprobar la lógica comercial sin enviar mensajes reales ni alterar datos no autorizados.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Parameters */}
          {!result && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Aplicación a Validar *</label>
                  <select
                    value={selectedAppId}
                    onChange={e => setSelectedAppId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white"
                  >
                    {applications.map(app => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.status === 'en_desarrollo' ? 'En desarrollo' : 'Lista'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Dirección de Correo de Prueba (Controlada) *</label>
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                    placeholder="gervasiomeana@gmail.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre de Organización Simulada</label>
                  <input
                    type="text"
                    value={testOrgName}
                    onChange={e => setTestOrgName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                    placeholder="Club Atlético Vóley"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Persona de Contacto</label>
                  <input
                    type="text"
                    value={testPerson}
                    onChange={e => setTestPerson(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                    placeholder="Gervasio Meana"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Execution Progress & Results */}
          {result && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 space-y-1">
                <div className="flex items-center space-x-1.5 font-extrabold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Recorrido Completo Validado con Evidencia Registrada</span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  {result.summary}
                </p>
              </div>

              {/* 7 Steps Checklist with Real Evidence */}
              <div className="space-y-2.5">
                <span className="font-extrabold text-slate-800 text-xs block uppercase tracking-wider">
                  Detalle de Etapas Ejecutadas y Dependencias Siguientes:
                </span>

                {result.steps.map(step => (
                  <div
                    key={step.step}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                          {step.step}
                        </span>
                        <h4 className="font-bold text-slate-900 text-xs">{step.name}</h4>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                        {step.status}
                      </span>
                    </div>

                    <div className="pl-7 space-y-1">
                      <p className="text-slate-700 text-[11px] leading-relaxed">
                        <strong className="text-slate-900">Evidencia verificable:</strong> {step.evidence}
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        <strong>Siguiente dependencia:</strong> {step.nextDependency}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs hover:bg-slate-100"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>

          {!result ? (
            <button
              onClick={handleRun}
              disabled={running}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors flex items-center space-x-2 shadow-xs disabled:opacity-50"
            >
              {running ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Ejecutando recorrido en 7 etapas...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Iniciar Validación por Email</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
            >
              Realizar Otra Prueba
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
