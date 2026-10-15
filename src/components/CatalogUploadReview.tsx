import { useCallback, useEffect, useState } from 'react'
import { Headphones, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { defaultCatalogUploadReviewRepository, type CatalogUploadReviewItem } from '../data/catalogUploadReviewRepository'
import '../styles/marketplace-review.css'

export function CatalogUploadReview() {
  const [items, setItems] = useState<CatalogUploadReviewItem[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const result = await defaultCatalogUploadReviewRepository.list()
    if (result.ok) { setItems(result.data); setError('') }
    else setError(result.error.message)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const decide = async (item: CatalogUploadReviewItem, decision: 'approve' | 'reject') => {
    const note = notes[item.contentId]?.trim() || ''
    if (note.length < 8 || busyId) return
    setBusyId(item.contentId); setError('')
    const result = await defaultCatalogUploadReviewRepository.decide(item.contentId, decision, note)
    if (!result.ok) setError(result.error.message)
    else { setNotes(current => ({ ...current, [item.contentId]: '' })); await reload() }
    setBusyId('')
  }

  return <section className="panel upload-review-section">
    <div className="section-heading"><div><p className="eyebrow">BEAT UPLOADS</p><h2>Beat upload approvals</h2></div><small>{loading ? 'Loading…' : `${items.length} pending`}</small></div>
    <div className="admin-guard"><ShieldCheck size={18} /><span>A Community Manager or an administrator can approve or reject a Beat. One approval is enough to publish it.</span></div>
    {error && <p className="upload-error" role="alert">{error}</p>}
    {loading && <p className="muted" role="status">Loading Beat uploads…</p>}
    {!loading && items.length === 0 && <p className="empty-state">No Beat uploads are waiting for your review.</p>}
    {items.map(item => <article className="admin-review-row upload-review-row" key={item.contentId}>
      <div className="admin-row"><div><strong>{item.title}</strong><span>Beat · Creator {item.creatorId}</span></div><span className="badge pending">Pending review</span></div>
      {item.artworkUrl && <img className="upload-review-artwork" src={item.artworkUrl} alt={`Artwork for ${item.title}`} loading="lazy" />}
      {item.previewAvailable && item.previewUrl ? <div className="upload-review-audio"><Headphones size={17} /><audio controls preload="none" src={item.previewUrl}>Audio preview unavailable.</audio></div> : <p className="review-preliminary">Processed audio preview is unavailable; request processing before approval.</p>}
      <label className="review-note-label">Review note<textarea minLength={8} maxLength={160} rows={2} value={notes[item.contentId] || ''} onChange={event => setNotes(current => ({ ...current, [item.contentId]: event.target.value }))} placeholder="What did you verify or what needs fixing? (8–160 characters)" /></label>
      <div className="review-actions"><button className="button ghost" type="button" disabled={Boolean(busyId) || (notes[item.contentId]?.trim().length || 0) < 8} onClick={() => void decide(item, 'reject')}><ThumbsDown size={16} /> Reject Beat</button><button className="button" type="button" disabled={!item.previewAvailable || Boolean(busyId) || (notes[item.contentId]?.trim().length || 0) < 8} onClick={() => void decide(item, 'approve')}><ThumbsUp size={16} /> {busyId === item.contentId ? 'Saving…' : 'Approve and publish'}</button></div>
    </article>)}
  </section>
}
