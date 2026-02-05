import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // Toggle state

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
    <div style={{ maxWidth: '400px', margin: 'auto', padding: '20px' }}>
      <h2>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
      <p>{isSignUp ? 'Sign up to manage your datasheets' : 'Sign in to access your dashboard'}</p>
      
      <form onSubmit={handleAuth}>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '10px' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px' }}
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          style={{ width: '100%', padding: '10px', backgroundColor: '#646cff', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
        </button>
      </form>
      
      <div style={{ marginTop: '10px', textAlign: 'center' }}>
        <button 
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setMessage('');
          }} 
          disabled={loading}
          style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
        </button>
      </div>

      {message && <p style={{ color: 'red', marginTop: '15px' }}>{message}</p>}
    </div>
  );
}