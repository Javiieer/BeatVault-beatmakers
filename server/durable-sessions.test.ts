import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService } from './auth'
import { config } from './config'
import { LocalRepository } from './store'

describe('durable authentication sessions', () => {
  const previousDirectory = config.dataDirectory
  let temporaryDirectory: string | undefined
  afterEach(async () => {
    config.dataDirectory = previousDirectory
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
    temporaryDirectory = undefined
  })

  it('survives service restarts, stores only hashes and revokes across service instances', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'beatvault-sessions-'))
    config.dataDirectory = temporaryDirectory
    const repository = new LocalRepository()
    const firstService = new AuthService(repository)
    const account = await firstService.register('sessions@test.local', 'a sufficiently long password')
    const firstLogin = await firstService.login(account.email, 'a sufficiently long password')
    const secondLogin = await firstService.login(account.email, 'a sufficiently long password')
    expect(firstLogin).toBeDefined()
    expect(secondLogin).toBeDefined()
    const restartedService = new AuthService(new LocalRepository())
    expect((await restartedService.accountFor(firstLogin?.token))?.id).toBe(account.id)
    expect(await restartedService.verifyCsrf(firstLogin?.token, firstLogin?.csrfToken)).toBe(true)
    expect(await restartedService.verifyCsrf(firstLogin?.token, 'forged')).toBe(false)

    const stored = await readFile(join(temporaryDirectory, 'auth-sessions.json'), 'utf8')
    expect(stored).not.toContain(firstLogin?.token)
    expect(stored).not.toContain(firstLogin?.csrfToken)

    expect(await restartedService.changePassword(account.id, 'a sufficiently long password', 'another sufficiently long password', firstLogin?.token)).toBe(true)
    expect(await firstService.accountFor(secondLogin?.token)).toBeUndefined()
    expect((await firstService.accountFor(firstLogin?.token))?.id).toBe(account.id)
    await firstService.logout(firstLogin?.token)
    expect(await restartedService.accountFor(firstLogin?.token)).toBeUndefined()
  })
})
