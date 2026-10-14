import { useEffect, useRef, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import type { ApiResult } from '../domains/core/contracts'
import { isBeatListingInput, isBeatListingReady, type BeatCollaborator, type BeatListingInput, type BeatListingRecord } from '../domains/marketplace/sellerListings'
import type { CatalogAsset } from '../data/localCatalog'
import { tx } from '../i18n'
import { defaultSellerListingRepository } from '../data/sellerListingRepository'
import type { SellerEvidenceView } from '../domains/marketplace/sellerEvidence'

const draftUsageSummary = () => tx('seller.defaultUsage')

const createDraft = (asset: CatalogAsset): BeatListingInput => ({
  description: '',
  genre: asset.tags[0]?.label || 'Unspecified',
  explicitContent: false,
  rights: {
    sellerCompositionShareBps: 10000,
    sellerMasterShareBps: 10000,
    sampleDisclosure: 'none',
    sampleProofAvailable: false,
    collaborators: [],
    declarationAccepted: false,
  },
  offers: [{ id: 'offer-standard', label: tx('seller.standard'), amountMinor: 3000, currency: 'USD', deliverables: ['mp3'], usageSummary: draftUsageSummary(), termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
})

const percent = (basisPoints: number) => (basisPoints / 100).toFixed(2)
const toBasisPoints = (value: string) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0

export function BeatSaleListingForm({ asset, listing, onClose, onSave }: {
  asset: CatalogAsset
  listing?: BeatListingRecord
  onClose: () => void
  onSave: (contentId: string, input: BeatListingInput) => Promise<ApiResult<BeatListingRecord>>
}) {
  const [draft, setDraft] = useState<BeatListingInput>(() => listing ? {
    description: listing.description,
    genre: listing.genre,
    ...(listing.bpm === undefined ? {} : { bpm: listing.bpm }),
    ...(listing.musicalKey === undefined ? {} : { musicalKey: listing.musicalKey }),
    explicitContent: listing.explicitContent,
    rights: { ...listing.rights, collaborators: listing.rights.collaborators.map(item => ({ ...item })) },
    offers: listing.offers.map(item => ({ ...item, deliverables: [...item.deliverables] })),
  } : createDraft(asset))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(Boolean(listing))
  const [evidence, setEvidence] = useState<SellerEvidenceView[]>([])
  const [evidenceFile, setEvidenceFile] = useState<File>()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const compositionTotal = draft.rights.sellerCompositionShareBps + draft.rights.collaborators.reduce((sum, item) => sum + item.compositionShareBps, 0)
  const masterTotal = draft.rights.sellerMasterShareBps + draft.rights.collaborators.reduce((sum, item) => sum + item.masterShareBps, 0)
  const valid = isBeatListingInput(draft)
  const readyForReview = isBeatListingReady({ ...draft, rights: { ...draft.rights, sampleProofAvailable: evidence.length > 0 } })
  useEffect(() => {
    if (!listing) return
    void defaultSellerListingRepository.listEvidence(asset.id).then(result => { if (result.ok) setEvidence(result.data) })
  }, [asset.id, listing])
  useEffect(() => { dialogRef.current?.showModal() }, [])

  const updateRights = (changes: Partial<BeatListingInput['rights']>) => {
    setDraft(current => ({ ...current, rights: { ...current.rights, ...changes } }))
    setSaved(false)
  }
  const updateOffer = (index: number, changes: Partial<BeatListingInput['offers'][number]>) => {
    setDraft(current => ({ ...current, offers: current.offers.map((offer, offerIndex) => offerIndex === index ? { ...offer, ...changes } : offer) }))
    setSaved(false)
  }
  const updateCollaborator = (index: number, changes: Partial<BeatCollaborator>) => {
    updateRights({ collaborators: draft.rights.collaborators.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) })
  }
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || busy) { setError(tx('seller.invalid')); return }
    setBusy(true); setError('')
    try {
      const result = await onSave(asset.id, draft)
      if (!result.ok) { setError(result.error.message); return }
      if (evidenceFile) {
        const upload = await defaultSellerListingRepository.uploadEvidence(asset.id, evidenceFile)
        if (!upload.ok) { setError(upload.error.message); setSaved(true); return }
        setEvidence(current => [...current, upload.data])
        setEvidenceFile(undefined)
      }
      setSaved(true)
      onClose()
    } catch { setError(tx('seller.serverError')) }
    finally { setBusy(false) }
  }

  return <dialog ref={dialogRef} className="creator-upload-dialog beat-listing-dialog" aria-labelledby="beat-listing-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={event => void save(event)}>
      <div className="modal-heading"><div><p className="eyebrow">{tx('seller.privateEyebrow')}</p><h2 id="beat-listing-title">{tx('seller.formTitle')}</h2></div><button type="button" className="icon-button" aria-label={tx('seller.close')} disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <div className="beat-listing-notice" role="note"><strong>{tx('seller.notForSale')}</strong> {tx('seller.notForSaleNote')}</div>

      <section className="beat-listing-section"><div className="upload-step"><span>01</span><div><h3>{tx('seller.step1')}</h3><p>{tx('seller.step1Note')}</p></div></div>
        <label className="short-upload-field">{tx('seller.beat')}<input value={asset.name} readOnly /></label>
        <label className="short-upload-field">{tx('seller.description')}<textarea maxLength={2000} rows={4} value={draft.description} onChange={event => { setDraft(current => ({ ...current, description: event.target.value })); setSaved(false) }} placeholder={tx('seller.descriptionPlaceholder')} /></label>
        <div className="form-grid">
          <label>{tx('seller.genre')}<input maxLength={48} value={draft.genre} onChange={event => { setDraft(current => ({ ...current, genre: event.target.value })); setSaved(false) }} placeholder={tx('seller.genrePlaceholder')} /></label>
          <label>{tx('seller.bpm')}<input type="number" min="40" max="240" step="1" value={draft.bpm ?? ''} onChange={event => { const bpm = event.target.value ? Number(event.target.value) : undefined; setDraft(current => ({ ...current, ...(bpm === undefined ? { bpm: undefined } : { bpm }) })); setSaved(false) }} /></label>
          <label>{tx('seller.key')}<input maxLength={12} value={draft.musicalKey || ''} onChange={event => { setDraft(current => ({ ...current, musicalKey: event.target.value || undefined })); setSaved(false) }} placeholder={tx('seller.keyPlaceholder')} /></label>
          <label className="beat-listing-toggle"><input type="checkbox" checked={draft.explicitContent} onChange={event => { setDraft(current => ({ ...current, explicitContent: event.target.checked })); setSaved(false) }} /> {tx('seller.explicit')}</label>
        </div>
      </section>

      <section className="beat-listing-section"><div className="upload-step"><span>02</span><div><h3>{tx('seller.step2')}</h3><p>{tx('seller.step2Note')}</p></div></div>
        <div className="form-grid">
          <label>{tx('seller.compositionShare')}<input type="number" min="0" max="100" step="0.01" value={percent(draft.rights.sellerCompositionShareBps)} onChange={event => updateRights({ sellerCompositionShareBps: toBasisPoints(event.target.value) })} /></label>
          <label>{tx('seller.masterShare')}<input type="number" min="0" max="100" step="0.01" value={percent(draft.rights.sellerMasterShareBps)} onChange={event => updateRights({ sellerMasterShareBps: toBasisPoints(event.target.value) })} /></label>
        </div>
        <p className={`beat-listing-share-total${compositionTotal !== 10000 || masterTotal !== 10000 ? ' invalid' : ''}`} role="status">{tx('seller.registeredShares', { composition: percent(compositionTotal), master: percent(masterTotal) })}</p>
        {draft.rights.collaborators.map((collaborator, index) => <div className="beat-listing-contributor" key={`collaborator-${index}`}>
          <label>{tx('seller.creditName')}<input required maxLength={100} value={collaborator.name} onChange={event => updateCollaborator(index, { name: event.target.value })} /></label>
          <label>{tx('seller.role')}<input required maxLength={80} value={collaborator.role} onChange={event => updateCollaborator(index, { role: event.target.value })} placeholder={tx('seller.rolePlaceholder')} /></label>
          <label>{tx('seller.collabComposition')}<input type="number" min="0" max="100" step="0.01" value={percent(collaborator.compositionShareBps)} onChange={event => updateCollaborator(index, { compositionShareBps: toBasisPoints(event.target.value) })} /></label>
          <label>{tx('seller.collabMaster')}<input type="number" min="0" max="100" step="0.01" value={percent(collaborator.masterShareBps)} onChange={event => updateCollaborator(index, { masterShareBps: toBasisPoints(event.target.value) })} /></label>
          <button type="button" className="icon-button" title={tx('seller.removeCollaborator', { name: collaborator.name })} aria-label={tx('seller.removeCollaborator', { name: collaborator.name || String(index + 1) })} onClick={() => updateRights({ collaborators: draft.rights.collaborators.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16} /></button>
        </div>)}
        <button type="button" className="button ghost beat-listing-add" disabled={draft.rights.collaborators.length >= 20} onClick={() => updateRights({ collaborators: [...draft.rights.collaborators, { name: '', role: '', compositionShareBps: 0, masterShareBps: 0 }] })}><Plus size={16} /> {tx('seller.addCollaborator')}</button>
        <div className="form-grid">
          <label>{tx('seller.sampleOrigin')}<select value={draft.rights.sampleDisclosure} onChange={event => updateRights({ sampleDisclosure: event.target.value as BeatListingInput['rights']['sampleDisclosure'], sampleSource: undefined, sampleProofAvailable: false })}><option value="none">{tx('seller.noThirdPartySamples')}</option><option value="original">{tx('seller.originalRecordings')}</option><option value="licensed">{tx('seller.licensedSamples')}</option></select></label>
          {draft.rights.sampleDisclosure === 'licensed' && <label>{tx('seller.sampleProvider')}<input maxLength={300} value={draft.rights.sampleSource || ''} onChange={event => updateRights({ sampleSource: event.target.value })} placeholder={tx('seller.sampleProviderPlaceholder')} /></label>}
        </div>
        {draft.rights.sampleDisclosure === 'licensed' && <div className="seller-evidence-field">
          {!listing && <p className="muted">Save this draft to add private evidence.</p>}
          <label>{tx('seller.sampleProof')}<input type="file" disabled={evidence.length >= 3} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={event => setEvidenceFile(event.target.files?.[0])} /></label>
          <small>PDF, JPEG or PNG · 10 MB max · up to 3 files. Files are private and only visible to you and authorized review staff.</small>
          {evidence.map(item => <div className="seller-evidence-item" key={item.id}><a href={`/api/seller/beat-listings/${encodeURIComponent(asset.id)}/evidence/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">{item.originalName}</a><button type="button" className="icon-button" aria-label={`Remove ${item.originalName}`} onClick={() => void defaultSellerListingRepository.removeEvidence(asset.id, item.id).then(result => { if (result.ok) setEvidence(current => current.filter(file => file.id !== item.id)); else setError(result.error.message) })}><Trash2 size={15} /></button></div>)}
        </div>}
        <label className="beat-listing-toggle beat-listing-declaration"><input type="checkbox" checked={draft.rights.declarationAccepted} onChange={event => updateRights({ declarationAccepted: event.target.checked })} /> {tx('seller.rightsDeclaration')}</label>
      </section>

      <section className="beat-listing-section"><div className="upload-step"><span>03</span><div><h3>{tx('seller.step3')}</h3><p>{tx('seller.step3Note')}</p></div></div>
        {draft.offers.map((offer, index) => <article className="beat-listing-offer" key={offer.id}>
          <div className="beat-listing-offer-heading"><strong>{tx('seller.offer', { number: String(index + 1) })}</strong>{draft.offers.length > 1 && <button type="button" className="icon-button" aria-label={tx('seller.removeOffer', { number: String(index + 1) })} onClick={() => setDraft(current => ({ ...current, offers: current.offers.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={16} /></button>}</div>
          <div className="form-grid">
            <label>{tx('seller.offerName')}<input required maxLength={60} value={offer.label} onChange={event => updateOffer(index, { label: event.target.value })} /></label>
            <label>{tx('seller.price')}<input required type="number" min="1" max="1000000" step="0.01" value={(offer.amountMinor / 100).toFixed(2)} onChange={event => updateOffer(index, { amountMinor: toBasisPoints(event.target.value) })} /></label>
          </div>
          <fieldset className="beat-listing-deliverables"><legend>{tx('seller.deliverables')}</legend>{(['mp3', 'wav', 'stems'] as const).map(deliverable => <label key={deliverable}><input type="checkbox" checked={offer.deliverables.includes(deliverable)} onChange={event => updateOffer(index, { deliverables: event.target.checked ? [...offer.deliverables, deliverable] : offer.deliverables.filter(item => item !== deliverable) })} /> {deliverable.toUpperCase()}</label>)}</fieldset>
          <label className="short-upload-field">{tx('seller.usageSummary')}<textarea required minLength={10} maxLength={600} rows={3} value={offer.usageSummary} onChange={event => updateOffer(index, { usageSummary: event.target.value })} /></label>
        </article>)}
        <button type="button" className="button ghost beat-listing-add" disabled={draft.offers.length >= 5} onClick={() => setDraft(current => ({ ...current, offers: [...current.offers, { id: `offer-${Date.now()}`, label: tx('seller.newOffer'), amountMinor: 5000, currency: 'USD', deliverables: ['wav'], usageSummary: draftUsageSummary(), termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }] }))}><Plus size={16} /> {tx('seller.addOffer')}</button>
      </section>

      {error && <p className="upload-error" role="alert">{error}</p>}
      <p className="draft-status" role="status">{saved ? tx('seller.saved', { date: listing?.updatedAt ? new Date(listing.updatedAt).toLocaleString() : 'no changes' }) : tx('seller.unsaved')} · {readyForReview ? tx('seller.intakeComplete') : tx('seller.intakeNeeds')}</p>
      <div className="modal-actions"><button type="button" className="button ghost" disabled={busy} onClick={onClose}>{tx('seller.close')}</button><button className="button" type="submit" disabled={busy}><Save size={16} /> {busy ? tx('seller.saving') : tx('seller.save')}</button></div>
    </form>
  </dialog>
}
