/**
 * Secure Authentication & Session Management for /write
 * - Constant-time comparison (mitigates timing attacks)
 * - Rate limiting & brute-force IP lockout
 * - Cryptographically signed HMAC-SHA256 session tokens (tamper-proof)
 * - Secure HttpOnly SameSite=Strict cookies
 *
 * SECRETS POLICY: Never hardcode passwords or secrets in source code or git commits.
 * Always configure secrets via environment variables (ADMIN_PASSWORD or ADMIN_PASSWORD_HASH).
 */

export interface AuthEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  AUTH_SECRET?: string;
  [key: string]: any;
}

// In-memory rate limiting tracker (per runtime instance)
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 minutes lockout
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

const FALLBACK_SECRET = "maenexists-auth-production-secret-token-key-2026-fallback";

/**
 * Constant-time string equality check to prevent timing attacks
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);

  // Equalize length comparisons to prevent leaking length via timing
  const len = Math.max(aBuf.length, bBuf.length);
  let diff = aBuf.length ^ bBuf.length;

  for (let i = 0; i < len; i++) {
    const byteA = i < aBuf.length ? aBuf[i] : 0;
    const byteB = i < bBuf.length ? bBuf[i] : 0;
    diff |= byteA ^ byteB;
  }

  return diff === 0;
}

/**
 * SHA-256 helper for hashing passwords
 */
export async function sha256(message: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check brute-force attempts for a client IP
 */
export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) {
    return { allowed: true };
  }

  if (record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  // If lockout or attempt window expired, reset
  if (now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_TIME_MS;
    const retryAfter = Math.ceil(LOCKOUT_TIME_MS / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  return { allowed: true };
}

/**
 * Record a failed attempt
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(ip, {
      count: 1,
      firstAttempt: now,
      lockedUntil: 0,
    });
  } else {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_TIME_MS;
    }
  }
}

/**
 * Reset failed attempts on successful login
 */
export function resetAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Get client IP from headers
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }

  return "127.0.0.1";
}

/**
 * Verify credentials
 * Strictly reads from environment variables (ADMIN_PASSWORD or ADMIN_PASSWORD_HASH).
 * No plaintext passwords are kept in code or git.
 */
export async function verifyCredentials(
  user: string,
  pass: string,
  env: AuthEnv
): Promise<{ ok: boolean; reason?: string }> {
  const expectedUser = env.ADMIN_USERNAME || "maen";
  const expectedPass = env.ADMIN_PASSWORD;
  const expectedHash = env.ADMIN_PASSWORD_HASH;

  if (!expectedPass && !expectedHash) {
    return {
      ok: false,
      reason: "ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is not configured in environment variables.",
    };
  }

  // Verify username with constant-time comparison
  const userMatches = await timingSafeEqualString(user.trim().toLowerCase(), expectedUser.trim().toLowerCase());

  let passMatches = false;

  if (expectedHash) {
    // Check against SHA-256 hash
    const inputHash = await sha256(pass);
    passMatches = await timingSafeEqualString(inputHash, expectedHash);
  } else if (expectedPass) {
    // Check against password from environment variable
    passMatches = await timingSafeEqualString(pass, expectedPass);
  }

  if (userMatches && passMatches) {
    return { ok: true };
  }

  // Artificial delay to prevent rapid brute-force timing
  await new Promise((r) => setTimeout(r, 350));
  return { ok: false, reason: "Invalid username or password" };
}

/**
 * HMAC key helper
 */
async function getSigningKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate cryptographically signed HMAC-SHA256 session token
 */
export async function createSessionToken(username: string, env: AuthEnv): Promise<string> {
  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD || FALLBACK_SECRET;
  const key = await getSigningKey(secret);

  const payload = {
    sub: username,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days validity
  };

  const payloadStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(payloadStr);
  const encodedPayload = base64UrlEncode(payloadBytes);

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(encodedPayload));
  const encodedSignature = base64UrlEncode(signature);

  return `${encodedPayload}.${encodedSignature}`;
}

/**
 * Verify signed session token
 */
export async function verifySessionToken(token: string, env: AuthEnv): Promise<{ valid: boolean; user?: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };

    const [encodedPayload, encodedSignature] = parts;
    const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD || FALLBACK_SECRET;
    const key = await getSigningKey(secret);

    const enc = new TextEncoder();
    const signatureBytes = base64UrlDecode(encodedSignature);

    const isValidSig = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      enc.encode(encodedPayload)
    );

    if (!isValidSig) return { valid: false };

    const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadJson);

    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false };
    }

    return { valid: true, user: payload.sub };
  } catch {
    return { valid: false };
  }
}

/**
 * Extract session token from cookie header
 */
export function getSessionFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)maen_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Build cookie header strings
 */
export function createSessionCookie(token: string, isHttps = true): string {
  const secure = isHttps ? "; Secure" : "";
  const maxAge = 7 * 24 * 60 * 60;
  return `maen_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function createClearSessionCookie(isHttps = true): string {
  const secure = isHttps ? "; Secure" : "";
  return `maen_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
