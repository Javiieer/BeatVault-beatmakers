import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { defaultMarketplaceReviewRepository, type MarketplaceReviewItem } from '../data/marketplaceReviewRepository'
import { CatalogUploadReview } from './CatalogUploadReview'
import '../styles/marketplace-review.css'
import { StaffDashboard } from './StaffDashboard'

export function MarketplaceReview({ canApproveCatalogUploads = false }: { canApproveCatalogUploads?: boolean }) {
  const [items, setItems] = useState<MarketplaceReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const reload = useCallback(async () => {
    const result = await defaultMarketplaceReviewRepository.list()
    if (result.ok) { setItems(result.data); setError('') }
    else setError(result.error.message)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const review = async (item: MarketplaceReviewItem, decision: 'approve' | 'request-changes') => {
    const note = notes[item.listing.contentId]?.trim() || ''
    if (note.length < 8 || busyId) return
    setBusyId(item.listing.contentId); setError('')
    const result = await defaultMarketplaceReviewRepository.reviewCommunity(item.listing.contentId, decision, note)
    if (!result.ok) setError(result.error.message)
    else { setNotes(current => ({ ...current, [item.listing.contentId]: '' })); await reload() }
    setBusyId('')
  }

  const dashboardStatus = loading ? 'Loading queue' : error ? 'API attention' : 'Queue ready'
  return <StaffDashboard role="community_manager" title="Moderation center" description="Review Beat publishing and private commercial listings. Payment and account administration stay outside this workspace." status={dashboardStatus} metrics={[
    { label: 'Commercial listings', value: items.length, note: 'Private seller submissions' },
    { label: 'Ready for review', value: items.filter(item => item.readyForReview).length, note: 'Complete listing details and evidence' },
    { label: 'Need seller updates', value: items.filter(item => !item.readyForReview).length, note: 'Incomplete commercial records' },
  ]}>
    <div className="admin-guard"><ShieldCheck size={19} /><span>Community Managers can approve a commercial review independently. This role does not grant payment, refund, price, payout, or account administration controls.</span></div>
    <div className="admin-guard review-preliminary"><AlertTriangle size={19} /><span>A commercial approval does not publish a beat or activate an offer. Selling still requires a current public listing, a connected seller, and configured Stripe payments. Seller-provided evidence is not legal or forensic clearance.</span></div>
    {error && <p className="upload-error" role="alert">{error}</p>}
    <div id="community-beats" className="staff-dashboard-queue">{canApproveCatalogUploads && <CatalogUploadReview />}</div>
    <div id="community-listings" className="staff-dashboard-queue">
    {loading && <p className="muted" role="status">Loading private review queue…</p>}
    {!loading && items.length === 0 && <section className="panel review-empty"><ClipboardCheck size={24} /><h2>Queue is clear</h2><p>Complete beat offer drafts will appear here for commercial review.</p></section>}
    {items.map(item => <article className="panel review-card" key={item.listing.contentId}>
      <div className="review-card-heading"><div><p className="eyebrow">PRIVATE BEAT OFFER</p><h2>{item.title}</h2><span>Creator account: {item.creatorId}</span></div><span className={`badge ${item.readyForReview ? 'active' : 'pending'}`}>{item.readyForReview ? 'Ready for commercial review' : 'Incomplete'}</span></div>
      <p className="review-description">{item.listing.description || 'No artist-facing description yet.'}</p>
      <div className="review-facts"><span>Genre <strong>{item.listing.genre || 'Not set'}</strong></span><span>Composition <strong>{(item.listing.rights.sellerCompositionShareBps / 100).toFixed(2)}%</strong></span><span>Master <strong>{(item.listing.rights.sellerMasterShareBps / 100).toFixed(2)}%</strong></span><span>Sample disclosure <strong>{item.listing.rights.sampleDisclosure}</strong></span><span>Private evidence <strong>{item.evidence.length} file(s)</strong></span></div>
      {item.evidence.length > 0 && <div className="review-collaborators"><strong>Seller evidence</strong>{item.evidence.map(file => <a key={file.id} href={`/api/staff/marketplace-review/${encodeURIComponent(item.listing.contentId)}/evidence/${encodeURIComponent(file.id)}`}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · download</a>)}</div>}
      <div className="review-collaborators"><strong>Contributors</strong>{item.listing.rights.collaborators.length ? item.listing.rights.collaborators.map((person, index) => <span key={`${person.name}-${index}`}>{person.name} · {person.role} · composition {(person.compositionShareBps / 100).toFixed(2)}% · master {(person.masterShareBps / 100).toFixed(2)}%</span>) : <span>None declared</span>}</div>
      {item.commercialReviewApproved && <p className="review-last-note" role="status"><CheckCircle2 size={15} /> Commercial review already has a current approval; a second role is not required.</p>}
      {item.latestCommunityReview && <p className={`review-last-note${item.latestCommunityReview.current ? '' : ' stale'}`} role="status"><CheckCircle2 size={15} /> Community Manager: {item.latestCommunityReview.decision === 'approve' || item.latestCommunityReview.decision === 'recommend' ? 'Approved commercial review' : 'Changes requested'}{item.latestCommunityReview.current ? '' : ' · outdated'} · {item.latestCommunityReview.note}</p>}
      {item.latestAdminDecision && <p className={`review-last-note${item.latestAdminDecision.current ? '' : ' stale'}`} role="status">Admin: {item.latestAdminDecision.decision === 'approve' ? 'Approved commercial review' : item.latestAdminDecision.decision === 'reject' ? 'Rejected' : 'Changes requested'}{item.latestAdminDecision.current ? '' : ' · outdated'} · {item.latestAdminDecision.note}</p>}
      <label className="review-note-label">Review note<textarea minLength={8} maxLength={160} rows={2} value={notes[item.listing.contentId] || ''} onChange={event => setNotes(current => ({ ...current, [item.listing.contentId]: event.target.value }))} placeholder="Explain what is complete or what the creator should fix." /></label>
      <div className="review-actions"><button className="button ghost" type="button" disabled={Boolean(busyId) || (notes[item.listing.contentId]?.trim().length || 0) < 8} onClick={() => void review(item, 'request-changes')}>Request changes</button><button className="button" type="button" disabled={!item.readyForReview || Boolean(busyId) || (notes[item.listing.contentId]?.trim().length || 0) < 8} onClick={() => void review(item, 'approve')}>{busyId === item.listing.contentId ? 'Saving…' : 'Approve commercial review'}</button></div>
    </article>)}
    </div>
  </StaffDashboard>
}
