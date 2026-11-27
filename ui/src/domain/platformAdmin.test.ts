import { describe, expect, it } from 'bun:test';

import { platformAdminRefusal } from './platformAdmin';

const refusal =
  'forbidden: this changes what every organization on this installation runs, so where there is more than one organization it is for platform administrators only; whoever operates the installation makes you one by adding your account id, 01a215eb-cadd-71fa-943f-3465a6dd1bee, to METIS_PLATFORM_ADMINS';

describe('the platform administrators’ refusal', () => {
  it('is recognised, with the account id it names', () => {
    expect(platformAdminRefusal(refusal)).toEqual({ accountId: '01a215eb-cadd-71fa-943f-3465a6dd1bee' });
  });

  it('is recognised without an id', () => {
    expect(platformAdminRefusal('forbidden: add yourself to METIS_PLATFORM_ADMINS')).toEqual({ accountId: '' });
  });

  it('is not any other error', () => {
    expect(platformAdminRefusal('forbidden: you are not an administrator')).toBeNull();
    expect(platformAdminRefusal('')).toBeNull();
    expect(platformAdminRefusal(undefined)).toBeNull();
  });
});
