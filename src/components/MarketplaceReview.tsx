import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { defaultMarketplaceReviewRepository, type MarketplaceReviewItem } from '../data/marketplaceReviewRepository'
import { CatalogUploadReview } from './CatalogUploadReview'
import '../styles/marketplace-review.css'

export function MarketplaceReview({ canApproveCatalogUploads = false }: { canApproveCatalogUploads?: boolean }) {
  const [items, setItems] = useState<MarketplaceReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const reload = useCallback(async () => {
    const result = await defaultMarketplaceReviewRepository.list()
    if (result.ok) { setItems(result.data); setError('') }
    else setError(result.error.message)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])
  const recommend = async (item: MarketplaceReviewItem, decision: 'recommend' | 'request-changes') => {
    const note = notes[item.listing.contentId]?.trim() || ''
    if (note.length < 8 || busyId) return
    setBusyId(item.listing.contentId); setError('')
    const result = await defaultMarketplaceReviewRepository.recommend(item.listing.contentId, decision, note)
    if (!result.ok) setError(result.error.message)
    else { setNotes(current => ({ ...current, [item.listing.contentId]: '' })); await reload() }
    setBusyId('')
  }
  return <main className="page-stack marketplace-review">
    <header className="page-heading"><div><p className="eyebrow">CREATOR SUPPORT</p><h1>Marketplace review</h1><p>Check listing completeness and leave a recommendation for the administrator.</p></div><span className="badge violet">Community team</span></header>
    <div className="admin-guard"><ShieldCheck size={19} /><span><strong>Recommendation only.</strong> Community managers cannot approve sales, publish listings, alter prices, or access payment and account controls.</span></div>
    <div className="admin-guard review-preliminary"><AlertTriangle size={19} /><span>Evidence is seller-provided and has not been legally or forensically verified. This review is preliminary and does not approve a sale.</span></div>
    {error && <p className="upload-error" role="alert">{error}</p>}
    {canApproveCatalogUploads && <CatalogUploadReview />}
    {loading && <p className="muted" role="status">Loading private review queue…</p>}
    {!loading && items.length === 0 && <section className="panel review-empty"><ClipboardCheck size={24} /><h2>Queue is clear</h2><p>Complete beat offer drafts will appear here for an initial review.</p></section>}
    {items.map(item => <article className="panel review-card" key={item.listing.contentId}>
      <div className="review-card-heading"><div><p className="eyebrow">PRIVATE BEAT OFFER</p><h2>{item.title}</h2><span>Creator account: {item.creatorId}</span></div><span className={`badge ${item.readyForFinalReview ? 'active' : 'pending'}`}>{item.readyForFinalReview ? 'Ready for recommendation' : 'Incomplete'}</span></div>
      <p className="review-description">{item.listing.description || 'No artist-facing description yet.'}</p>
      <div className="review-facts"><span>Genre <strong>{item.listing.genre || 'Not set'}</strong></span><span>Composition <strong>{(item.listing.rights.sellerCompositionShareBps / 100).toFixed(2)}%</strong></span><span>Master <strong>{(item.listing.rights.sellerMasterShareBps / 100).toFixed(2)}%</strong></span><span>Sample disclosure <strong>{item.listing.rights.sampleDisclosure}</strong></span><span>Private evidence <strong>{item.evidence.length} file(s)</strong></span></div>
      {item.evidence.length > 0 && <div className="review-collaborators"><strong>Seller evidence</strong>{item.evidence.map(file => <a key={file.id} href={`/api/staff/marketplace-review/${encodeURIComponent(item.listing.contentId)}/evidence/${encodeURIComponent(file.id)}`}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · download</a>)}</div>}
      <div className="review-collaborators"><strong>Contributors</strong>{item.listing.rights.collaborators.length ? item.listing.rights.collaborators.map((person, index) => <span key={`${person.name}-${index}`}>{person.name} · {person.role} · composition {(person.compositionShareBps / 100).toFixed(2)}% · master {(person.masterShareBps / 100).toFixed(2)}%</span>) : <span>None declared</span>}</div>
      <label className="review-note-label">Review note<textarea minLength={8} maxLength={160} rows={2} value={notes[item.listing.contentId] || ''} onChange={event => setNotes(current => ({ ...current, [item.listing.contentId]: event.target.value }))} placeholder="Explain what is complete or what the creator should fix." /></label>
      {item.latestRecommendation && <p className="review-last-note" role="status"><CheckCircle2 size={15} /> Latest: {item.latestRecommendation.decision === 'recommend' ? 'Recommended for admin review' : 'Changes requested'} · {item.latestRecommendation.note}</p>}
      <div className="review-actions"><button className="button ghost" type="button" disabled={Boolean(busyId) || (notes[item.listing.contentId]?.trim().length || 0) < 8} onClick={() => void recommend(item, 'request-changes')}>Request changes</button><button className="button" type="button" disabled={!item.readyForFinalReview || Boolean(busyId) || (notes[item.listing.contentId]?.trim().length || 0) < 8} onClick={() => void recommend(item, 'recommend')}>{busyId === item.listing.contentId ? 'Saving…' : 'Recommend for admin review'}</button></div>
    </article>)}
  </main>
}
