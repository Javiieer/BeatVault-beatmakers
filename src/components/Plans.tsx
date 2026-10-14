import { useEffect, useState } from 'react'
import { Check, CreditCard, HardDrive, X } from 'lucide-react'
import { getAccountPlan, getAccountStorageUsage, type AccountPlanSnapshot, type AccountStorageUsage } from '../api/client'
import {
  CREATOR_PLAN_PRICING,
  estimateSellerNetCents,
  estimateStorageCapacity,
  getAnnualSavingsCents,
  getPlanPriceCents,
  type BillingInterval,
  type CreatorPlanId,
} from '../domains/plans'
import { tx } from '../i18n'

const planIds: CreatorPlanId[] = ['free', 'creator', 'studio']

const formatStorage = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}

const formatUsd = (cents: number, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2, ...options,
}).format(cents / 100)

const planName = (id: CreatorPlanId) => tx(`plans.${id}`)

export function Plans() {
  const [planData, setPlanData] = useState<AccountPlanSnapshot>()
  const [storage, setStorage] = useState<AccountStorageUsage>()
  const [error, setError] = useState('')
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [monthlySales, setMonthlySales] = useState('500')
  const [checkoutPlan, setCheckoutPlan] = useState<Exclude<CreatorPlanId, 'free'> | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getAccountPlan(), getAccountStorageUsage()]).then(([planResult, storageResult]) => {
      if (!active) return
      if (planResult.ok) setPlanData(planResult.data)
      if (storageResult.ok) setStorage(storageResult.data)
      if (!planResult.ok || !storageResult.ok) setError(tx('plans.signInNotice'))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!checkoutPlan) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setCheckoutPlan(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [checkoutPlan])

  const activePlan = planData?.plans.find(item => item.id === planData.planId)
  const usedPercent = storage?.limitBytes ? storage.usedBytes / storage.limitBytes * 100 : undefined
  const monthlySalesCents = Math.round(Math.max(0, Number(monthlySales) || 0) * 100)
  const selectedPrice = checkoutPlan ? getPlanPriceCents(checkoutPlan, interval) : 0

  return <div className="page-stack plans-page">
    <header className="page-header">
      <div><p className="eyebrow">{tx('plans.eyebrow')}</p><h1>{tx('plans.title')}</h1><p className="description">{tx('plans.description')}</p></div>
      <span className="badge demo">{tx('plans.proposalBadge')}</span>
    </header>

    {error && <p className="admin-guard" role="status">{error}</p>}

    <section className="panel current-plan">
      <div>
        <p className="eyebrow">{tx('plans.currentPlan')}</p>
        <h2>{activePlan ? planName(activePlan.id) : tx('plans.accountNotLoaded')} <span className="badge cyan">{planData ? tx('plans.localAssignment') : tx('plans.noBilling')}</span></h2>
        <p className="description">{planData ? tx('plans.localAssignmentNote') : tx('plans.signInNotice')}</p>
      </div>
      <div className="plan-storage-summary">
        <div className="plan-storage-label"><HardDrive size={18} /><span>{tx('plans.originalAudio')}</span></div>
        <strong>{storage ? `${formatStorage(storage.usedBytes)}${storage.limitBytes === null ? '' : ` / ${formatStorage(storage.limitBytes)}`}` : '—'}</strong>
        {usedPercent !== undefined && <div className="plan-storage-meter"><progress max={100} value={Math.min(100, usedPercent)} aria-label={tx('plans.storageUsage')} /><small>{new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(usedPercent)}% {tx('plans.used')}</small></div>}
        <small>{storage ? tx(`plans.quota.${storage.quotaSource}`) : tx('plans.loadingAccount')}</small>
      </div>
    </section>

    <section className="plan-offers">
      <div className="section-heading">
        <div><p className="eyebrow">{tx('plans.memberships')}</p><h2>{tx('plans.choosePlan')}</h2></div>
        <div className="plan-billing-switch" role="group" aria-label={tx('plans.billingInterval')}>
          <button type="button" className={interval === 'monthly' ? 'selected' : ''} aria-pressed={interval === 'monthly'} onClick={() => setInterval('monthly')}>{tx('plans.monthly')}</button>
          <button type="button" className={interval === 'annual' ? 'selected' : ''} aria-pressed={interval === 'annual'} onClick={() => setInterval('annual')}>{tx('plans.annual')}</button>
        </div>
      </div>
      <div className="plans-grid">
        {planIds.map(id => {
          const definition = planData?.plans.find(item => item.id === id)
          const storageBytes = definition?.storageLimitBytes ?? ({ free: 5, creator: 50, studio: 250 }[id] * 1024 ** 3)
          const pricing = CREATOR_PLAN_PRICING[id]
          const estimate = estimateStorageCapacity(storageBytes)
          const isCurrent = id === planData?.planId
          const canChoose = id !== 'free' && !isCurrent
          return <article className={`panel plan-card plan-card-${id} ${isCurrent ? 'featured' : ''}`} key={id}>
            {isCurrent && <span className="plan-ribbon"><Check size={12} />{tx('plans.currentPlan')}</span>}
            {id === 'creator' && <span className="plan-popular">{tx('plans.popular')}</span>}
            <h3>{planName(id)}</h3>
            <p className="description">{tx(`plans.${id}Description`)}</p>
            <div className="plan-price">
              {id === 'free' ? <strong>{tx('plans.freePrice')}</strong> : <><strong>{formatUsd(getPlanPriceCents(id, interval))}</strong><small> / {interval === 'annual' ? tx('plans.year') : tx('plans.month')}</small></>}
            </div>
            {interval === 'annual' && id !== 'free' && <small className="plan-savings">{tx('plans.saveAnnual', { amount: formatUsd(getAnnualSavingsCents(id)) })}</small>}
            <ul className="plan-benefits">
              <li><HardDrive size={15} />{formatStorage(storageBytes)} {tx('plans.provisionalStorage')}</li>
              <li><Check size={15} />{pricing.marketplaceFeePercent}% {tx('plans.marketplaceFee')}</li>
              <li><Check size={15} />{tx('plans.creatorProfile')}</li>
              <li><Check size={15} />{tx('plans.reviewAccess')}</li>
            </ul>
            {estimate && <div className="plan-capacity-examples"><span>≈{estimate.threeMinuteWavs.toLocaleString('en-US')} {tx('plans.beatsWav')}</span><span>≈{estimate.oneShots.toLocaleString('en-US')} {tx('plans.oneShots')}</span></div>}
            {id === 'free'
              ? <span className="badge demo plan-status">{isCurrent ? tx('plans.currentLocal') : tx('plans.freeAccess')}</span>
              : <button className="button primary plan-choose" type="button" disabled={!canChoose || !planData} onClick={() => setCheckoutPlan(id)}>{isCurrent ? tx('plans.currentLocal') : tx('plans.chooseButton')}</button>}
          </article>
        })}
      </div>
      <p className="demo-note">{tx('plans.capacityNote')}</p>
    </section>

    <section className="panel seller-fee-tool">
      <div className="section-heading"><div><p className="eyebrow">{tx('plans.sellerTools')}</p><h2>{tx('plans.feeCalculator')}</h2></div></div>
      <label className="fee-sales-input">{tx('plans.monthlySales')}<span><span>$</span><input aria-label={tx('plans.monthlySales')} type="number" min="0" step="10" value={monthlySales} onChange={event => setMonthlySales(event.target.value)} /><span>USD</span></span></label>
      <div className="fee-comparison">
        {(['free', 'creator', 'studio'] as const).map(id => {
          const monthlyMembershipCents = Math.round(getPlanPriceCents(id, interval) / (interval === 'annual' ? 12 : 1))
          return <div className={id === planData?.planId ? 'current' : ''} key={id}><span>{planName(id)} · {CREATOR_PLAN_PRICING[id].marketplaceFeePercent}%</span><strong>{formatUsd(estimateSellerNetCents(id, monthlySalesCents) - monthlyMembershipCents)}</strong><small>{tx('plans.afterFeeAndMembership', { cost: formatUsd(monthlyMembershipCents) })}</small></div>
        })}
      </div>
      <p className="demo-note">{tx('plans.feeNote')}</p>
    </section>

    <section className="plan-purchase-steps">
      <div><span>1</span><div><strong>{tx('plans.stepChoose')}</strong><small>{tx('plans.stepChooseNote')}</small></div></div>
      <div><span>2</span><div><strong>{tx('plans.stepPay')}</strong><small>{tx('plans.stepPayNote')}</small></div></div>
      <div><span>3</span><div><strong>{tx('plans.stepActivate')}</strong><small>{tx('plans.stepActivateNote')}</small></div></div>
    </section>

    {checkoutPlan && <div className="plan-checkout-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCheckoutPlan(null) }}>
      <section className="panel plan-checkout" role="dialog" aria-modal="true" aria-labelledby="plan-checkout-title">
        <header><div><p className="eyebrow">{tx('plans.checkoutEyebrow')}</p><h2 id="plan-checkout-title">{tx('plans.checkoutTitle')}</h2></div><button className="icon-button" type="button" aria-label={tx('plans.closeCheckout')} onClick={() => setCheckoutPlan(null)}><X size={18} /></button></header>
        <div className="plan-checkout-summary"><div><strong>{planName(checkoutPlan)}</strong><span>{interval === 'annual' ? tx('plans.annualBilling') : tx('plans.monthlyBilling')}</span></div><strong>{formatUsd(selectedPrice)}<small> / {interval === 'annual' ? tx('plans.year') : tx('plans.month')}</small></strong></div>
        <p>{tx('plans.checkoutFee', { fee: String(CREATOR_PLAN_PRICING[checkoutPlan].marketplaceFeePercent) })}</p>
        <p className="plan-checkout-warning"><CreditCard size={17} />{tx('plans.checkoutDisabled')}</p>
        <button className="button primary" type="button" disabled>{tx('plans.continuePayment')}</button>
        <small className="demo-note">{tx('plans.checkoutNoCharge')}</small>
      </section>
    </div>}
  </div>
}
