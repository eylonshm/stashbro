import { createHash, randomBytes, randomInt } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

// Fail loud if JWT_SECRET missing in magic-link mode - checked at call time
function getJwtSecret(): Uint8Array {
  const s = process.env['JWT_SECRET']
  if (!s) throw new Error('JWT_SECRET env var is required in magic-link mode')
  return new TextEncoder().encode(s)
}

const ACCESS_TTL_S = 15 * 60 // 15 minutes
const REFRESH_TTL_DAYS = 30

export function generateCode(): string {
  // randomInt is cryptographically secure (uses crypto.randomInt)
  return String(randomInt(100000, 1000000)).padStart(6, '0')
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(getJwtSecret())
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload.sub ?? null
  } catch {
    // JWT_SECRET missing or token invalid/expired -> caller handles
    return null
  }
}

export function refreshTokenExpiry(): string {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function codeExpiry(): string {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
}
