import { describe, expect, it } from 'vitest'
import { ValidationError, validateCreateProject } from './validation'
describe('project validation', () => { it('accepts the contract input', () => expect(validateCreateProject({ ownerId: 'creator-1', title: 'Idea', contentType: 'beat' }).title).toBe('Idea')); it('rejects missing title', () => expect(() => validateCreateProject({ ownerId: 'x' })).toThrow(ValidationError)); it('rejects unknown type', () => expect(() => validateCreateProject({ ownerId: 'x', title: 'x', contentType: 'audio' })).toThrow(ValidationError)) })
