import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, User, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import InteractiveSpotsBackground from './InteractiveSpotsBackground';

export default function AuthView({ onLoginSuccess, onStartOnboarding, isDarkMode = false }) {
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
    <InteractiveSpotsBackground isDarkMode={isDarkMode}>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div className="card" style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: isDarkMode 
            ? '0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 30px rgba(36, 210, 154, 0.1)' 
            : '0 20px 40px -10px rgba(28, 48, 36, 0.15)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              margin: '0 auto 12px auto'
            }}>
              <Lock size={22} />
            </div>

            <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', fontFamily: 'var(--font-sans)' }}>
              {isSignUp ? 'Set up your account to start personalized financial guidance.' : 'Sign in to access your financial command center.'}
            </p>
          </div>

          {/* Demo Account Helper */}
          {!isSignUp && (
            <div style={{
              marginBottom: '20px',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-card-subtle)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                <strong>Demo:</strong> demo@finmate.ai
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('demo@finmate.ai');
                  setPassword('demopass123');
                  setErrorMsg('');
                }}
                className="btn btn-secondary btn-sm"
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                Fill Demo
              </button>
            </div>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div style={{
              padding: '12px 14px',
              backgroundColor: isDarkMode ? '#2d1414' : '#fef2f2',
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
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
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
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
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
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
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
                  <Loader2 size={18} className="animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <span>{isSignUp ? 'Continue to Financial Setup' : 'Sign In'}</span>
              )}
            </button>
          </form>

          {/* Toggle Login / SignUp */}
          <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
            {isSignUp ? (
              <span>Already have an account? <button onClick={() => { setIsSignUp(false); setErrorMsg(''); }} style={{ color: 'var(--accent-emerald)', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Sign In</button></span>
            ) : (
              <span>New to FinMate AI? <button onClick={() => { setIsSignUp(true); setErrorMsg(''); }} style={{ color: 'var(--accent-emerald)', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Create an Account</button></span>
            )}
          </div>

        </div>
      </div>
    </InteractiveSpotsBackground>
  );
}
