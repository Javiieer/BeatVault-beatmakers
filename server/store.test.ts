import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from './store'

describe('JsonStore', () => {
  it('serializes concurrent read-modify-write operations without losing updates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'beatvault-json-store-'))
    try {
      const file = join(directory, 'records.json')
      const first = new JsonStore(file)
      const second = new JsonStore(file)
      const valid = (value: unknown): value is number => typeof value === 'number'
      await Promise.all(Array.from({ length: 80 }, (_, index) => (index % 2 ? first : second).update<number[], number[]>([], valid, current => ({
        value: [...current, index],
        result: [...current, index],
      }))))

      const records = await first.read<number[]>([], valid)
      expect(records).toHaveLength(80)
      expect(new Set(records)).toEqual(new Set(Array.from({ length: 80 }, (_, index) => index)))
      expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(80)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
