import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    let error;
    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      error = signUpError;
      if (!error) setMessage('Success! Check your email for the confirmation link.');
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    }

    if (error) setMessage(error.message);
    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-app)',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-panel)',
        padding: '2.5rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        width: '100%',
        maxWidth: '420px',
        border: '1px solid var(--border-color)',
        textAlign: 'center'
      }}>
        {/* Logo or Technical Header */}
        <h1 style={{ 
          color: 'var(--primary)', 
          marginTop: 0, 
          marginBottom: '0.5rem', 
          fontFamily: 'var(--font-mono)',
          fontSize: '1.75rem',
          letterSpacing: '-0.05em'
        }}>
          DATASHEET_GURU
        </h1>
        
        <h2 style={{ 
          fontSize: '1rem', 
          color: 'var(--text-secondary)', 
          fontWeight: 400, 
          marginBottom: '2rem',
          marginTop: 0
        }}>
          {isSignUp ? 'Create New Account' : 'Welcome Back'}
        </h2>
        
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-code)', fontFamily: 'var(--font-mono)' }}>
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              placeholder="engineer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box' // Fixes padding overflow
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-code)', fontFamily: 'var(--font-mono)' }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  paddingRight: '3rem', // Space for the toggle button
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '5px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '5px',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  fontWeight: 'bold',
                  boxShadow: 'none' // Remove default button shadow
                }}
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{
              marginTop: '1rem',
              width: '100%',
              padding: '1rem',
              backgroundColor: 'var(--primary)',
              color: 'var(--bg-input)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'PROCESSING...' : (isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN')}
          </button>
        </form>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage('');
            }} 
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'underline',
              boxShadow: 'none'
            }}
          >
            {isSignUp ? '> Already have an account? Sign In' : '> Need an account? Sign Up'}
          </button>
        </div>

        {message && (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid var(--accent-error)', 
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-error)',
            fontSize: '0.9rem',
            fontFamily: 'var(--font-mono)'
          }}>
            ERROR: {message}
          </div>
        )}
      </div>
    </div>
  );
}