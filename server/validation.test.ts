import { describe, expect, it } from 'vitest'
import { ValidationError, validateCreateProject, validateCreateCatalog, validateUpdateCatalog } from './validation'

describe('creator content scope', () => {
  it('accepts beats and normalizes one-shots as catalog samples', () => {
    expect(validateCreateCatalog({ title: 'Beat', type: 'Beat' }).type).toBe('beat')
    expect(validateCreateCatalog({ title: 'Kick', type: 'One-shot' }).type).toBe('sample')
  })
  it('blocks new unsupported content while preserving legacy edit compatibility', () => {
    for (const type of ['Loop', 'Pack', 'Vocal', 'MIDI']) expect(() => validateCreateCatalog({ title: 'Legacy', type })).toThrow(ValidationError)
    expect(validateUpdateCatalog({ title: 'Old loop', type: 'Loop', publicationStatus: 'archived' }).type).toBe('loop')
  })
})
describe('project validation', () => { it('accepts the contract input', () => expect(validateCreateProject({ ownerId: 'creator-1', title: 'Idea', contentType: 'beat' }).title).toBe('Idea')); it('rejects missing title', () => expect(() => validateCreateProject({ ownerId: 'x' })).toThrow(ValidationError)); it('rejects unknown type', () => expect(() => validateCreateProject({ ownerId: 'x', title: 'x', contentType: 'audio' })).toThrow(ValidationError)) })
