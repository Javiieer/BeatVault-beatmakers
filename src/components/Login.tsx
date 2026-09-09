import { FormEvent, useState } from "react";

type Props = { loading?: boolean; error?: string; onSubmit: (email: string, password: string) => Promise<void> };
export function Login({ loading = false, error, onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email.trim() || password.length < 1) { setValidation("Introduce tu email y contraseña."); return; } setValidation(""); void onSubmit(email.trim(), password); };
  return <main className="login-page"><form className="login-card" onSubmit={submit} noValidate>
    <span className="brand-mark">BV</span><p className="eyebrow">Local workspace</p><h1>Sign in to BeatVault</h1>
    <p className="login-copy">La API local está activa. Inicia sesión para acceder a tus proyectos remotos.</p>
    <label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
    <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
    {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
    <button className="primary-button" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
  </form></main>;
}
