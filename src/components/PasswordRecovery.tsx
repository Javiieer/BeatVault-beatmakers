import { useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { authClient } from '../api/client';

type RequestData = null | { devOnlyToken: string };
const isRequestData = (value: unknown): value is RequestData => value === null ||
  (!!value && typeof value === 'object' && typeof (value as Record<string, unknown>).devOnlyToken === 'string');
const isNull = (value: unknown): value is null => value === null;

export function PasswordRecovery({ mode, token }: { mode: 'request' | 'reset'; token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState('');
  const request = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setResetLink('');
    const result = await authClient.request<RequestData>('/api/auth/password-reset/request', {
      method: 'POST', body: JSON.stringify({ email: email.trim() }),
    }, isRequestData);
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setMessage('Si la cuenta existe, recibirás instrucciones para recuperar el acceso.');
    if (result.data?.devOnlyToken) setResetLink(`${window.location.origin}${window.location.pathname}#/password-reset?token=${encodeURIComponent(result.data.devOnlyToken)}`);
  };
  const reset = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!token) { setError('El enlace está incompleto. Solicita uno nuevo.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 12 || password.length > 128) { setError('Usa una contraseña de 12 a 128 caracteres.'); return; }
    setBusy(true);
    const result = await authClient.request('/api/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token, password }),
    }, isNull);
    setBusy(false);
    if (!result.ok) { setError(result.error.code === 'INVALID_OR_EXPIRED_TOKEN' ? 'El enlace venció o ya se usó. Solicita uno nuevo.' : result.error.message); return; }
    setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
    window.location.hash = '#/dashboard';
  };
  return <main className="login-page"><form className="login-card" onSubmit={mode === 'request' ? request : reset} noValidate>
    <span className="brand-mark">BV</span><p className="eyebrow">Seguridad de la cuenta</p>
    <h1>{mode === 'request' ? 'Recuperar contraseña' : 'Crear contraseña nueva'}</h1>
    <p className="login-copy">{mode === 'request' ? 'Escribe el correo de tu cuenta y te enviaremos las instrucciones.' : 'Elige una contraseña segura de al menos 12 caracteres.'}</p>
    {mode === 'request' ? <><label htmlFor="recovery-email">Correo electrónico</label><input id="recovery-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></> : <>
      <label htmlFor="recovery-password">Contraseña nueva</label><input id="recovery-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required />
      <label htmlFor="recovery-confirm">Confirmar contraseña</label><input id="recovery-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} required />
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status" className="recovery-status"><ShieldCheck size={17} />{message}</p>}
    {resetLink && <a className="primary-button recovery-link" href={resetLink}><KeyRound size={16} />Abrir enlace local de recuperación</a>}
    <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Procesando...' : mode === 'request' ? 'Enviar instrucciones' : 'Guardar contraseña nueva'}</button>
    <a className="text-button recovery-back" href="#/dashboard"><ArrowLeft size={15} />Volver al inicio de sesión</a>
    {mode === 'request' && <p className="recovery-local-note"><Mail size={15} />En desarrollo local aparece un enlace de un solo uso. El envío de correos se conecta al configurar el servicio de email.</p>}
  </form></main>;
}
