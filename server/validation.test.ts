import { describe, expect, it } from 'vitest'
import { ValidationError, validateCreateProject, validateCreateCatalog, validateUpdateCatalog, validateBeatListingInput } from './validation'

describe('creator content scope', () => {
  it('rejects stems in new seller offers and accepts MP3/WAV', () => {
    const input = {
      description: 'A local beat offer with supported delivery formats.', genre: 'Hip-hop', explicitContent: false,
      rights: { sellerCompositionShareBps: 10000, sellerMasterShareBps: 10000, sampleDisclosure: 'none', sampleProofAvailable: false, declarationAccepted: true, collaborators: [] },
      offers: [{ id: 'standard', label: 'Standard', amountMinor: 3000, currency: 'USD', deliverables: ['wav'], usageSummary: 'Personal recording and performance license.', termsVersion: 'non-exclusive-offer-draft-v1', status: 'draft-only' }],
    }
    expect(validateBeatListingInput(input).offers[0].deliverables).toEqual(['wav'])
    expect(() => validateBeatListingInput({ ...input, offers: [{ ...input.offers[0], deliverables: ['wav', 'stems'] }] })).toThrow('Los stems quedan fuera')
  })
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
