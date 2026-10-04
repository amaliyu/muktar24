import { describe, it, expect } from 'vitest';
import { checkProfileAccess } from './profileAccess';

describe('checkProfileAccess', () => {
  it('returns ok for an active profile', () => {
    expect(checkProfileAccess({ id: '1', role: 'staff', is_active: true })).toEqual({ ok: true });
  });

  it('returns ok when is_active is not explicitly false (e.g. undefined)', () => {
    expect(checkProfileAccess({ id: '1', role: 'staff' })).toEqual({ ok: true });
  });

  it('returns missing for null', () => {
    expect(checkProfileAccess(null)).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns missing for undefined', () => {
    expect(checkProfileAccess(undefined)).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns inactive when is_active is strictly false', () => {
    expect(checkProfileAccess({ id: '1', role: 'staff', is_active: false })).toEqual({ ok: false, reason: 'inactive' });
  });
});
