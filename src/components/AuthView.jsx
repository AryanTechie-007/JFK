import React, { useState } from 'react';
import { Sparkles, ArrowRight, Lock, Mail, User, ShieldCheck } from 'lucide-react';

export default function AuthView({ onLoginSuccess, onStartOnboarding }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSignUp) {
      // Proceed to financial onboarding questionnaire
      onStartOnboarding({ name: name || 'Aryan', email });
    } else {
      // Direct login
      onLoginSuccess({ name: name || 'Aryan', email: email || 'aryan@finhack.ai' });
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
                  placeholder="e.g. Aryan Techie"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
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
            />
          </div>

          <button type="submit" className="btn btn-emerald" style={{ padding: '12px', marginTop: '8px', justifyContent: 'center' }}>
            <span>{isSignUp ? 'Continue to Financial Details →' : 'Log In to Command Center'}</span>
          </button>
        </form>

        {/* Toggle Login / SignUp */}
        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>
          {isSignUp ? (
            <span>Already have an account? <button onClick={() => setIsSignUp(false)} style={{ color: '#059669', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Log In</button></span>
          ) : (
            <span>New to FinHack? <button onClick={() => setIsSignUp(true)} style={{ color: '#059669', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Create an Account</button></span>
          )}
        </div>

      </div>
    </div>
  );
}
