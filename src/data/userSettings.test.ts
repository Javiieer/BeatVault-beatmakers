import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readUserSettings, saveUserSettings, userSettingsKey } from './userSettings'
import { defaultCustomTheme } from '../app/theme'

describe('account preferences', () => {
  beforeEach(() => localStorage.clear())

  it('keeps settings isolated by account and restores saved choices', () => {
    const initial = readUserSettings('creator-one')
    const next = { ...initial, theme: 'custom' as const, customTheme: { ...initial.customTheme, button: '#e34b77' }, language: 'en' as const, reducedMotion: true }
    expect(saveUserSettings('creator-one', next)).toBe(true)
    expect(readUserSettings('creator-one')).toMatchObject(next)
    expect(readUserSettings('creator-two').theme).toBe('dark')
    expect(readUserSettings('creator-one').customTheme.button).toBe('#e34b77')
    expect(localStorage.getItem(userSettingsKey('creator-one'))).toContain('custom')
  })

  it('recovers safely from invalid stored preferences', () => {
    localStorage.setItem(userSettingsKey('creator-one'), '{broken')
    expect(readUserSettings('creator-one')).toMatchObject({ theme: 'dark', customTheme: defaultCustomTheme, language: 'es', reducedMotion: false })
  })

  it('broadcasts changes so app chrome can update immediately', () => {
    const listener = vi.fn()
    window.addEventListener('beatvault:settings-changed', listener)
    saveUserSettings('creator-one', { ...readUserSettings('creator-one'), theme: 'light' })
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('beatvault:settings-changed', listener)
  })
})
