import { FormEvent, useState } from "react";

type Props = { loading?: boolean; error?: string; onSubmit: (email: string, password: string) => Promise<void>; onRegister?: (email: string, password: string) => Promise<void> };
export function Login({ loading = false, error, onSubmit, onRegister }: Props) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email.trim() || password.length < (register ? 12 : 1)) { setValidation(register ? "Usa un email válido y una contraseña de al menos 12 caracteres." : "Introduce tu email y contraseña."); return; } setValidation(""); void (register && onRegister ? onRegister(email.trim(), password) : onSubmit(email.trim(), password)); };
  return <main className="login-page"><form className="login-card" onSubmit={submit} noValidate>
    <span className="brand-mark">BV</span><p className="eyebrow">Local workspace</p><h1>{register ? "Create your BeatVault account" : "Sign in to BeatVault"}</h1>
    <p className="login-copy">La API local está activa. Inicia sesión para acceder a tus proyectos remotos.</p>
    <label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
    <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
    {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
    <button className="primary-button" type="submit" disabled={loading}>{loading ? (register ? "Creating..." : "Signing in...") : (register ? "Create account" : "Sign in")}</button>
    {!register && <a className="text-button" href="#/forgot-password">Olvide mi contrasena</a>}
    {onRegister && <button type="button" className="text-button" onClick={() => { setRegister(!register); setValidation(""); }}>{register ? "Already have an account? Sign in" : "Create a local account"}</button>}
  </form></main>;
}
