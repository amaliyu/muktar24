import React, { useState } from 'react'
import { authService } from '../services/authService'
import { supabase } from '../lib/supabase'

const theme = {
  bg: '#0f1117',
  surface: '#1a1d27',
  card: '#21263a',
  border: '#2e3452',
  accent: '#f5a623',
  green: '#2dd4a0',
  red: '#f06b6b',
  blue: '#5b8dee',
  text: '#e8eaf0',
  textMuted: '#7c839e',
}

export default function LoginScreen({ onLogin }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!resetEmail.trim()) { setResetMsg('Enter your email address.'); return }
    setResetLoading(true); setResetMsg('')
    try {
      await authService.resetPassword(resetEmail.trim())
      setResetMsg('Password reset email sent. Check your inbox.')
    } catch (err) {
      setResetMsg(err.message || 'Could not send reset email.')
    } finally { setResetLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await authService.signIn(email.trim(), password)
      const userId = data.user.id

      // Load profile from user_profiles
      let { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileErr || !profile) {
        // Profile doesn't exist — create one
        const { data: newProfile, error: upsertErr } = await supabase
          .from('user_profiles')
          .upsert({
            id:        userId,
            email:     data.user.email,
            full_name: data.user.email.split('@')[0],
            role:      'viewer',
            is_active: true,
          })
          .select()
          .single()
        if (upsertErr) throw upsertErr
        profile = newProfile
      }

      onLogin(profile)
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (hasError) => ({
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    background: theme.surface,
    border: `1px solid ${hasError ? theme.red : theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: "inherit",
  })

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: '7px',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: '24px',
      }}
    >
      {/* ── Top brand ─────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <img
          src="/logo.png"
          alt="Abuja Precast Concrete"
          onError={(e) => { e.target.style.display = 'none' }}
          style={{
            height: '72px',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto 16px',
          }}
        />
        <div
          style={{
            fontSize: '22px',
            fontWeight: '800',
            color: theme.accent,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            lineHeight: 1.2,
          }}
        >
          ABUJA PRECAST CONCRETE
        </div>
        <div
          style={{
            fontSize: '13px',
            color: theme.textMuted,
            marginTop: '6px',
            letterSpacing: '0.04em',
          }}
        >
          Operations Management System
        </div>
      </div>

      {/* ── Login card ────────────────────────────────────────── */}
      <div
        style={{
          background: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: '14px',
          padding: '36px 40px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            fontSize: '18px',
            fontWeight: '700',
            color: theme.text,
            marginBottom: '6px',
          }}
        >
          Sign In
        </div>
        <div
          style={{
            fontSize: '13px',
            color: theme.textMuted,
            marginBottom: '28px',
          }}
        >
          Enter your credentials to access the system.
        </div>

        <form onSubmit={handleSubmit} autoComplete="on">
          {/* Email */}
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="login-email" style={labelStyle}>
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@abujaprecast.com"
              disabled={loading}
              style={inputStyle(!!error)}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '8px' }}>
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              style={inputStyle(!!error)}
            />
          </div>
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => { setShowReset(true); setResetEmail(email); setResetMsg('') }}
              style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '12px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              Forgot Password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: theme.red + '18',
                border: `1px solid ${theme.red}55`,
                color: theme.red,
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                marginBottom: '18px',
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: loading ? theme.accent + '88' : theme.accent,
              border: 'none',
              borderRadius: '9px',
              color: '#1a0e00',
              fontSize: '14px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.03em',
              transition: 'background 0.2s',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* ── Forgot Password Modal ────────────────────────────── */}
      {showReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '14px', padding: '32px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '6px' }}>Reset Password</div>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '24px' }}>Enter your email and we'll send a reset link.</div>
            <form onSubmit={handleForgotPassword}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="you@abujaprecast.com"
                  style={inputStyle(false)}
                  autoFocus
                />
              </div>
              {resetMsg && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', background: resetMsg.includes('sent') ? theme.green + '18' : theme.red + '18', border: `1px solid ${resetMsg.includes('sent') ? theme.green : theme.red}44`, color: resetMsg.includes('sent') ? theme.green : theme.red }}>
                  {resetMsg}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={resetLoading} style={{ flex: 1, padding: '11px', background: theme.accent, border: 'none', borderRadius: '8px', color: '#1a0e00', fontWeight: '700', fontSize: '13px', cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {resetLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <button type="button" onClick={() => setShowReset(false)} style={{ flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textMuted, fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <div
        style={{
          marginTop: '36px',
          textAlign: 'center',
          color: theme.textMuted,
          fontSize: '12px',
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: '600', color: theme.text + 'aa', marginBottom: '2px' }}>
          Abuja Precast Concrete Limited
        </div>
        <div>1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja, Nigeria</div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: theme.textMuted + '88' }}>
          &copy; {new Date().getFullYear()} All rights reserved
        </div>
      </div>
    </div>
  )
}
