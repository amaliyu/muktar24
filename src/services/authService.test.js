import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './authService';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

describe('authService.createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls functions.invoke with the right payload and returns the profile', async () => {
    const profile = { id: 'u1', email: 'a@b.com', full_name: 'A B', role: 'staff', is_active: true };
    supabase.functions.invoke.mockResolvedValue({ data: profile, error: null });

    const result = await authService.createUser('a@b.com', 'longenoughpw', 'A B', 'staff', 's1');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-create-user', {
      body: { email: 'a@b.com', password: 'longenoughpw', full_name: 'A B', role: 'staff', staff_id: 's1' },
    });
    expect(result).toBe(profile);
  });

  it('defaults staff_id to null when omitted', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });
    await authService.createUser('a@b.com', 'longenoughpw', 'A B', 'staff');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-create-user', {
      body: { email: 'a@b.com', password: 'longenoughpw', full_name: 'A B', role: 'staff', staff_id: null },
    });
  });

  it('throws the server message from error.context on a FunctionsHttpError', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'Only the active MD can create users.' }) },
      },
    });

    await expect(authService.createUser('a@b.com', 'longenoughpw', 'A B', 'staff'))
      .rejects.toThrow('Only the active MD can create users.');
  });

  it('falls back to error.message when context has no readable body', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(authService.createUser('a@b.com', 'longenoughpw', 'A B', 'staff'))
      .rejects.toThrow('Network error');
  });
});
