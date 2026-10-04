import { describe, it, expect } from 'vitest';
import { validateCreateUserInput } from './validate.js';

const valid = () => ({
  email: 'staff@abujaprecast.com',
  password: 'longenoughpw',
  full_name: 'Jane Doe',
  role: 'staff',
});

describe('validateCreateUserInput', () => {
  it('accepts a good payload', () => {
    const result = validateCreateUserInput(valid());
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({
      email: 'staff@abujaprecast.com',
      password: 'longenoughpw',
      full_name: 'Jane Doe',
      role: 'staff',
      staff_id: null,
    });
  });

  it('accepts a valid staff_id uuid', () => {
    const result = validateCreateUserInput({ ...valid(), staff_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.valid).toBe(true);
    expect(result.value.staff_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects a bad email', () => {
    const result = validateCreateUserInput({ ...valid(), email: 'not-an-email' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/valid email/i);
  });

  it('rejects a missing email', () => {
    const result = validateCreateUserInput({ ...valid(), email: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/valid email/i);
  });

  it('rejects a short password', () => {
    const result = validateCreateUserInput({ ...valid(), password: 'short1' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/at least 8 characters/i);
  });

  it('rejects a missing full_name', () => {
    const result = validateCreateUserInput({ ...valid(), full_name: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/full name/i);
  });

  it('rejects a missing role', () => {
    const result = validateCreateUserInput({ ...valid(), role: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/role is required/i);
  });

  it('rejects a malformed staff_id', () => {
    const result = validateCreateUserInput({ ...valid(), staff_id: 'not-a-uuid' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/staff_id must be a valid uuid/i);
  });

  it('reports every failing field at once', () => {
    const result = validateCreateUserInput({ email: '', password: '', full_name: '', role: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(4);
  });
});
