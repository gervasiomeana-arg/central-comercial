import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Key,
  User,
  AlertTriangle,
  ArrowRight,
  Server
} from 'lucide-react';
import type { AdminUser, AuthStatusResponse } from '../types.js';

interface AuthModalProps {
  authStatus: AuthStatusResponse;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onSetup: (payload: { email: string; password: string; name: string; setupKey: string }) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  authStatus,
  onLogin,
  onSetup,
}) => {
  const isSetup = !authStatus.configured;

  const [email, setEmail] = useState('gervasiomeana@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('Gervasio Meana');
  const [setupKey, setSetupKey] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSetup) {
        if (password !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden.');
        }
        if (password.length < 8) {
          throw new Error('La contraseña debe tener al menos 8 caracteres.');
        }
        if (!setupKey.trim()) {
          throw new Error('Debe ingresar la Clave Maestra de Configuración (Setup Key) del servidor.');
        }

        await onSetup({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          setupKey: setupKey.trim()
        });
      } else {
        await onLogin({
          email: email.trim().toLowerCase(),
          password
        });
      }
    } catch (err: any) {
      setError(err.message || 'Error de autenticación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-inner">
              CC
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">CENTRAL COMERCIAL</h2>
              <span className="text-[11px] font-semibold text-blue-300">
                {isSetup ? 'Inicialización Segura de Administrador' : 'Acceso Privado Exclusivo'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {isSetup
              ? 'Para evitar accesos no autorizados, la cuenta administrativa requiere la Clave Maestra de Configuración generada en el servidor.'
              : 'Ingrese sus credenciales administrativas para acceder a la gestión comercial y automatizaciones.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isSetup && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nombre Completo *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Gervasio Meana"
                />
              </div>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">Correo Electrónico *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="admin@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Contraseña de Administrador *</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder={isSetup ? 'Mínimo 8 caracteres' : '••••••••'}
              />
            </div>
          </div>

          {isSetup && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Confirmar Contraseña *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Repita la contraseña"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center space-x-1.5 text-slate-800 font-bold">
                  <Key className="w-4 h-4 text-amber-600" />
                  <span>Clave Maestra de Configuración (Setup Key) *</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Para proteger el sistema y no permitir que cualquier visitante público se convierta en administrador, ingrese la clave generada en el servidor (archivo <code>data/.admin_setup_token</code> o variable <code>ADMIN_SETUP_KEY</code>).
                </p>
                <input
                  type="password"
                  required
                  value={setupKey}
                  onChange={e => setSetupKey(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500"
                  placeholder="Pegue aquí el token generado por el servidor"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50"
          >
            <span>{loading ? 'Verificando...' : isSetup ? 'Configurar Administrador Único' : 'Iniciar Sesión'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-400">
          Autenticación criptográfica protegida con scrypt y sesiones revocables en backend.
        </div>
      </div>
    </div>
  );
};
