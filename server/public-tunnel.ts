export type PublicTunnelOrigin = { origin: string; hostname: string }

export function parsePublicTunnelOrigin(value: string | undefined): PublicTunnelOrigin | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.origin !== value.replace(/\/$/, '') || url.username || url.password || url.search || url.hash ||
      ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.includes(':') || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return undefined
    return { origin: url.origin, hostname }
  } catch { return undefined }
}

export function publicTunnelViteOptions(value: string | undefined) {
  const tunnel = parsePublicTunnelOrigin(value)
  if (!tunnel) return undefined
  return {
    allowedHosts: [tunnel.hostname],
    corsOrigins: ['http://localhost:5188', 'http://127.0.0.1:5188', tunnel.origin],
  }
}
