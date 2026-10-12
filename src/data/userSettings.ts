import { defaultCustomTheme, defaultTheme, parseCustomTheme, parseTheme, type CustomThemeColors, type Theme } from '../app/theme'

export type UserSettings = {
  theme: Theme
  customTheme: CustomThemeColors
  language: 'es' | 'en'
  notifications: { messages: boolean; friendRequests: boolean; comments: boolean; reactions: boolean; reviews: boolean }
  reducedMotion: boolean
}

export const defaultUserSettings: UserSettings = {
  theme: defaultTheme,
  customTheme: defaultCustomTheme,
  language: 'es',
  notifications: { messages: true, friendRequests: true, comments: true, reactions: true, reviews: true },
  reducedMotion: false,
}

export const userSettingsKey = (userId: string) => `beatvault:settings:${userId}`

export function readUserSettings(userId: string): UserSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(userSettingsKey(userId)) || 'null')
    if (!value || typeof value !== 'object') return defaultUserSettings
    const input = value as Partial<UserSettings>
    return {
      theme: parseTheme(input.theme),
      customTheme: parseCustomTheme(input.customTheme),
      language: input.language === 'en' ? 'en' : 'es',
      notifications: {
        messages: input.notifications?.messages !== false,
        friendRequests: input.notifications?.friendRequests !== false,
        comments: input.notifications?.comments !== false,
        reactions: input.notifications?.reactions !== false,
        reviews: input.notifications?.reviews !== false,
      },
      reducedMotion: input.reducedMotion === true,
    }
  } catch {
    return defaultUserSettings
  }
}

export function saveUserSettings(userId: string, settings: UserSettings): boolean {
  try {
    localStorage.setItem(userSettingsKey(userId), JSON.stringify(settings))
    window.dispatchEvent(new CustomEvent('beatvault:settings-changed', { detail: { userId, settings } }))
    return true
  } catch {
    return false
  }
}
