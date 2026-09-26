// Mock payer with a persistent SQLite ledger.
//
// The whole point of this file: TrueForge's approval UI can only say
// {"status":"allow"} or {"status":"deny"} for a pending tool call. It does
// not bind that decision to the exact argument values. So the "second key" -
// approval bound to one exact payload - has to live here, in the endpoint
// the approved tool call actually hits.
//
// Design:
//   1. propose(payload)   -> server mints an operation_id and a payload_hash.
//                            The model never sees or chooses either.
//   2. approve(operation_id) -> human approval recorded against that id.
//   3. submit(operation_id, payload) -> re-hash the payload NOW. If it
//      doesn't match the hash recorded at propose-time, reject. If it
//      matches and this operation_id was already committed, return the
//      ORIGINAL receipt (idempotent retry). Otherwise commit atomically:
//      one transaction writes the operation status AND the ledger row.

import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';

export function canonicalHash(payload) {
  // Stable stringify: sort keys recursively so the hash doesn't depend on
  // insertion order or how the caller's JSON serializer walks the object.
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc, k) => {
        acc[k] = sortKeys(v[k]);
        return acc;
      }, {});
    }
    return v;
  };
  const canonical = JSON.stringify(sortKeys(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

export class Ledger {
  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        operation_id   TEXT PRIMARY KEY,
        claim_id       TEXT NOT NULL,
        payload_hash   TEXT NOT NULL,
        payload_json   TEXT NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('proposed','approved','denied','committed')),
        created_at     TEXT NOT NULL,
        approved_at    TEXT,
        committed_at   TEXT
      );

      CREATE TABLE IF NOT EXISTS ledger (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id   TEXT NOT NULL UNIQUE REFERENCES operations(operation_id),
        claim_id       TEXT NOT NULL,
        amount         REAL NOT NULL,
        receipt_id     TEXT NOT NULL UNIQUE,
        committed_at   TEXT NOT NULL
      );

      -- Immutability: application role can insert, never update or delete.
      -- (House standard B-9, scoped here to this demo's own connection.)
      CREATE TRIGGER IF NOT EXISTS ledger_no_update
        BEFORE UPDATE ON ledger
        BEGIN SELECT RAISE(ABORT, 'ledger rows are immutable'); END;

      CREATE TRIGGER IF NOT EXISTS ledger_no_delete
        BEFORE DELETE ON ledger
        BEGIN SELECT RAISE(ABORT, 'ledger rows are immutable'); END;
    `);
  }

  // Step 1: agent proposes a correction. Server mints operation_id + hash.
  // The model receives both back but cannot choose either.
  propose({ claim_id, amount, ...rest }) {
    const payload = { claim_id, amount, ...rest };
    const operation_id = randomUUID();
    const payload_hash = canonicalHash(payload);
    const created_at = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO operations (operation_id, claim_id, payload_hash, payload_json, status, created_at)
      VALUES (?, ?, ?, ?, 'proposed', ?)
    `).run(operation_id, claim_id, payload_hash, JSON.stringify(payload), created_at);

    return { operation_id, payload_hash, payload };
  }

  // Step 2: human approval, bound to operation_id only (this mirrors what
  // TrueForge itself can express: allow/deny on a pending call, nothing more).
  approve(operation_id) {
    const op = this._getOperation(operation_id);
    if (!op) return { ok: false, reason: 'unknown_operation' };
    if (op.status !== 'proposed') return { ok: false, reason: `already_${op.status}` };

    this.db.prepare(`
      UPDATE operations SET status = 'approved', approved_at = ? WHERE operation_id = ?
    `).run(new Date().toISOString(), operation_id);

    return { ok: true, operation_id };
  }

  deny(operation_id, reason = 'denied by reviewer') {
    const op = this._getOperation(operation_id);
    if (!op) return { ok: false, reason: 'unknown_operation' };
    if (op.status !== 'proposed') return { ok: false, reason: `already_${op.status}` };

    this.db.prepare(`
      UPDATE operations SET status = 'denied' WHERE operation_id = ?
    `).run(operation_id);

    return { ok: true, operation_id, denied: true, reason };
  }

  // Step 3: the actual write. This is where the second key is enforced.
  //
  // - Payload is re-hashed NOW and compared to the hash recorded at propose
  //   time. A retry that regenerates different arguments (the LLM-retry
  //   failure mode) fails here even though operation_id looks the same.
  // - If this operation_id was already committed with the SAME hash, this
  //   is a lost-ack retry: return the original receipt, do not write a
  //   second ledger row.
  // - Commit is one transaction: operation status -> committed AND the
  //   ledger insert happen together or not at all.
  submit(operation_id, payload) {
    const op = this._getOperation(operation_id);
    if (!op) return { ok: false, reason: 'unknown_operation' };

    const submittedHash = canonicalHash(payload);

    if (op.status === 'committed') {
      // Idempotent retry path: only safe if the payload still matches.
      if (submittedHash !== op.payload_hash) {
        return { ok: false, reason: 'payload_mismatch_on_committed_operation' };
      }
      const existing = this.db.prepare(`SELECT * FROM ledger WHERE operation_id = ?`).get(operation_id);
      return { ok: true, replay: true, receipt: existing };
    }

    if (op.status !== 'approved') {
      return { ok: false, reason: `cannot_submit_from_status_${op.status}` };
    }

    if (submittedHash !== op.payload_hash) {
      // The key fits one payload. This is the amount-changed-after-approval
      // rejection: the approval was for a different hash than what's being
      // submitted now, so it does not authorize this write.
      return { ok: false, reason: 'payload_hash_mismatch', expected: op.payload_hash, got: submittedHash };
    }

    const receipt_id = `RCPT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const committed_at = new Date().toISOString();

    const commit = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE operations SET status = 'committed', committed_at = ? WHERE operation_id = ?
      `).run(committed_at, operation_id);

      this.db.prepare(`
        INSERT INTO ledger (operation_id, claim_id, amount, receipt_id, committed_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(operation_id, payload.claim_id, payload.amount, receipt_id, committed_at);
    });
    commit();

    const receipt = this.db.prepare(`SELECT * FROM ledger WHERE operation_id = ?`).get(operation_id);
    return { ok: true, replay: false, receipt };
  }

  // Simulates the lost-ack fault: the write above committed and returned a
  // receipt, but imagine that response never reached the agent (network
  // drop, timeout). The agent only knows to retry submit() with the same
  // operation_id and payload. submit() above already handles that as a
  // replay - this helper just documents the scenario for the test file.

  rowCountForOperation(operation_id) {
    return this.db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE operation_id = ?`).get(operation_id).n;
  }

  _getOperation(operation_id) {
    return this.db.prepare(`SELECT * FROM operations WHERE operation_id = ?`).get(operation_id);
  }

  close() {
    this.db.close();
  }
}
