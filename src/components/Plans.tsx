import { useEffect, useState } from 'react'
import { Check, HardDrive } from 'lucide-react'
import { getAccountPlan, getAccountStorageUsage, type AccountPlanSnapshot, type AccountStorageUsage } from '../api/client'
import { estimateStorageCapacity } from '../domains/plans'

const formatStorage = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}

export function Plans() {
  const [planData, setPlanData] = useState<AccountPlanSnapshot>()
  const [storage, setStorage] = useState<AccountStorageUsage>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void Promise.all([getAccountPlan(), getAccountStorageUsage()]).then(([planResult, storageResult]) => {
      if (!active) return
      if (planResult.ok && storageResult.ok) {
        setPlanData(planResult.data)
        setStorage(storageResult.data)
      } else setError('Inicia sesión para consultar el paquete y consumo de tu cuenta.')
    })
    return () => { active = false }
  }, [])

  const activePlan = planData?.plans.find(item => item.id === planData.planId)
  const usedPercent = storage?.limitBytes ? storage.usedBytes / storage.limitBytes * 100 : undefined
  return <div className="page-stack plans-page">
    <header className="page-header"><div><p className="eyebrow">Workspace / suscripción</p><h1>Paquetes</h1><p className="description">Capacidades de cuenta y almacenamiento asignado.</p></div><span className="badge demo">LOCAL · SIN PAGOS</span></header>
    {error && <p className="admin-guard" role="status">{error}</p>}
    <section className="panel current-plan"><div><p className="eyebrow">Paquete actual</p><h2>{activePlan?.name ?? 'Consultando…'} <span className="badge cyan">{planData?.status === 'local' ? 'ASIGNADO LOCALMENTE' : 'SIN DATOS'}</span></h2><p className="description">{activePlan?.description ?? 'El estado se obtiene de la cuenta autenticada.'}</p></div><div className="plan-storage-summary"><div className="plan-storage-label"><HardDrive size={18} /><span>Audio original usado</span></div><strong>{storage ? `${formatStorage(storage.usedBytes)}${storage.limitBytes === null ? '' : ` / ${formatStorage(storage.limitBytes)}`}` : '—'}</strong>{usedPercent !== undefined && <div className="plan-storage-meter"><progress max={100} value={Math.min(100, usedPercent)} aria-label="Uso de almacenamiento" /><small>{new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(usedPercent)}% usado</small></div>}<small>{storage ? `Límite: ${storage.quotaSource === 'plan' ? 'paquete' : storage.quotaSource === 'account' ? 'prueba individual' : storage.quotaSource === 'server' ? 'servidor' : 'sin configurar'}` : 'Carga desde tu cuenta'}</small></div></section>
    <section><div className="section-heading"><div><p className="eyebrow">Paquetes disponibles</p><h2>Capacidades</h2></div><small>Cuotas locales provisionales · precios pendientes</small></div><div className="plans-grid">{(planData?.plans ?? [
      { id: 'free' as const, name: 'Free', description: 'Acceso inicial a BeatVault.', storageLimitBytes: 5 * 1024 ** 3 },
      { id: 'creator' as const, name: 'Creator', description: 'Herramientas para un creador independiente.', storageLimitBytes: 50 * 1024 ** 3 },
      { id: 'studio' as const, name: 'Studio', description: 'Capacidades para un espacio de producción.', storageLimitBytes: 250 * 1024 ** 3 },
    ]).map(plan => <article className={`panel plan-card ${plan.id === planData?.planId ? 'featured' : ''}`} key={plan.id}>
      {plan.id === planData?.planId && <span className="plan-ribbon"><Check size={12} /> Paquete actual</span>}
      <h2>{plan.name}</h2><p className="description">{plan.description}</p>
      <strong className="plan-capacity">{plan.storageLimitBytes === null ? 'Cuota por definir' : formatStorage(plan.storageLimitBytes)}</strong>
      {(() => { const estimate = estimateStorageCapacity(plan.storageLimitBytes); return <ul className="plan-capacity-examples"><li><HardDrive size={15} />≈{estimate?.threeMinuteWavs.toLocaleString('es-MX') ?? '—'} beats WAV de 3 min</li><li><Check size={15} />≈{estimate?.oneShots.toLocaleString('es-MX') ?? '—'} one-shots de 4 MiB</li></ul> })()}
      <span className="badge demo">Precio pendiente · pagos desactivados</span>
    </article>)}</div></section>
    <p className="demo-note">Estimaciones orientativas con WAV estéreo 44.1 kHz/24-bit de 3 min y one-shots de 4 MiB; compresión y duración cambian el resultado. Cuotas provisionales locales, sin precio ni cobro. La asignación administrativa no implica compra.</p>
  </div>
}
