import 'server-only';

// Candidate request boundary. It is not registered as an HTTP endpoint.
// The future handler must still apply reviewed origin, abuse and response rules.
const MAX_BYTES = 12_288;
const READ_DEADLINE_MS = 3_000;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const compactJwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type MobileStartBody = { verifierHash: string };
export type MobileExchangeBody = { id: string; verifier: string; token: string };

function canonical32(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 43 || !secretPattern.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function jsonContentType(value: string | null): boolean {
  if (!value) return false;
  const parts = value.split(';').map((part) => part.trim().toLowerCase());
  return (
    parts[0] === 'application/json' &&
    (parts.length === 1 || (parts.length === 2 && /^charset\s*=\s*utf-8$/.test(parts[1] ?? '')))
  );
}

async function readBytes(request: Request): Promise<Uint8Array | null> {
  if (!request.body || request.bodyUsed || request.body.locked) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let chunkCount = 0;
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('body read timed out')), READ_DEADLINE_MS);
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) {
        complete = true;
        break;
      }
      if (!(part.value instanceof Uint8Array) || ++chunkCount > 1024) return null;
      size += part.value.byteLength;
      if (size > MAX_BYTES) return null;
      chunks.push(part.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (complete) reader.releaseLock();
    else void reader.cancel().catch(() => {});
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse only a bounded UTF-8 JSON body. All failures return null; do not log
 * the request body. Read timeout, actual byte count and stream errors are
 * checked independently of the untrusted Content-Length header.
 */
export async function readMobileAuthBody(
  request: Request,
  kind: 'start',
): Promise<MobileStartBody | null>;
export async function readMobileAuthBody(
  request: Request,
  kind: 'exchange',
): Promise<MobileExchangeBody | null>;
export async function readMobileAuthBody(
  request: Request,
  kind: 'start' | 'exchange',
): Promise<MobileStartBody | MobileExchangeBody | null> {
  const length = request.headers.get('content-length');
  const encoding = request.headers.get('content-encoding');
  if (
    request.method !== 'POST' ||
    !jsonContentType(request.headers.get('content-type')) ||
    (encoding !== null && encoding.toLowerCase().trim() !== 'identity') ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
  ) {
    return null;
  }
  const bytes = await readBytes(request);
  if (!bytes || bytes.length === 0) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!isPlainRecord(body)) return null;
  const keys = Object.keys(body).sort();
  if (kind === 'start') {
    if (
      keys.length !== 1 ||
      keys[0] !== 'verifierHash' ||
      typeof body.verifierHash !== 'string' ||
      body.verifierHash.length !== 64 ||
      !hashPattern.test(body.verifierHash)
    ) {
      return null;
    }
    return { verifierHash: body.verifierHash };
  }
  if (
    keys.length !== 3 ||
    keys.join(',') !== 'id,token,verifier' ||
    !canonical32(body.id) ||
    !canonical32(body.verifier) ||
    typeof body.token !== 'string' ||
    body.token.length > 8192 ||
    /[^A-Za-z0-9_.-]/.test(body.token) ||
    !compactJwtPattern.test(body.token)
  ) {
    return null;
  }
  return { id: body.id, verifier: body.verifier, token: body.token };
}
