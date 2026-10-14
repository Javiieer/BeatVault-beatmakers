import type { IncomingMessage } from 'node:http'

export const maxJsonBytes = 64 * 1024
export const maxStripeWebhookBytes = 1024 * 1024

export class HttpInputError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    req.resume()
    throw new HttpInputError(415, 'JSON_REQUIRED', 'Se requiere application/json.')
  }
  if (Number(req.headers['content-length']) > maxJsonBytes) {
    req.resume()
    throw new HttpInputError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud excede el limite permitido.')
  }
  let bytes = 0
  const chunks: Buffer[] = []
  // Keep the socket open long enough to send a bounded-input error response.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maxJsonBytes) {
      req.resume()
      throw new HttpInputError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud excede el limite permitido.')
    }
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new HttpInputError(400, 'INVALID_JSON', 'JSON invalido.') }
}

export async function readRawBody(req: IncomingMessage, maxBytes = maxStripeWebhookBytes): Promise<Buffer> {
  if (Number(req.headers['content-length']) > maxBytes) {
    req.resume()
    throw new HttpInputError(413, 'PAYLOAD_TOO_LARGE', 'Webhook payload exceeds the allowed size.')
  }
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maxBytes) {
      req.resume()
      throw new HttpInputError(413, 'PAYLOAD_TOO_LARGE', 'Webhook payload exceeds the allowed size.')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export function parseByteRange(value: string, size: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || size <= 0) return undefined
  if (!match[1]) {
    const suffix = Number(match[2])
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : undefined
  }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return undefined
  return { start, end: Math.min(requestedEnd, size - 1) }
}
