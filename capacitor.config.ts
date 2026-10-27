import type { CapacitorConfig } from '@capacitor/cli'

const serverUrl = process.env.BEATVAULT_ANDROID_SERVER_URL?.trim()

if (serverUrl) {
  const parsedServerUrl = new URL(serverUrl)
  if (parsedServerUrl.protocol !== 'https:' || parsedServerUrl.pathname !== '/' || parsedServerUrl.search || parsedServerUrl.hash) {
    throw new Error('BEATVAULT_ANDROID_SERVER_URL debe ser un origen HTTPS sin ruta, query ni fragmento.')
  }
}

const config: CapacitorConfig = {
  appId: 'com.beatvault.beatmakers',
  appName: 'BeatVault BeatMakers',
  webDir: 'dist',
  ...(serverUrl ? { server: { url: serverUrl, cleartext: false } } : {}),
}

export default config
