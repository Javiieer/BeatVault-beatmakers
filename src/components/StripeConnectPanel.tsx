import { useEffect, useState } from 'react'
import { ArrowUpRight, BadgeCheck, CircleAlert, LoaderCircle } from 'lucide-react'
import { getStripeConnectStatus, startStripeConnectOnboarding, type StripeConnectStatus } from '../api/client'
import { tx } from '../i18n'

export function StripeConnectPanel() {
  const [status, setStatus] = useState<StripeConnectStatus>()
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getStripeConnectStatus().then(result => {
      if (!active) return
      if (result.ok) setStatus(result.data)
      else setError(tx('connect.statusUnavailable'))
      setStatusLoaded(true)
    })
    return () => { active = false }
  }, [])

  const begin = async () => {
    setLoading(true)
    setError('')
    const result = await startStripeConnectOnboarding()
    if (!result.ok) { setError(result.error.message); setLoading(false); return }
    window.location.assign(result.data.url)
  }

  return <section className="panel stripe-connect-panel" aria-labelledby="stripe-connect-title">
    <div className="stripe-connect-copy">
      <p className="eyebrow">{tx('connect.eyebrow')}</p>
      <h2 id="stripe-connect-title">{tx('connect.title')}</h2>
      <p className="description">{tx('connect.description')}</p>
      {status?.connected && <p className="stripe-connect-state"><BadgeCheck size={16} />{status.payoutsEnabled ? tx('connect.ready') : tx('connect.pending')}</p>}
      {error && <p className="form-error" role="alert"><CircleAlert size={15} />{error}</p>}
    </div>
    {status && !status.enabled && <p className="stripe-connect-state" role="status">{tx('connect.notConfigured')}</p>}
    <button className="button" type="button" disabled={!statusLoaded || loading || !status?.enabled || status.payoutsEnabled} onClick={() => void begin()}>
      {loading ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}
      {status?.payoutsEnabled ? tx('connect.complete') : status?.connected ? tx('connect.continue') : tx('connect.start')}
    </button>
  </section>
}
