import type { ReactNode } from 'react'
import { Activity, CreditCard, FileAudio2, LayoutDashboard, Store, Users } from 'lucide-react'
import '../styles/staff-dashboard.css'

export type StaffDashboardMetric = { label: string; value: string | number; note?: string }

type StaffDashboardProps = {
  role: 'admin' | 'community_manager'
  title: string
  description: string
  status: string
  metrics: StaffDashboardMetric[]
  children: ReactNode
}

const navigationByRole = {
  admin: [
    { id: 'admin-overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'admin-content-moderation', label: 'Moderation', icon: FileAudio2 },
    { id: 'admin-community-moderation', label: 'Community reports', icon: Users },
    { id: 'admin-marketplace', label: 'Marketplace', icon: Store },
    { id: 'admin-payments', label: 'Payments', icon: CreditCard },
    { id: 'admin-platform', label: 'Platform & accounts', icon: Users },
  ],
  community_manager: [
    { id: 'community-overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'community-beats', label: 'Beat moderation', icon: FileAudio2 },
    { id: 'community-listings', label: 'Commercial review', icon: Store },
  ],
} as const

export function StaffDashboard({ role, title, description, status, metrics, children }: StaffDashboardProps) {
  const navigation = navigationByRole[role]
  return <main className={'page-stack staff-dashboard staff-dashboard-' + role + ' ' + (role === 'admin' ? 'admin-page' : 'marketplace-review')}>
    <header className="staff-dashboard-header" id={role === 'admin' ? 'admin-overview' : 'community-overview'}>
      <div>
        <p className="eyebrow">{role === 'admin' ? 'BEATVAULT OPERATIONS' : 'BEATVAULT MODERATION'}</p>
        <h1>{title}</h1>
        <p className="description">{description}</p>
      </div>
      <span className={'staff-dashboard-status ' + (status.toLowerCase().includes('attention') || status.toLowerCase().includes('unavailable') ? 'attention' : '')}><Activity size={15} />{status}</span>
    </header>
    <section className="staff-dashboard-metrics" aria-label="Dashboard summary">
      {metrics.map(metric => <article className="staff-dashboard-metric" key={metric.label}>
        <span>{metric.label}</span><strong>{metric.value}</strong>{metric.note && <small>{metric.note}</small>}
      </article>)}
    </section>
    <nav className="staff-dashboard-nav" aria-label={role === 'admin' ? 'Admin dashboard sections' : 'Moderation dashboard sections'}>
      {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <Icon size={16} /><span>{label}</span>
      </button>)}
    </nav>
    <div className="staff-dashboard-sections">{children}</div>
  </main>
}
