import { sql } from 'drizzle-orm';
import { mobileAuthAttempts as attempts } from './schema';

// Internal SQL building blocks only. They do NOT authenticate a user or issue
// a session. Never expose these queries directly as an endpoint.
const idPattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[0-9a-f]{64}$/;

function requireId(id: string) {
  if (id.length !== 43 || !idPattern.test(id)) throw new Error('Invalid attempt ID format');
}
function requireHash(hash: string) {
  if (hash.length !== 64 || !hashPattern.test(hash))
    throw new Error('Invalid challenge hash format');
}

/** Caller must generate unpredictable IDs and hash high-entropy values itself. */
export function insertMobileAttempt(id: string, nonceHash: string, verifierHash: string) {
  requireId(id);
  requireHash(nonceHash);
  requireHash(verifierHash);
  return sql`
    INSERT INTO ${attempts} (id, nonce_hash, verifier_hash, expires_at)
    VALUES (${id}, ${nonceHash}, ${verifierHash}, now() + interval '5 minutes')
  `;
}

/** Read only unexpired, unused challenges; results are sensitive operational data. */
export function readMobileAttempt(id: string) {
  requireId(id);
  return sql`
    SELECT nonce_hash, verifier_hash FROM ${attempts}
    WHERE id = ${id} AND consumed_at IS NULL AND expires_at > clock_timestamp()
  `;
}

/** Delete expired attempts only. No scheduler invokes this yet. */
export function deleteExpiredMobileAttempts() {
  return sql`DELETE FROM ${attempts} WHERE expires_at <= clock_timestamp() RETURNING id`;
}

/**
 * ONLY after verifying Google's signature and claims, derive nonceHash from the
 * verified token and verifierHash from the request. A returned row means this
 * statement consumed a matching unexpired attempt; it is NOT an auth result.
 * Session/account operations are not part of this statement or transaction.
 */
export function consumeMobileAttempt(id: string, nonceHash: string, verifierHash: string) {
  requireId(id);
  requireHash(nonceHash);
  requireHash(verifierHash);
  return sql`
    UPDATE ${attempts} SET consumed_at = clock_timestamp()
    WHERE id = ${id}
      AND nonce_hash = ${nonceHash} AND verifier_hash = ${verifierHash}
      AND consumed_at IS NULL AND expires_at > clock_timestamp()
    RETURNING id
  `;
}
