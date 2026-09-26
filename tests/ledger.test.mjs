// Four deterministic scenarios. These are the evidence, not the demo
// narration - a skeptical judge should be able to run `npm test` and see
// exactly what we claim on stage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../server/ledger.mjs';

function freshLedger() {
  return new Ledger(':memory:');
}

test('approve then submit: exactly one ledger row, receipt returned', () => {
  const ledger = freshLedger();
  const { operation_id, payload } = ledger.propose({ claim_id: 'CLM-1001', amount: 312.5 });

  const approval = ledger.approve(operation_id);
  assert.equal(approval.ok, true);

  const result = ledger.submit(operation_id, payload);
  assert.equal(result.ok, true);
  assert.equal(result.replay, false);
  assert.ok(result.receipt.receipt_id.startsWith('RCPT-'));

  assert.equal(ledger.rowCountForOperation(operation_id), 1);
  ledger.close();
});

test('deny: submit is rejected, no ledger row is ever written', () => {
  const ledger = freshLedger();
  const { operation_id, payload } = ledger.propose({ claim_id: 'CLM-1002', amount: 480 });

  const denial = ledger.deny(operation_id, 'amount looks wrong');
  assert.equal(denial.ok, true);
  assert.equal(denial.denied, true);

  const result = ledger.submit(operation_id, payload);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cannot_submit_from_status_denied');

  assert.equal(ledger.rowCountForOperation(operation_id), 0);
  ledger.close();
});

test('lost-ack retry: same operation_id + same payload commits once, retry replays the original receipt', () => {
  const ledger = freshLedger();
  const { operation_id, payload } = ledger.propose({ claim_id: 'CLM-1003', amount: 900 });
  ledger.approve(operation_id);

  // First submit: the network "drops" the response after this commits.
  const first = ledger.submit(operation_id, payload);
  assert.equal(first.ok, true);
  assert.equal(first.replay, false);

  // Agent never saw the ack, retries with the identical payload.
  const retry = ledger.submit(operation_id, payload);
  assert.equal(retry.ok, true);
  assert.equal(retry.replay, true);
  assert.equal(retry.receipt.receipt_id, first.receipt.receipt_id);

  // The database fact: ONE row, not two.
  assert.equal(ledger.rowCountForOperation(operation_id), 1);
  ledger.close();
});

test('changed amount after approval: rejected, because the key fits one payload', () => {
  const ledger = freshLedger();
  const { operation_id, payload } = ledger.propose({ claim_id: 'CLM-1004', amount: 250 });
  ledger.approve(operation_id);

  // The agent (or a retry that regenerated its own arguments) submits a
  // DIFFERENT amount under the same operation_id. This is the failure mode
  // an idempotency key alone does not catch: an LLM retry does not
  // naturally carry stable arguments.
  const tampered = { ...payload, amount: 999 };
  const result = ledger.submit(operation_id, tampered);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'payload_hash_mismatch');

  assert.equal(ledger.rowCountForOperation(operation_id), 0);
  ledger.close();
});
