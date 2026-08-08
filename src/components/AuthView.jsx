import React, { useState } from 'react';
import { Sparkles, ArrowRight, Lock, Mail, User, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';

export default function AuthView({ onLoginSuccess, onStartOnboarding }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Send registration request to backend API
        const result = await authService.register({ name, email, password });
        if (result.success) {
          // Proceed to financial onboarding questionnaire with user details
          onStartOnboarding({ name, email, password });
        } else {
          setErrorMsg(result.error || 'Registration failed. Please try a different email.');
        }
      } else {
        // Send login credentials to backend API
        const result = await authService.login({ email, password });
        if (result.success) {
          onLoginSuccess(result.user);
        } else {
          setErrorMsg(result.error || 'Invalid email or password.');
        }
      }
    } catch (err) {
      setErrorMsg('Network error. Unable to connect to authentication server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f4f6f8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '36px',
        backgroundColor: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
        borderRadius: '16px'
      }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#005f41',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            margin: '0 auto 12px auto'
          }}>
            <Sparkles size={24} />
          </div>

          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}>
            {isSignUp ? 'Create Account on FinHack' : 'Log In to FinMate AI'}
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', fontFamily: 'var(--font-sans)' }}>
            {isSignUp ? 'Join John AI Coach & specialist financial agents' : 'Welcome back! Enter your credentials to access your financial coach.'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            color: '#dc2626',
            fontSize: '13px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSignUp && (
            <div>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
              Email Address
            </label>
            <input
              type="email"
              className="input"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
              Password
            </label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-emerald" 
            style={{ padding: '12px', marginTop: '8px', justifyContent: 'center' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={18} className="spin" />
                <span>Processing...</span>
              </div>
            ) : (
              <span>{isSignUp ? 'Continue to Financial Details →' : 'Log In to Command Center'}</span>
            )}
          </button>
        </form>

        {/* Toggle Login / SignUp */}
        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>
          {isSignUp ? (
            <span>Already have an account? <button onClick={() => { setIsSignUp(false); setErrorMsg(''); }} style={{ color: '#059669', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Log In</button></span>
          ) : (
            <span>New to FinHack? <button onClick={() => { setIsSignUp(true); setErrorMsg(''); }} style={{ color: '#059669', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Create an Account</button></span>
          )}
        </div>

      </div>
    </div>
  );
}
