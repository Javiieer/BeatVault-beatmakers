import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { defaultAdminRepository, providerHealth, type AdminRepositoryResult } from '../data/adminRepository'
import { adminMetrics } from '../data/admin'

const formatStorage = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}

export function Admin({ onReviewed }: { onReviewed?: () => Promise<void> }) {
  const [result, setResult] = useState<AdminRepositoryResult>()
  const [busyId, setBusyId] = useState('')
  const [reason, setReason] = useState<Record<string, string>>({})
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>({})
  const [planDraft, setPlanDraft] = useState<Record<string, 'free' | 'creator' | 'studio'>>({})
  const [error, setError] = useState('')
  const reload = useCallback(async () => setResult(await defaultAdminRepository.load()), [])
  useEffect(() => { void reload() }, [reload])
  const review = async (contentId: string, decision: 'approve' | 'reject') => {
    if (busyId) return
    setBusyId(contentId); setError('')
    const outcome = await defaultAdminRepository.review(contentId, decision, reason[contentId] || '')
    if (outcome.ok) {
      setReason(current => ({ ...current, [contentId]: '' }))
      await onReviewed?.()
      await reload()
    } else setError(outcome.error || 'No se pudo guardar la revisión.')
    setBusyId('')
  }
  const setQuota = async (accountId: string, clear = false) => {
    if (busyId) return
    const megabytes = Number(quotaDraft[accountId])
    const bytes = Math.round(megabytes * 1024 * 1024)
    if (!clear && (!Number.isSafeInteger(bytes) || bytes < 1)) { setError('Escribe un límite válido en MB.'); return }
    const limitBytes = clear ? null : bytes
    setBusyId(accountId); setError('')
    const result = await defaultAdminRepository.setStorageQuota(accountId, limitBytes)
    if (result.ok) { setQuotaDraft(current => ({ ...current, [accountId]: '' })); await reload() }
    else setError(result.error || 'No se pudo actualizar el límite.')
    setBusyId('')
  }
  const setPlan = async (accountId: string) => {
    if (busyId) return
    const planId = planDraft[accountId]
    if (!planId) return
    setBusyId(accountId); setError('')
    const result = await defaultAdminRepository.setPlan(accountId, planId)
    if (result.ok) await reload()
    else setError(result.error || 'No se pudo asignar el paquete.')
    setBusyId('')
  }
  const data = result
  return <div className="page-stack admin-page">
    <header className="page-header"><div><p className="eyebrow">Herramientas internas</p><h1>Administración</h1><p className="description">Revisión de publicaciones y estado de la plataforma.</p></div><span className="badge violet">{data?.source === 'api' ? 'API LOCAL' : 'CARGANDO'}</span></header>
    <div className="admin-guard"><ShieldCheck size={20} /><span><strong>Autorización validada en servidor.</strong> Cada decisión requiere sesión administrativa y queda en auditoría.</span></div>
    {data?.error && <div className="admin-guard"><AlertTriangle size={18} /><span>Datos de demostración. {data.error}</span></div>}
    <div className="stats-grid admin-stats">{(data?.source === 'api' ? [['Cuentas', data.overview.accounts, 'servidor'], ['Creadores', data.overview.creators, 'servidor'], ['Pendientes', data.catalog.length, 'revisión'], ['Catálogo', data.overview.catalog, 'elementos']] : adminMetrics).map(([label, value, note]) => <article className="stat-card" key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</div>
    <section className="admin-health panel"><div className="section-heading"><div><p className="eyebrow">Servicios</p><h2>Estado de proveedores</h2></div><Activity size={18} /></div><div className="health-grid">{providerHealth.map(provider => <div key={provider.name}><span>{provider.state === 'healthy' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><strong>{provider.name}</strong><small>{provider.detail}</small><b className={`badge ${provider.state}`}>{provider.state}</b></div>)}</div></section>
    <section className="panel admin-review"><div className="section-heading"><div><p className="eyebrow">Publicación</p><h2>Cola de revisión</h2></div><small>{data?.source === 'api' ? `${data.catalog.length} pendientes` : 'Sin conexión'}</small></div>
      {error && <p className="upload-error" role="alert">{error}</p>}
      {data?.source === 'api' && data.catalog.length === 0 && <p className="empty-state">No hay Beats ni One-shots pendientes de revisión.</p>}
      {data?.source === 'api' && data.catalog.map(item => <article className="admin-review-row" key={item.contentId}>
        <div className="admin-row"><div><strong>{item.title}</strong><span>{item.type} · Creador {item.creatorId}</span></div><span className="badge pending">En revisión</span></div>
        <div className="admin-review-actions"><label className="short-upload-field">{`Motivo si se rechaza ${item.title}`}<input maxLength={160} value={reason[item.contentId] || ''} onChange={event => setReason(current => ({ ...current, [item.contentId]: event.target.value }))} placeholder="Describe qué debe corregirse" /></label><div><button className="button ghost" type="button" disabled={Boolean(busyId) || !reason[item.contentId]?.trim()} onClick={() => void review(item.contentId, 'reject')}><ThumbsDown size={16} /> Rechazar</button><button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void review(item.contentId, 'approve')}><ThumbsUp size={16} /> {busyId === item.contentId ? 'Guardando…' : 'Aprobar'}</button></div></div>
      </article>)}
    </section>
    <section className="panel admin-storage"><div className="section-heading"><div><p className="eyebrow">Uso de almacenamiento</p><h2>Almacenamiento por cuenta</h2></div><small>{data?.source === 'api' ? `${data.storage.length} cuentas · ${formatStorage(data.storage.reduce((total, item) => total + item.storedBytes, 0))} registrados` : 'Sin conexión'}</small></div>
      <p className="description">Separa originales sujetos a cuota y previews procesados. Son bytes registrados en metadatos, no una inspección del disco. Los límites individuales son solo para pruebas; no representan paquetes ni precios.</p>
      {data?.source === 'api' && data.storage.length === 0 && <p className="empty-state">Aún no hay cuentas registradas.</p>}
      {data?.source === 'api' && data.storage.map(item => <div className="admin-storage-row" key={item.id}><div><strong>{item.email}</strong><span>{item.role === 'admin' ? 'Administración' : 'Creador'} · originales: {formatStorage(item.usedBytes)} ({item.originalCount}) · previews: {formatStorage(item.previewBytes)} ({item.previewCount}) · total registrado: {formatStorage(item.storedBytes)} · {item.customQuotaBytes === null ? 'sin límite individual' : `límite ${formatStorage(item.customQuotaBytes)}`}</span></div><div className="admin-quota-controls"><label>{`Límite de prueba en MB para ${item.email}`}<input aria-label={`Límite de prueba en MB para ${item.email}`} type="number" min="1" step="1" inputMode="numeric" value={quotaDraft[item.id] ?? (item.customQuotaBytes === null ? '' : String(Math.ceil(item.customQuotaBytes / (1024 * 1024))))} onChange={event => setQuotaDraft(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Sin límite" /></label><button className="button" type="button" disabled={Boolean(busyId) || !quotaDraft[item.id]?.trim()} onClick={() => void setQuota(item.id)}>{busyId === item.id ? 'Guardando…' : 'Asignar'}</button>{item.customQuotaBytes !== null && <button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void setQuota(item.id, true)}>Quitar</button>}</div></div>)}
    </section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Cuentas</p><h2>Acceso de usuarios</h2></div><small>{data?.source === 'api' ? `${data.accounts.length} cuentas` : 'Solo lectura'}</small></div>{data?.source === 'api' ? data.accounts.map(account => <div className="admin-row" key={account.id}><div><strong>{account.email}</strong><span>{account.id} · {account.verificationState} · paquete {account.planId}</span></div><div className="admin-plan-controls"><span className={`badge ${account.role === 'admin' ? 'active' : 'pending'}`}>{account.role}</span><select aria-label={`Paquete para ${account.email}`} value={planDraft[account.id] ?? account.planId} onChange={event => setPlanDraft(current => ({ ...current, [account.id]: event.target.value as 'free' | 'creator' | 'studio' }))}><option value="free">Free</option><option value="creator">Creator</option><option value="studio">Studio</option></select><button className="button" type="button" disabled={Boolean(busyId) || (planDraft[account.id] ?? account.planId) === account.planId} onClick={() => void setPlan(account.id)}>{busyId === account.id ? 'Guardando…' : 'Asignar'}</button></div></div>) : data?.rows.map(row => <div className="admin-row" key={row.id}><div><strong>{row.title}</strong><span>{row.detail}</span></div><span className={`badge ${row.state}`}>{row.state}</span></div>)}</section>
  </div>
}
