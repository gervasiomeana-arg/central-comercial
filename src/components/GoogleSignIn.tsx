import React from 'react';

export function GoogleSignIn({ loginUrl }: { loginUrl?: string }) {
  const result = new URLSearchParams(window.location.search).get('google_login');
  const message = result === 'denied'
    ? 'Esa cuenta de Google no está autorizada. Elegí tu cuenta de administrador.'
    : result === 'retry' ? 'Google no pudo completar el acceso. Volvé a intentarlo.' : '';

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="google-login-title"
      className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
      <h1 id="google-login-title" className="text-2xl font-semibold text-slate-900">Central Comercial</h1>
      <p className="mt-3 text-sm text-slate-700">Ingresá con tu cuenta de Google para consultar el resumen privado de tu PC.</p>
      {message && <p role="alert" className="mt-4 text-sm text-rose-800">{message}</p>}
      {loginUrl ? <a href={loginUrl} target="_top"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-5 font-medium text-white">
        Ingresar con Google
      </a> : <p role="status" className="mt-4 text-sm text-slate-700">El acceso con Google todavía no está configurado en Publish.</p>}
    </section>
  </div>;
}
