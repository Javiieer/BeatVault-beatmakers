import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AuthService, csrfCookie, sessionCookie, sessionMaxAgeSeconds } from './auth'
import { AuditLog, csrfMatches, RateLimiter } from './security'
import { config, isAllowedOrigin } from './config'
import { createRepository } from './repository'
import type { Friendship } from './store'
import { ValidationError, validateCatalogId, validateCreateCatalog, validateCreateProject, validateEmail, validateProjectId, validateRegister, validateToken, validateTokenPassword, validateUpdateCatalog, validateUpdateProject } from './validation'
import type { ProjectRecord } from '../src/domains/core/contracts'
import { adminData } from './admin'
import { receiveUpload, assetPath, reconcileUploads } from './uploads'
import { createReadStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { HttpInputError, parseByteRange, readJson } from './http'
import type { CatalogEntry } from '../src/domains/catalog/types'
import { emptyProfile } from '../src/domains/profile'
import { validateProfile } from './profile'
const runtime = createRepository(); const repo = runtime.repository; export const auth = new AuthService(repo); export const audit = new AuditLog(runtime.auditStore); const limiter = new RateLimiter(config); const creatorSearchLimiter = new RateLimiter(30, 60000)
const catalogForAccount = async (entry: CatalogEntry, ownerId?: string): Promise<CatalogEntry> => {
  const { assetId, ...publicEntry } = entry
  delete publicEntry.audio
  if (!assetId || entry.creatorId !== ownerId) return publicEntry
  const asset = await repo.findAsset(assetId, ownerId)
  return { ...publicEntry, assetId, audio: asset ? { originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, state: asset.state } : undefined }
}
const cookie = (req: IncomingMessage, name: string) => req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1)
const json = (res: ServerResponse, status: number, value: unknown, id: string, origin: string | undefined, cookies: string[] = []) => { const headers: Record<string, string | string[] | number> = { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id, X-CSRF-Token', 'Vary': 'Origin', 'X-Request-Id': id, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }; if (cookies.length) headers['Set-Cookie'] = cookies; res.writeHead(status, headers); res.end(status === 204 ? undefined : JSON.stringify(value)) }
const body = readJson
const directoryProfile = (profile: NonNullable<Awaited<ReturnType<typeof repo.findProfile>>>) => ({ accountId: profile.accountId, displayName: profile.displayName, bio: profile.bio, genres: profile.genres, avatarId: profile.avatarId, coverId: profile.coverId })
const unauthorized = (res: ServerResponse, id: string, origin?: string) => json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida.' }, requestId: id }, id, origin)
const adminOnly = (account: Awaited<ReturnType<typeof auth.accountFor>>, res: ServerResponse, id: string, origin?: string): boolean => { if (!account) { unauthorized(res, id, origin); return false }; if (account.role !== 'admin') { json(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Acceso no autorizado.' }, requestId: id }, id, origin); return false }; return true }
const limited = (res: ServerResponse, id: string, origin?: string) => json(res, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Inténtalo más tarde.' }, requestId: id }, id, origin)
export const server = createServer(async (req, res) => { const id = req.headers['x-request-id']?.toString() || randomUUID(); const path = req.url?.split('?')[0]; const requestOrigin = req.headers.origin?.toString(); try {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  if (!isAllowedOrigin(requestOrigin, config.corsOrigins)) return json(res, 403, { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin no permitido.' }, requestId: id }, id, undefined)
  if (requestOrigin) { res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin') }
  if (req.method === 'OPTIONS') return json(res, 204, null, id, requestOrigin)
   if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, data: { status: 'ok', service: 'beatvault-local-api' }, requestId: id }, id, requestOrigin)
   if (req.method === 'GET' && path === '/api/ready') { const ready = await runtime.checkDatabase(); return json(res, ready ? 200 : 503, { ok: ready, data: { status: ready ? 'ready' : 'unavailable', storageBackend: config.storageBackend }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/register') { const input = validateRegister(await body(req)); if (!limiter.allow(`register:${req.socket.remoteAddress || 'unknown'}`)) return limited(res, id, requestOrigin); try { const result = await auth.register(input.email, input.password); return json(res, 201, { ok: true, data: result, requestId: id }, id, requestOrigin) } catch (error) { if (error instanceof Error && error.message === 'DUPLICATE_ACCOUNT') return json(res, 409, { ok: false, error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'No se pudo crear la cuenta con esos datos.' }, requestId: id }, id, requestOrigin); throw error } }
   if (req.method === 'POST' && (path === '/api/auth/verify/request' || path === '/api/auth/password-reset/request')) { if (!limiter.allow(`recovery:${req.socket.remoteAddress || 'unknown'}`)) return limited(res, id, requestOrigin); const email = validateEmail(await body(req)); const kind = path.includes('verify') ? 'verify' : 'reset'; const token = await auth.issueToken(email, kind); const data = config.devAuthTokens && token ? { devOnlyToken: token } : null; return json(res, 200, { ok: true, data, message: 'Si la cuenta existe, recibirás instrucciones.', requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/verify/confirm') { const confirmed = await auth.confirmVerification(validateToken(await body(req))); return confirmed ? json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin) : json(res, 400, { ok: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido o expirado.' }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/password-reset/confirm') { const input = validateTokenPassword(await body(req)); const changed = await auth.resetPassword(input.token, input.password); return changed ? json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin) : json(res, 400, { ok: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido o expirado.' }, requestId: id }, id, requestOrigin) }
   if (req.method === 'POST' && path === '/api/auth/login') { if (!limiter.allow(`login:${req.socket.remoteAddress || 'unknown'}`)) return limited(res, id, requestOrigin); const value = await body(req); const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}; if (typeof input.email !== 'string' || typeof input.password !== 'string') throw new ValidationError('credentials', 'Credenciales inválidas.'); const result = await auth.login(input.email, input.password); if (!result) { audit.record('login_failure', id); return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' }, requestId: id }, id, requestOrigin) }; audit.record('login_success', id, result.id); const secure = config.cookie.secure ? '; Secure' : ''; const attributes = `SameSite=${config.cookie.sameSite}; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure}`; return json(res, 200, { ok: true, data: { id: result.id, email: result.email, role: result.role, verificationState: result.verificationState }, requestId: id }, id, requestOrigin, [`${sessionCookie}=${result.token}; HttpOnly; ${attributes}`, `${csrfCookie}=${result.csrfToken}; ${attributes}`]) }
  const session = cookie(req, sessionCookie); const account = await auth.accountFor(session)
  if (req.method === 'POST' && path === '/api/auth/logout') { if (account && !csrfMatches(auth.getCsrf(session), req.headers['x-csrf-token']?.toString())) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin); auth.logout(session); audit.record('logout', id, account?.id); return json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin, [`${sessionCookie}=; HttpOnly; SameSite=${config.cookie.sameSite}; Path=/; Max-Age=0`, `${csrfCookie}=; SameSite=${config.cookie.sameSite}; Path=/; Max-Age=0`]) }
   if (req.method === 'GET' && path === '/api/auth/me') return account ? json(res, 200, { ok: true, data: { id: account.id, email: account.email, role: account.role, verificationState: account.verificationState }, requestId: id }, id, requestOrigin) : unauthorized(res, id, requestOrigin)
    if (path?.startsWith('/api/admin/')) {
      if (!adminOnly(account, res, id, requestOrigin)) return
      if (req.method === 'POST' && path.startsWith('/api/admin/catalog-review/')) {
        if (!csrfMatches(auth.getCsrf(session), req.headers['x-csrf-token']?.toString())) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
        const match = path.match(/^\/api\/admin\/catalog-review\/([a-zA-Z0-9_-]{1,80})$/)
        const payload = await body(req)
        const decision = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).decision : undefined
        const reason = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).reason : undefined
        if (!match || (decision !== 'approve' && decision !== 'reject') || (decision === 'reject' && (typeof reason !== 'string' || !reason.trim() || reason.length > 160))) throw new ValidationError('decision', 'Selecciona una decisión y agrega un motivo de rechazo de hasta 160 caracteres.')
        const note = decision === 'reject' && typeof reason === 'string' ? reason.trim() : undefined
        const updated = await repo.reviewCatalog(match[1], decision === 'approve' ? 'published' : 'rejected', note)
        if (!updated) return json(res, 409, { ok: false, error: { code: 'REVIEW_NOT_PENDING', message: 'La subida ya fue revisada o no existe.' }, requestId: id }, id, requestOrigin)
        audit.record('update', id, account!.id, updated.contentId, true, { resource: 'catalog-review', decision, reason: typeof reason === 'string' ? reason.trim() : '' })
        return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
      }
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, requestId: id }, id, requestOrigin)
      await audit.record('admin_read', id, account!.id)
      const all = await Promise.all([repo.listAccounts(), repo.listProjects(), repo.listCatalog()]); const data = adminData(all[0], all[1], all[2], [...audit.entries])
      if (path === '/api/admin/overview') return json(res, 200, { ok: true, data: data.overview, requestId: id }, id, requestOrigin)
      if (path === '/api/admin/accounts') return json(res, 200, { ok: true, data: data.accounts, requestId: id }, id, requestOrigin)
      if (path === '/api/admin/audit') { const query = new URL(req.url || '/', 'http://localhost').searchParams; const limit = Math.min(Number(query.get('limit') || 100), 500); const page = Math.max(Number(query.get('page') || 1), 1); const events = data.audit.slice().reverse(); return json(res, 200, { ok: true, data: events.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: events.length }, requestId: id }, id, requestOrigin) }
      if (path === '/api/admin/catalog-review') return json(res, 200, { ok: true, data: data.catalog.filter(entry => entry.publicationStatus === 'pending-review'), requestId: id }, id, requestOrigin)
      return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' }, requestId: id }, id, requestOrigin)
    }
   if (req.method === 'POST' && path === '/api/auth/password-change') { if (!account) return unauthorized(res, id, requestOrigin); if (!csrfMatches(auth.getCsrf(session), req.headers['x-csrf-token']?.toString())) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin); const input = validateRegister({ email: account.email, password: (await body(req) as Record<string, unknown>).password }); await auth.changePassword(account.id, input.password); return json(res, 200, { ok: true, data: null, requestId: id }, id, requestOrigin) }
  if (path?.startsWith('/api/projects') && !account) return unauthorized(res, id, requestOrigin)
   if (account && ['POST', 'PUT', 'DELETE'].includes(req.method || '') && !csrfMatches(auth.getCsrf(session), req.headers['x-csrf-token']?.toString())) return json(res, 403, { ok: false, error: { code: 'CSRF_REQUIRED', message: 'Token CSRF requerido.' }, requestId: id }, id, requestOrigin)
   if (path === '/api/profile' && (req.method === 'GET' || req.method === 'PUT')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const profile = req.method === 'PUT'
       ? await repo.saveProfile({ ...validateProfile(await body(req)), accountId: account.id })
       : await repo.findProfile(account.id) || emptyProfile(account.id)
     if (req.method === 'PUT') audit.record('update', id, account.id, account.id, true, { resource: 'creator-profile' })
     return json(res, 200, { ok: true, data: profile, requestId: id }, id, requestOrigin)
   }
   const profileMatch = path?.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})$/)
   if (profileMatch && req.method === 'GET') {
     const profile = await repo.findProfile(profileMatch[1])
     if (!profile || (!profile.publicProfile && profile.accountId !== account?.id)) return json(res, 404, { ok: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Perfil no disponible.' } }, id, requestOrigin)
     return json(res, 200, { ok: true, data: profile, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/creators' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (!creatorSearchLimiter.allow(account.id)) return limited(res, id, requestOrigin)
     const query = new URL(req.url || '/', 'http://localhost').searchParams.get('q') || ''
     if (query.length > 80) throw new ValidationError('q', 'La búsqueda no puede superar 80 caracteres.')
     const profiles = await repo.listPublicProfiles(query, account.id)
     return json(res, 200, { ok: true, data: profiles.map(directoryProfile), requestId: id }, id, requestOrigin)
   }
   if (path === '/api/friends' && req.method === 'GET') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const relationships = await repo.listFriendships(account.id)
     const overview = { friends: [] as Array<{ id: string; profile: ReturnType<typeof directoryProfile> }>, incoming: [] as Array<Friendship & { profile: ReturnType<typeof directoryProfile> }>, outgoing: [] as Array<Friendship & { profile: ReturnType<typeof directoryProfile> }> }
     for (const relation of relationships) {
       const otherId = relation.requesterId === account.id ? relation.recipientId : relation.requesterId
       const profile = await repo.findProfile(otherId)
       if (!profile?.publicProfile) continue
       const safeProfile = directoryProfile(profile)
       if (relation.status === 'accepted') overview.friends.push({ id: relation.id, profile: safeProfile })
       else if (relation.recipientId === account.id) overview.incoming.push({ ...relation, profile: safeProfile })
       else overview.outgoing.push({ ...relation, profile: safeProfile })
     }
     return json(res, 200, { ok: true, data: overview, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/friend-requests' && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const value = await body(req); const targetId = value && typeof value === 'object' ? (value as Record<string, unknown>).targetId : undefined
     if (typeof targetId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(targetId) || targetId === account.id) throw new ValidationError('targetId', 'Selecciona un perfil válido.')
     const target = await repo.findProfile(targetId)
     if (!target?.publicProfile) return json(res, 404, { ok: false, error: { code: 'CREATOR_NOT_FOUND', message: 'Ese perfil no está disponible para solicitudes.' }, requestId: id }, id, requestOrigin)
     const now = new Date().toISOString()
     const request = await repo.createFriendship({ id: randomUUID(), requesterId: account.id, recipientId: targetId, status: 'pending', createdAt: now, updatedAt: now })
     audit.record('create', id, account.id, targetId, true, { resource: 'friend-request' })
     return json(res, 201, { ok: true, data: request, requestId: id }, id, requestOrigin)
   }
   const acceptRequestMatch = path?.match(/^\/api\/friend-requests\/([a-zA-Z0-9_-]{1,80})\/accept$/)
   if (acceptRequestMatch && req.method === 'POST') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const updated = await repo.updateFriendship(acceptRequestMatch[1], account.id, 'accepted')
     if (!updated) return json(res, 404, { ok: false, error: { code: 'REQUEST_NOT_FOUND', message: 'La solicitud ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('update', id, account.id, updated.requesterId, true, { resource: 'friend-request' })
     return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin)
   }
   const requestMatch = path?.match(/^\/api\/friend-requests\/([a-zA-Z0-9_-]{1,80})$/)
   if (requestMatch && req.method === 'DELETE') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const deleted = await repo.deleteFriendship(requestMatch[1], account.id, 'pending')
     if (!deleted) return json(res, 404, { ok: false, error: { code: 'REQUEST_NOT_FOUND', message: 'La solicitud ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('delete', id, account.id, undefined, true, { resource: 'friend-request' })
     return json(res, 200, { ok: true, data: { id: requestMatch[1] }, requestId: id }, id, requestOrigin)
   }
   const friendMatch = path?.match(/^\/api\/friends\/([a-zA-Z0-9_-]{1,80})$/)
   if (friendMatch && req.method === 'DELETE') {
     if (!account) return unauthorized(res, id, requestOrigin)
     const deleted = await repo.deleteFriendship(friendMatch[1], account.id, 'accepted')
     if (!deleted) return json(res, 404, { ok: false, error: { code: 'FRIEND_NOT_FOUND', message: 'Esa conexión ya no está disponible.' }, requestId: id }, id, requestOrigin)
     audit.record('delete', id, account.id, undefined, true, { resource: 'friendship' })
     return json(res, 200, { ok: true, data: { id: friendMatch[1] }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/assets/upload' && req.method === 'POST') { if (!account) return unauthorized(res, id, requestOrigin); const result = await receiveUpload(req, account.id, repo); return json(res, 201, { ok: true, data: result.asset, requestId: id }, id, requestOrigin) }
   const assetMatch = path?.match(/^\/api\/assets\/([^/]+)\/(preview|download)$/)
   if (assetMatch && (req.method === 'GET' || req.method === 'HEAD')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     const asset = await repo.findAsset(assetMatch[1], account.id)
     if (!asset) return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin)
     let info
     try { info = await stat(assetPath(asset)) }
     catch { await repo.updateAssetState(asset.id, 'missing'); return json(res, 404, { ok: false, error: { code: 'ASSET_MISSING', message: 'Archivo no disponible.' }, requestId: id }, id, requestOrigin) }
     const range = req.headers.range ? parseByteRange(req.headers.range, info.size) : undefined
     if (req.headers.range && !range) {
       res.setHeader('Content-Range', `bytes */${info.size}`)
       return json(res, 416, { ok: false, error: { code: 'INVALID_RANGE', message: 'Rango invalido.' }, requestId: id }, id, requestOrigin)
     }
     const start = range?.start ?? 0
     const end = range?.end ?? info.size - 1
     const filename = encodeURIComponent(asset.originalName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)
     const headers: Record<string, string | number> = {
       'Content-Type': asset.mimeType, 'Content-Length': Math.max(0, end - start + 1),
       'Accept-Ranges': 'bytes', 'X-Request-Id': id,
       'Content-Disposition': assetMatch[2] === 'download' ? `attachment; filename="download"; filename*=UTF-8''${filename}` : 'inline',
     }
     if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
     res.writeHead(range ? 206 : 200, headers)
     if (req.method === 'HEAD' || info.size === 0) return res.end()
     const stream = createReadStream(assetPath(asset), { start, end })
     stream.on('error', () => res.destroy())
     res.once('close', () => stream.destroy())
     return stream.pipe(res)
   }
   const deleteAssetMatch = path?.match(/^\/api\/assets\/([^/]+)$/); if (deleteAssetMatch && req.method === 'DELETE') { if (!account) return unauthorized(res, id, requestOrigin); const asset = await repo.findAsset(deleteAssetMatch[1], account.id); if (!asset) return json(res, 404, { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin); await repo.deleteAsset(asset.id, account.id); try { await unlink(assetPath(asset)) } catch { /* metadata is already gone; never expose path */ } return json(res, 200, { ok: true, data: { id: asset.id }, requestId: id }, id, requestOrigin) }
  if (req.method === 'GET' && path === '/api/projects') return json(res, 200, { ok: true, data: await repo.listProjects(account?.id), requestId: id }, id, requestOrigin)
  if (req.method === 'POST' && path === '/api/projects') { const input = validateCreateProject(await body(req)); const project: ProjectRecord = { id: randomUUID(), ownerId: account!.id, title: input.title, status: 'draft', updatedAt: new Date().toISOString() }; const created = await repo.createProject(project); audit.record('create', id, account!.id); return json(res, 201, { ok: true, data: created, requestId: id }, id, requestOrigin) }
  const match = path?.match(/^\/api\/projects\/([^/]+)$/); if (match && (req.method === 'PUT' || req.method === 'DELETE')) { const projectId = validateProjectId(match[1]); if (req.method === 'PUT') { const updated = await repo.updateProject(projectId, validateUpdateProject(await body(req)), account!.id); audit.record('update', id, account!.id); return json(res, 200, { ok: true, data: updated, requestId: id }, id, requestOrigin) }; await repo.deleteProject(projectId, account!.id); audit.record('delete', id, account!.id); return json(res, 200, { ok: true, data: { id: projectId }, requestId: id }, id, requestOrigin) }
   if (req.method === 'GET' && path === '/api/catalog') {
     const visible = (await repo.listCatalog()).filter(entry => entry.publicationStatus === 'published' || entry.creatorId === account?.id || account?.role === 'admin')
     const entries = await Promise.all(visible.map(entry => catalogForAccount(entry, account?.id)))
     return json(res, 200, { ok: true, data: { entries, total: entries.length }, requestId: id }, id, requestOrigin)
   }
   if (path === '/api/catalog' || path?.startsWith('/api/catalog/')) {
     if (!account) return unauthorized(res, id, requestOrigin)
     if (req.method === 'POST' && path === '/api/catalog') {
       const input = validateCreateCatalog(await body(req))
       if (['published', 'rejected'].includes(input.publicationStatus)) return json(res, 403, { ok: false, error: { code: 'REVIEW_REQUIRED', message: 'La publicacion requiere revision.' }, requestId: id }, id, requestOrigin)
       if (input.assetId && (await repo.findAsset(input.assetId, account.id))?.state !== 'available') throw new ValidationError('assetId', 'Audio no disponible en tu cuenta.')
       const created = await repo.createCatalog({ contentId: randomUUID(), creatorId: account.id, previewIds: [], ...input })
       audit.record('create', id, account.id)
       return json(res, 201, { ok: true, data: await catalogForAccount(created, account.id), requestId: id }, id, requestOrigin)
     }
     const catalogMatch = path.match(/^\/api\/catalog\/([^/]+)$/)
     if (catalogMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
       const catalogId = validateCatalogId(catalogMatch[1])
       if (req.method === 'PUT') {
         const input = validateUpdateCatalog(await body(req))
         if (['published', 'rejected'].includes(input.publicationStatus)) return json(res, 403, { ok: false, error: { code: 'REVIEW_REQUIRED', message: 'La publicacion requiere revision.' }, requestId: id }, id, requestOrigin)
         const current = (await repo.listCatalog()).find(entry => entry.contentId === catalogId && entry.creatorId === account.id)
         if (!current) throw new Error('CATALOG_NOT_FOUND')
         if (input.assetId !== undefined && input.assetId !== current.assetId) throw new ValidationError('assetId', 'El audio de una subida no puede sustituirse.')
         const updated = await repo.updateCatalog(catalogId, input, account.id)
         audit.record('update', id, account.id)
         return json(res, 200, { ok: true, data: await catalogForAccount(updated, account.id), requestId: id }, id, requestOrigin)
       }
       await repo.deleteCatalog(catalogId, account.id); audit.record('delete', id, account.id)
       return json(res, 200, { ok: true, data: { id: catalogId }, requestId: id }, id, requestOrigin)
     }
   }
   return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' }, requestId: id }, id, requestOrigin)
   } catch (error) { if (error instanceof HttpInputError) return json(res, error.status, { ok: false, error: { code: error.code, message: error.message }, requestId: id }, id, requestOrigin); if (error instanceof ValidationError) return json(res, 400, { ok: false, error: { code: 'VALIDATION_ERROR', message: error.message, field: error.field }, requestId: id }, id, requestOrigin); if (error instanceof Error && (error.message === 'FRIENDSHIP_EXISTS' || (path === '/api/friend-requests' && 'code' in error && error.code === '23505'))) return json(res, 409, { ok: false, error: { code: 'FRIENDSHIP_EXISTS', message: 'Ya hay una solicitud o conexión con ese creador.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && ['UPLOAD_LIMIT', 'UPLOAD_CONTENT_TYPE', 'UPLOAD_FILE_REQUIRED', 'UPLOAD_MIME', 'UPLOAD_SIGNATURE', 'UPLOAD_EMPTY', 'UPLOAD_ABORTED'].includes(error.message)) return json(res, 400, { ok: false, error: { code: error.message, message: 'Upload inválido o excede los límites configurados.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE_ASSET') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_ASSET', message: 'Este archivo ya existe en tu biblioteca.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_PROJECT', message: 'Ya existe un proyecto con ese título.' }, requestId: id, }, id, requestOrigin); if (error instanceof Error && error.message === 'DUPLICATE_CATALOG') return json(res, 409, { ok: false, error: { code: 'DUPLICATE_CATALOG', message: 'Ya existe un asset con ese título y tipo.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'NOT_FOUND') return json(res, 404, { ok: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' }, requestId: id }, id, requestOrigin); if (error instanceof Error && error.message === 'CATALOG_NOT_FOUND') return json(res, 404, { ok: false, error: { code: 'CATALOG_NOT_FOUND', message: 'Asset no encontrado.' }, requestId: id }, id, requestOrigin); return json(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }, requestId: id }, id, requestOrigin) } })
export const shutdown = () => { auth.clearSessions(); limiter.clear(); server.close(); void runtime.close() }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { void Promise.all([auth.initialize(), audit.initialize()]).then(async () => { await reconcileUploads(repo); server.listen(config.port, config.host, () => console.log(`BeatVault API listening on ${config.host}:${config.port}`)); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown) }).catch(error => { console.error(error instanceof Error ? error.message : 'Configuración inválida'); process.exit(1) }) }
