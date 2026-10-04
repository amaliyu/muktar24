import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginScreen from './LoginScreen';
import { authService } from '../services/authService';
import { supabase } from '../lib/supabase';

vi.mock('../services/authService', () => ({
  authService: {
    signIn: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => {
  const single = vi.fn();
  const upsert = vi.fn(() => ({ select: () => ({ single }) }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert, eq, single }));
  return {
    supabase: {
      from,
      auth: { signOut: vi.fn() },
      __mocks: { single, upsert, eq, select, from },
    },
  };
});

async function fillAndSubmit(user) {
  await user.type(screen.getByLabelText(/email address/i), 'staff@abujaprecast.com');
  await user.type(screen.getByLabelText(/password/i), 'password123');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.__mocks.single.mockReset();
    supabase.__mocks.upsert.mockClear();
  });

  it('signs out and blocks login for an inactive profile, without creating one', async () => {
    const user = userEvent.setup();
    authService.signIn.mockResolvedValue({ user: { id: 'u1', email: 'staff@abujaprecast.com' } });
    supabase.__mocks.single.mockResolvedValue({
      data: { id: 'u1', role: 'staff', is_active: false },
      error: null,
    });

    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/this account has been deactivated/i)).toBeInTheDocument();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
    expect(supabase.__mocks.upsert).not.toHaveBeenCalled();
  });

  it('signs out and blocks login when no profile row exists, without creating one', async () => {
    const user = userEvent.setup();
    authService.signIn.mockResolvedValue({ user: { id: 'u2', email: 'ghost@abujaprecast.com' } });
    supabase.__mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/no profile is set up for this account/i)).toBeInTheDocument();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
    expect(supabase.__mocks.upsert).not.toHaveBeenCalled();
  });

  it('logs in an active profile normally', async () => {
    const user = userEvent.setup();
    const profile = { id: 'u3', role: 'staff', is_active: true };
    authService.signIn.mockResolvedValue({ user: { id: 'u3', email: 'staff@abujaprecast.com' } });
    supabase.__mocks.single.mockResolvedValue({ data: profile, error: null });

    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    await fillAndSubmit(user);

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledWith(profile));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('shows a transient-error message without signing out, on a non-PGRST116 error', async () => {
    const user = userEvent.setup();
    authService.signIn.mockResolvedValue({ user: { id: 'u4', email: 'staff@abujaprecast.com' } });
    supabase.__mocks.single.mockResolvedValue({
      data: null,
      error: { code: '500', message: 'network blip' },
    });

    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/network blip/i)).toBeInTheDocument();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });
});
