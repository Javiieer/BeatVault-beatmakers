import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { defaultMarketplaceReviewRepository, type MarketplaceReviewItem } from '../data/marketplaceReviewRepository'

export function AdminMarketplaceReview() {
  const [items, setItems] = useState<MarketplaceReviewItem[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const result = await defaultMarketplaceReviewRepository.adminList()
    if (result.ok) { setItems(result.data); setError('') }
    else setError(result.error.message)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const decide = async (item: MarketplaceReviewItem, decision: 'approve' | 'reject' | 'request-changes') => {
    const note = notes[item.listing.contentId]?.trim() || ''
    if (note.length < 8 || busyId) return
    setBusyId(item.listing.contentId); setError('')
    const result = await defaultMarketplaceReviewRepository.finalize(item.listing.contentId, decision, note)
    if (!result.ok) setError(result.error.message)
    else { setNotes(current => ({ ...current, [item.listing.contentId]: '' })); await reload() }
    setBusyId('')
  }

  return <section className="panel admin-marketplace-review">
    <div className="section-heading"><div><p className="eyebrow">Marketplace · revisión comercial</p><h2>Revisión comercial de Beats</h2></div><small>{loading ? 'Cargando…' : `${items.length} fichas`}</small></div>
    <div className="admin-guard"><ShieldCheck size={18} /><span>Admin y Community Manager pueden aprobar la ficha comercial por separado. La aprobación no publica el beat ni activa ofertas; publicación, vendedor conectado y configuración de Stripe siguen siendo requisitos de venta.</span></div>
    {error && <p className="upload-error" role="alert">{error}</p>}
    {loading && <p className="muted" role="status">Loading private seller listings…</p>}
    {!loading && items.length === 0 && <p className="empty-state">No hay fichas comerciales de Beats pendientes.</p>}
    {items.map(item => {
      const id = item.listing.contentId
      const ready = item.readyForReview
      const previous = item.latestAdminDecision
      return <article className="admin-marketplace-card" key={id}>
        <header><div><strong>{item.title}</strong><span>Creator {item.creatorId} · {item.listing.genre || 'Genre not set'}</span></div><span className={`badge ${ready ? 'active' : 'pending'}`}>{ready ? 'Ready for review' : 'Needs review'}</span></header>
        <p>{item.listing.description || 'No description provided.'}</p>
        <div className="admin-marketplace-facts"><span>Samples: <strong>{item.listing.rights.sampleDisclosure}</strong></span><span>Evidence: <strong>{item.evidence.length}</strong></span><span>Community review: <strong>{item.latestCommunityReview?.decision || 'None'}{item.communityReviewCurrent === false && item.latestCommunityReview ? ' · outdated' : ''}</strong></span><span>Commercial review: <strong>{item.commercialReviewApproved ? 'Approved' : 'Pending'}</strong></span></div>
        {item.evidence.length > 0 && <div className="admin-marketplace-files"><strong>Private seller documents</strong>{item.evidence.map(file => <a key={file.id} href={`/api/staff/marketplace-review/${encodeURIComponent(id)}/evidence/${encodeURIComponent(file.id)}`}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</a>)}</div>}
        {item.latestCommunityReview && <p className={`admin-marketplace-note${item.latestCommunityReview.current ? '' : ' stale'}`}><CheckCircle2 size={15} /> Community Manager: {item.latestCommunityReview.note}{item.latestCommunityReview.current ? '' : ' · outdated after seller edits'}</p>}
        {previous && <p className={`admin-marketplace-note${previous.current ? '' : ' stale'}`}><AlertTriangle size={15} /> Previous admin decision: {previous.decision} · {previous.note}{previous.current ? '' : ' · superseded by seller edits'}</p>}
        <label className="admin-marketplace-reason">Reason<textarea minLength={8} maxLength={160} rows={2} value={notes[id] || ''} onChange={event => setNotes(current => ({ ...current, [id]: event.target.value }))} placeholder="Record the basis for your decision (8–160 characters)." /></label>
        <div className="admin-marketplace-actions">
          <button className="button ghost" type="button" disabled={Boolean(busyId) || (notes[id]?.trim().length || 0) < 8} onClick={() => void decide(item, 'request-changes')}>Request changes</button>
          <button className="button ghost" type="button" disabled={Boolean(busyId) || (notes[id]?.trim().length || 0) < 8} onClick={() => void decide(item, 'reject')}>Reject</button>
          <button className="button" type="button" disabled={!ready || Boolean(busyId) || (notes[id]?.trim().length || 0) < 8} onClick={() => void decide(item, 'approve')}>{busyId === id ? 'Saving…' : 'Approve commercial review'}</button>
        </div>
      </article>
    })}
  </section>
}
