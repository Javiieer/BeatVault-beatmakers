import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { defaultAdminRepository, providerHealth, type AdminRepositoryResult } from '../data/adminRepository'
import { adminMetrics } from '../data/admin'
import { marketplaceBaseCurrency } from '../domains/marketplace/currency'
import { promotionScopes, type PromotionInput, type PromotionScope } from '../domains/marketplace/promotions'
import { AdminMarketplaceReview } from './AdminMarketplaceReview'
import { readSocialModerationPosts, readSocialModerationReports, reviewSocialPost, reviewSocialPostReport, type SocialPostReportView, type SocialPostView } from '../data/socialPostRepository'
import '../styles/social-moderation.css'

const promotionLabels: Record<PromotionScope, string> = { all: 'Todo el marketplace', beat: 'Beats', loop: 'Loops', 'one-shot': 'One-shots', 'sample-pack': 'Sample packs' }

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
  const [promotionDraft, setPromotionDraft] = useState({ name: 'Lanzamiento BeatVault', scope: 'beat' as PromotionScope, percentOff: '10', startsAt: '', endsAt: '', enabled: true })
  const [promotionError, setPromotionError] = useState('')
  const [error, setError] = useState('')
  const [socialPosts, setSocialPosts] = useState<SocialPostView[]>([])
  const [socialReports, setSocialReports] = useState<SocialPostReportView[]>([])
  const [socialError, setSocialError] = useState('')
  const [socialNotes, setSocialNotes] = useState<Record<string, string>>({})
  const reload = useCallback(async () => setResult(await defaultAdminRepository.load()), [])
  useEffect(() => { void reload() }, [reload])
  const reloadSocialModeration = useCallback(async () => {
    const [postsResult, reportsResult] = await Promise.all([readSocialModerationPosts(), readSocialModerationReports()])
    const errors: string[] = []
    if (postsResult.ok) setSocialPosts(postsResult.data.posts); else errors.push(postsResult.error.message)
    if (reportsResult.ok) setSocialReports(reportsResult.data.reports); else errors.push(reportsResult.error.message)
    setSocialError(errors.join(' '))
  }, [])
  useEffect(() => { void reloadSocialModeration() }, [reloadSocialModeration])
  const decideSocialPost = async (postId: string, status: 'published' | 'rejected' | 'removed') => {
    if (busyId) return
    if (status === 'removed' && !window.confirm('¿Retirar esta publicación? Dejará de ser visible para todos.')) return
    setBusyId(postId); setSocialError('')
    const result = await reviewSocialPost(postId, status, socialNotes[postId] || '')
    if (result.ok) { setSocialNotes(current => ({ ...current, [postId]: '' })); await reloadSocialModeration() }
    else setSocialError(result.error.message)
    setBusyId('')
  }
  const decideSocialReport = async (reportId: string, status: 'reviewed' | 'dismissed') => {
    if (busyId) return
    setBusyId(reportId); setSocialError('')
    const result = await reviewSocialPostReport(reportId, status)
    if (result.ok) await reloadSocialModeration()
    else setSocialError(result.error.message)
    setBusyId('')
  }
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
  const setStaffRole = async (accountId: string, role: 'creator' | 'community_manager') => {
    if (busyId) return
    setBusyId(accountId); setError('')
    const outcome = await defaultAdminRepository.setStaffRole(accountId, role)
    if (outcome.ok) await reload()
    else setError(outcome.error || 'No se pudo cambiar el rol.')
    setBusyId('')
  }
  const refundOrder = async (orderId: string) => {
    if (busyId || !window.confirm('¿Solicitar el reembolso total de esta compra? Stripe devolverá el pago y revertirá la transferencia y comisión de BeatVault.')) return
    setBusyId(orderId); setError('')
    const outcome = await defaultAdminRepository.refundBeatOrder(orderId)
    if (outcome.ok) await reload()
    else setError(outcome.error || 'No se pudo solicitar el reembolso.')
    setBusyId('')
  }
  const savePromotion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyId) return
    const input: PromotionInput = { name: promotionDraft.name.trim(), scope: promotionDraft.scope, percentOff: Number(promotionDraft.percentOff), ...(promotionDraft.startsAt ? { startsAt: new Date(`${promotionDraft.startsAt}T00:00:00.000Z`).toISOString() } : {}), ...(promotionDraft.endsAt ? { endsAt: new Date(`${promotionDraft.endsAt}T23:59:59.999Z`).toISOString() } : {}), enabled: promotionDraft.enabled }
    setBusyId('promotion-new'); setPromotionError('')
    const outcome = await defaultAdminRepository.savePromotion(input)
    if (outcome.ok) { setPromotionDraft(current => ({ ...current, name: '', startsAt: '', endsAt: '' })); await reload() }
    else setPromotionError(outcome.error || 'No se pudo guardar la promoción.')
    setBusyId('')
  }
  const updatePromotion = async (id: string, input: PromotionInput) => {
    if (busyId) return
    setBusyId(id); setPromotionError('')
    const outcome = await defaultAdminRepository.savePromotion(input, id)
    if (outcome.ok) await reload()
    else setPromotionError(outcome.error || 'No se pudo actualizar la promoción.')
    setBusyId('')
  }
  const removePromotion = async (id: string) => {
    if (busyId) return
    setBusyId(id); setPromotionError('')
    const outcome = await defaultAdminRepository.deletePromotion(id)
    if (outcome.ok) await reload()
    else setPromotionError(outcome.error || 'No se pudo eliminar la promoción.')
    setBusyId('')
  }
  const data = result
  return <div className="page-stack admin-page">
    <header className="page-header"><div><p className="eyebrow">Herramientas internas</p><h1>Administración</h1><p className="description">Revisión de publicaciones y estado de la plataforma.</p></div><span className="badge violet">{data?.source === 'api' ? 'API LOCAL' : 'CARGANDO'}</span></header>
    <div className="admin-guard"><ShieldCheck size={20} /><span><strong>Autorización validada en servidor.</strong> Cada decisión requiere sesión administrativa y queda en auditoría.</span></div>
    {data?.error && <div className="admin-guard"><AlertTriangle size={18} /><span>Datos de demostración. {data.error}</span></div>}
    <div className="stats-grid admin-stats">{(data?.source === 'api' ? [['Cuentas', data.overview.accounts, 'servidor'], ['Creadores', data.overview.creators, 'servidor'], ['Pendientes', data.catalog.length, 'revisión'], ['Catálogo', data.overview.catalog, 'elementos']] : adminMetrics).map(([label, value, note]) => <article className="stat-card" key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</div>
    <section className="admin-health panel"><div className="section-heading"><div><p className="eyebrow">Servicios</p><h2>Estado de proveedores</h2></div><Activity size={18} /></div><div className="health-grid">{providerHealth.map(provider => <div key={provider.name}><span>{provider.state === 'healthy' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><strong>{provider.name}</strong><small>{provider.detail}</small><b className={`badge ${provider.state}`}>{provider.state}</b></div>)}</div></section>
    <section className="panel admin-promotions">
      <div className="section-heading"><div><p className="eyebrow">Marketplace</p><h2>Precios de referencia y descuentos</h2></div><small>{data?.source === 'api' ? `${data.promotions.length} reglas` : 'API requerida'}</small></div>
      <p className="description">Moneda base de publicación: <strong>{marketplaceBaseCurrency}</strong>. Los compradores podrán elegir USD, MXN o EUR para mostrar precios; las conversiones a MXN/EUR son referenciales. Beats no exclusivos suelen listarse alrededor de $30–80 según licencia; kits de loops y one-shots, cerca de $15–20. Son precios publicados por creadores/tiendas, no promedios ni una tarifa de BeatVault. <a href="https://www.beatstars.com/beat/represent-veeze-type-beat-26235693" target="_blank" rel="noreferrer">Ejemplo de licencias de beats</a> · <a href="https://www.loopmasters.com/genres/66-Tech-House/products/19773-Deeperfect-Artist-Series-Sample-Pack-Francis-De-Simone" target="_blank" rel="noreferrer">Ejemplo de pack de loops</a> · <a href="https://www.loopmasters.com/genres/95-EDM/products/10509-99-Patches-Presents-Superstar-EDM-Oneshots" target="_blank" rel="noreferrer">Ejemplo de one-shots</a>.</p>
      <div className="admin-guard"><AlertTriangle size={18} /><span>USD ya está definido como moneda base, pero las reglas aún no modifican precios ni compras. Falta definir precio por licencia, moneda de liquidación al vendedor y checkout.</span></div>
      <div className="admin-guard"><ShieldCheck size={18} /><span><strong>Reparto transparente:</strong> el total debe separar precio con descuento e impuesto aplicable; la liquidación al creador descuenta comisión de BeatVault y costos de pago. La ganancia real de la plataforma es su comisión menos pasarela, reembolsos y operación. No mostramos impuestos ni netos estimados hasta configurar países, clasificación fiscal del vendedor y proveedor de pagos.</span></div>
      {promotionError && <p className="upload-error" role="alert">{promotionError}</p>}
      <form className="promotion-form" onSubmit={event => void savePromotion(event)}>
        <label>Nombre de campaña<input required maxLength={64} value={promotionDraft.name} onChange={event => setPromotionDraft(current => ({ ...current, name: event.target.value }))} placeholder="Descuento de lanzamiento" /></label>
        <label>Aplicar a<select value={promotionDraft.scope} onChange={event => setPromotionDraft(current => ({ ...current, scope: event.target.value as PromotionScope }))}>{promotionScopes.map(scope => <option key={scope} value={scope}>{promotionLabels[scope]}</option>)}</select></label>
        <label>Descuento (%)<input required type="number" min="1" max="75" step="1" value={promotionDraft.percentOff} onChange={event => setPromotionDraft(current => ({ ...current, percentOff: event.target.value }))} /></label>
        <label>Desde<input type="date" value={promotionDraft.startsAt} onChange={event => setPromotionDraft(current => ({ ...current, startsAt: event.target.value }))} /></label>
        <label>Hasta<input type="date" value={promotionDraft.endsAt} onChange={event => setPromotionDraft(current => ({ ...current, endsAt: event.target.value }))} /></label>
        <label className="promotion-enabled"><input type="checkbox" checked={promotionDraft.enabled} onChange={event => setPromotionDraft(current => ({ ...current, enabled: event.target.checked }))} /> Regla habilitada</label>
        <button className="button" type="submit" disabled={Boolean(busyId) || data?.source !== 'api'}>Guardar descuento</button>
      </form>
      {data?.source === 'api' && data.promotions.map(promotion => <div className="admin-promotion-row" key={promotion.id}>
        <div><strong>{promotion.name}</strong><span>{promotionLabels[promotion.scope]} · {promotion.percentOff}% · {promotion.startsAt ? new Date(promotion.startsAt).toLocaleDateString('es-MX') : 'Sin inicio'}–{promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString('es-MX') : 'Sin vencimiento'}</span></div>
        <div className="promotion-actions"><label><input type="checkbox" checked={promotion.enabled} disabled={Boolean(busyId)} onChange={event => void updatePromotion(promotion.id, { name: promotion.name, scope: promotion.scope, percentOff: promotion.percentOff, startsAt: promotion.startsAt, endsAt: promotion.endsAt, enabled: event.target.checked })} /> Habilitada</label><button className="button ghost" type="button" title="Eliminar regla" aria-label={`Eliminar ${promotion.name}`} disabled={Boolean(busyId)} onClick={() => void removePromotion(promotion.id)}><Trash2 size={15} /></button></div>
      </div>)}
      {data?.source === 'api' && data.promotions.length === 0 && <p className="empty-state">Todavía no hay descuentos configurados.</p>}
    </section>
    <section className="panel admin-review"><div className="section-heading"><div><p className="eyebrow">Publicación</p><h2>Cola de revisión</h2></div><small>{data?.source === 'api' ? `${data.catalog.length} pendientes` : 'Sin conexión'}</small></div>
      <div className="admin-guard"><ShieldCheck size={18} /><span>Un Community Manager o un administrador puede aprobar y publicar un Beat. Basta una decisión; el audio necesita preview procesado. Los demás tipos conservan la revisión administrativa actual.</span></div>
      {error && <p className="upload-error" role="alert">{error}</p>}
      {data?.source === 'api' && data.catalog.length === 0 && <p className="empty-state">No hay Beats ni One-shots pendientes de revisión.</p>}
      {data?.source === 'api' && data.catalog.map(item => <article className="admin-review-row" key={item.contentId}>
        <div className="admin-row"><div><strong>{item.title}</strong><span>{item.type} · Creador {item.creatorId}</span></div><span className="badge pending">En revisión</span></div>
        <div className="admin-review-actions"><label className="short-upload-field">{`Motivo si se rechaza ${item.title}`}<input maxLength={160} value={reason[item.contentId] || ''} onChange={event => setReason(current => ({ ...current, [item.contentId]: event.target.value }))} placeholder="Describe qué debe corregirse" /></label><div><button className="button ghost" type="button" disabled={Boolean(busyId) || !reason[item.contentId]?.trim()} onClick={() => void review(item.contentId, 'reject')}><ThumbsDown size={16} /> Rechazar</button><button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void review(item.contentId, 'approve')}><ThumbsUp size={16} /> {busyId === item.contentId ? 'Guardando…' : 'Aprobar'}</button></div></div>
      </article>)}
    </section>
    <section className="panel admin-review" aria-label="Moderación de publicaciones sociales">
      <div className="section-heading"><div><p className="eyebrow">Comunidad</p><h2>Moderación social</h2></div><small>{socialPosts.length} pendientes heredados · {socialReports.length} reportes abiertos</small></div>
      <p className="description">Las publicaciones aparecen de inmediato. Atiende reportes de la comunidad y retira contenido que incumpla las reglas; cada decisión queda registrada.</p>
      {socialError && <p className="upload-error" role="alert">No se pudo actualizar la moderación social: {socialError}</p>}
      <div className="admin-social-queues">
        <section aria-labelledby="social-post-queue-title">
          <div className="section-heading"><h3 id="social-post-queue-title">Pendientes heredados</h3><small>{socialPosts.length}</small></div>
          {socialPosts.length === 0 && !socialError && <p className="empty-state">No hay publicaciones heredadas en espera.</p>}
          {socialPosts.map(post => <article className="admin-review-row admin-social-item" key={post.id}>
            <div className="admin-row"><div><strong>{post.author.displayName} · {post.kind === 'status' ? 'Estado' : post.kind === 'photo' ? 'Foto' : 'Video'}</strong><span>{post.audience === 'public' ? 'Público' : post.audience === 'friends' ? 'Amigos' : 'Solo autor'} · {new Date(post.createdAt).toLocaleString('es-MX')}</span></div><span className="badge pending">Pendiente</span></div>
            <p className="admin-social-copy">{post.body}</p>
            {post.media?.mimeType.startsWith('image/') && <img className="admin-social-media" src={post.media.url} alt={`Adjunto del post de ${post.author.displayName}`} loading="lazy" />}
            {post.media?.mimeType.startsWith('video/') && <video className="admin-social-media" src={post.media.url} controls preload="metadata" aria-label={`Video de ${post.author.displayName}`} />}
            <label className="short-upload-field">Nota de moderación<input maxLength={500} value={socialNotes[post.id] || ''} onChange={event => setSocialNotes(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Motivo o contexto para el registro" /></label>
            <div className="admin-review-actions admin-social-actions"><div><button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialPost(post.id, 'published')}>{busyId === post.id ? 'Guardando…' : 'Aprobar'}</button><button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialPost(post.id, 'rejected')}>Rechazar</button><button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialPost(post.id, 'removed')}>Retirar</button></div></div>
          </article>)}
        </section>
        <section aria-labelledby="social-report-queue-title">
          <div className="section-heading"><h3 id="social-report-queue-title">Reportes abiertos</h3><small>{socialReports.length}</small></div>
          {socialReports.length === 0 && !socialError && <p className="empty-state">No hay reportes abiertos.</p>}
          {socialReports.map(report => <article className="admin-review-row admin-social-item" key={report.id}>
            <div className="admin-row"><div><strong>{report.reason} · publicación {report.post?.author.displayName || 'no disponible'}</strong><span>Reportó {report.reporterId} · {new Date(report.createdAt).toLocaleString('es-MX')}</span></div><span className="badge reported">Abierto</span></div>
            {report.details && <p className="admin-social-copy">{report.details}</p>}
            {report.post && <div className="admin-social-reported-post"><p>{report.post.body}</p>{report.post.media?.mimeType.startsWith('image/') && <img className="admin-social-media" src={report.post.media.url} alt="Adjunto reportado" loading="lazy" />}{report.post.media?.mimeType.startsWith('video/') && <video className="admin-social-media" src={report.post.media.url} controls preload="metadata" aria-label="Video reportado" />}</div>}
            <div className="admin-review-actions admin-social-actions"><div><button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialReport(report.id, 'reviewed')}>{busyId === report.id ? 'Guardando…' : 'Marcar revisado'}</button><button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialReport(report.id, 'dismissed')}>Descartar reporte</button>{report.post && <button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void decideSocialPost(report.post!.id, 'removed')}>Retirar publicación</button>}</div></div>
          </article>)}
        </section>
      </div>
    </section>
    <section className="panel admin-review"><div className="section-heading"><div><p className="eyebrow">Pagos</p><h2>Órdenes, reembolsos y disputas</h2></div><small>{data?.source === 'api' ? `${data.beatOrders.length} órdenes` : 'Sin conexión'}</small></div>
      <p className="description">Los reembolsos son totales y se confirman únicamente al recibir el webhook de Stripe. Las disputas requieren revisión y respuesta manual en Stripe.</p>
      {data?.source === 'api' && data.beatOrders.length === 0 && <p className="empty-state">Todavía no hay compras.</p>}
      {data?.source === 'api' && data.beatOrders.map(order => <article className="admin-review-row" key={order.id}>
        <div className="admin-row"><div><strong>{order.title} · {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(order.amountMinor / 100)}</strong><span>{order.offerId} · comprador {order.buyerId} · vendedor {order.sellerId} · {new Date(order.createdAt).toLocaleString()}</span>{order.disputeId && <span role="alert">Disputa {order.disputeId} · motivo: {order.disputeReason || 'sin especificar'}. Requiere atención en Stripe.</span>}</div><span className={`badge ${order.status === 'paid' ? 'active' : order.status === 'disputed' ? 'pending' : 'violet'}`}>{order.status}</span></div>
        {order.status === 'paid' && <div className="admin-review-actions"><span>Solo procede con solicitud válida del comprador y conserva la documentación de soporte.</span><button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void refundOrder(order.id)}>{busyId === order.id ? 'Solicitando…' : 'Reembolsar total'}</button></div>}
      </article>)}
    </section>
    {data?.source === 'api' && <AdminMarketplaceReview />}
    <section className="panel admin-storage"><div className="section-heading"><div><p className="eyebrow">Uso de almacenamiento</p><h2>Almacenamiento por cuenta</h2></div><small>{data?.source === 'api' ? `${data.storage.length} cuentas · ${formatStorage(data.storage.reduce((total, item) => total + item.storedBytes, 0))} registrados` : 'Sin conexión'}</small></div>
      <p className="description">Separa originales sujetos a cuota y previews procesados. Son bytes registrados en metadatos, no una inspección del disco. Los límites individuales son solo para pruebas; no representan paquetes ni precios.</p>
      {data?.source === 'api' && data.storage.length === 0 && <p className="empty-state">Aún no hay cuentas registradas.</p>}
      {data?.source === 'api' && data.storage.map(item => <div className="admin-storage-row" key={item.id}><div><strong>{item.email}</strong><span>{item.role === 'admin' ? 'Administración' : 'Creador'} · originales: {formatStorage(item.usedBytes - item.artworkBytes)} ({item.originalCount}) · artwork: {formatStorage(item.artworkBytes)} ({item.artworkCount}) · previews: {formatStorage(item.previewBytes)} ({item.previewCount}) · total registrado: {formatStorage(item.storedBytes)} · {item.customQuotaBytes === null ? 'sin límite individual' : `límite ${formatStorage(item.customQuotaBytes)}`}</span></div><div className="admin-quota-controls"><label>{`Límite de prueba en MB para ${item.email}`}<input aria-label={`Límite de prueba en MB para ${item.email}`} type="number" min="1" step="1" inputMode="numeric" value={quotaDraft[item.id] ?? (item.customQuotaBytes === null ? '' : String(Math.ceil(item.customQuotaBytes / (1024 * 1024))))} onChange={event => setQuotaDraft(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Sin límite" /></label><button className="button" type="button" disabled={Boolean(busyId) || !quotaDraft[item.id]?.trim()} onClick={() => void setQuota(item.id)}>{busyId === item.id ? 'Guardando…' : 'Asignar'}</button>{item.customQuotaBytes !== null && <button className="button ghost" type="button" disabled={Boolean(busyId)} onClick={() => void setQuota(item.id, true)}>Quitar</button>}</div></div>)}
    </section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Cuentas</p><h2>Acceso de usuarios</h2></div><small>{data?.source === 'api' ? `${data.accounts.length} cuentas` : 'Solo lectura'}</small></div>{data?.source === 'api' ? data.accounts.map(account => <div className="admin-row" key={account.id}><div><strong>{account.email}</strong><span>{account.id} · {account.verificationState} · paquete {account.planId}</span></div><div className="admin-plan-controls"><span className={`badge ${account.role === 'admin' ? 'active' : account.role === 'community_manager' ? 'violet' : 'pending'}`}>{account.role}</span>{account.role !== 'admin' && <select aria-label={`Rol para ${account.email}`} value={account.role} disabled={Boolean(busyId)} onChange={event => void setStaffRole(account.id, event.target.value as 'creator' | 'community_manager')}><option value="creator">Creador</option><option value="community_manager">Community manager</option></select>}<select aria-label={`Paquete para ${account.email}`} value={planDraft[account.id] ?? account.planId} onChange={event => setPlanDraft(current => ({ ...current, [account.id]: event.target.value as 'free' | 'creator' | 'studio' }))}><option value="free">Free</option><option value="creator">Creator</option><option value="studio">Studio</option></select><button className="button" type="button" disabled={Boolean(busyId) || (planDraft[account.id] ?? account.planId) === account.planId} onClick={() => void setPlan(account.id)}>{busyId === account.id ? 'Guardando…' : 'Asignar paquete'}</button></div></div>) : data?.rows.map(row => <div className="admin-row" key={row.id}><div><strong>{row.title}</strong><span>{row.detail}</span></div><span className={`badge ${row.state}`}>{row.state}</span></div>)}</section>
  </div>
}
