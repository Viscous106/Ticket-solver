// One synthetic claim. No real PHI, no real patient data - a fixture the
// agent reads via get_claim and proposes a correction against.

export const CLAIMS = {
  'CLM-75377': {
    claim_id: 'CLM-75377',
    status: 'denied',
    denial_code: 'A8',
    denial_reason: 'Ungroupable DRG - procedure code does not match billed service line',
    billed_amount: 75377,
    corrected_amount: 75377,
    patient_ref: 'SYNTHETIC-0001',
    notes: 'Demo fixture. Not real claim data.',
  },
};

export function getClaim(claim_id) {
  const claim = CLAIMS[claim_id];
  if (!claim) return { error: 'claim_not_found', claim_id };
  return claim;
}
