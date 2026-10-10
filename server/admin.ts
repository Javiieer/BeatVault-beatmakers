import type { CatalogEntry } from '../src/domains/catalog/types'
import type { ProjectRecord } from '../src/domains/core/contracts'
import type { Account } from './auth'
import type { AuditEvent } from './security'

export type AdminAccount = Pick<Account, 'id' | 'email' | 'role' | 'verificationState'>
export type AdminCatalogEntry = Pick<CatalogEntry, 'contentId' | 'creatorId' | 'type' | 'title' | 'publicationStatus'>
export type AdminOverview = { accounts: number; creators: number; admins: number; projects: number; catalog: number; auditEntries: number }
export type AdminData = { overview: AdminOverview; accounts: AdminAccount[]; projects: ProjectRecord[]; catalog: AdminCatalogEntry[]; audit: AuditEvent[] }

export const redactAccount = (account: Account): AdminAccount => ({ id: account.id, email: account.email, role: account.role, verificationState: account.verificationState })
export const adminData = (accounts: Account[], projects: ProjectRecord[], catalog: CatalogEntry[], audit: AuditEvent[]): AdminData => ({
  overview: { accounts: accounts.length, creators: accounts.filter(item => item.role === 'creator').length, admins: accounts.filter(item => item.role === 'admin').length, projects: projects.length, catalog: catalog.length, auditEntries: audit.length },
  accounts: accounts.map(redactAccount), projects, catalog: catalog.map(({ contentId, creatorId, type, title, publicationStatus }) => ({ contentId, creatorId, type, title, publicationStatus })), audit,
})
