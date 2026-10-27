import { useEffect, useState } from 'react'
import { ArrowUpRight, BadgeCheck, CircleAlert, LoaderCircle } from 'lucide-react'
import { getMercadoPagoSellerStatus, safeMercadoPagoOAuthUrl, startMercadoPagoOAuth, type MercadoPagoSellerStatus } from '../api/client'
import { tx } from '../i18n'

export function MercadoPagoConnectPanel() {
  const [status, setStatus] = useState<MercadoPagoSellerStatus>()
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clockNow, setClockNow] = useState<number>()

  useEffect(() => {
    let active = true
    setClockNow(Date.now())
    void getMercadoPagoSellerStatus().then(result => {
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
    const result = await startMercadoPagoOAuth()
    if (!result.ok) { setError(result.error.message); setLoading(false); return }
    const destination = safeMercadoPagoOAuthUrl(result.data.url)
    if (!destination) { setError(tx('connect.statusUnavailable')); setLoading(false); return }
    window.location.assign(destination)
  }

  const tokenExpired = status?.tokenExpiresAt && clockNow !== undefined ? Date.parse(status.tokenExpiresAt) <= clockNow : false

  return <section className="panel mercadopago-connect-panel" aria-labelledby="mercadopago-connect-title">
    <div className="mercadopago-connect-copy">
      <p className="eyebrow">{tx('connect.eyebrow')}</p>
      <h2 id="mercadopago-connect-title">{tx('connect.title')}</h2>
      <p className="description">{tx('connect.description')}</p>
      {status?.connected && <p className="mercadopago-connect-state"><BadgeCheck size={16} />{tokenExpired ? tx('connect.pending', { date: new Date(status.tokenExpiresAt!).toLocaleString() }) : tx('connect.ready')}</p>}
      {error && <p className="form-error" role="alert"><CircleAlert size={15} />{error}</p>}
    </div>
    {status && !status.enabled && <p className="mercadopago-connect-state" role="status">{tx('connect.notConfigured')}</p>}
    <button className="button" type="button" disabled={!statusLoaded || loading || !status?.enabled || Boolean(status?.connected && !tokenExpired)} onClick={() => void begin()}>
      {loading ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}
      {status?.connected ? tokenExpired ? tx('connect.continue') : tx('connect.complete') : tx('connect.start')}
    </button>
  </section>
}
