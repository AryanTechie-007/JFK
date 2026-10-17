import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JohnWorkspace from './workspaces/john/JohnWorkspace';
import SentinelWorkspace from './workspaces/sentinel/SentinelWorkspace';
import IrisWorkspace from './workspaces/iris/IrisWorkspace';
import AtlasWorkspace from './workspaces/atlas/AtlasWorkspace';
import NovaWorkspace from './workspaces/nova/NovaWorkspace';
import SettingsPage from './workspaces/settings/SettingsPage';
import AuthView from './components/AuthView';
import OnboardingView from './components/OnboardingView';
import { authService } from './services/authService';
import { api } from './services/api/v1';
import { Target, Sparkles } from 'lucide-react';

const EMPTY_USER_PROFILE = {
  name: '',
  email: '',
  occupation: '',
  currency: '₹',
  monthlyIncome: 0,
  fixedExpenses: 0,
  variableExpenses: 0,
  totalSpentThisMonth: 0,
  currentSavings: 0,
  savingsRate: 0,
  healthScore: null,
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("FinMate UI ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#f4f6f8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'var(--font-sans)'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#ffffff',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>
              FinMate Workspace Notice
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
              {this.state.error?.message || 'A display formatting error occurred.'}
            </p>
            <button 
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#005f41',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Reload Workspaces
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'onboarding' | 'authenticated'
  const [onboardingInitialData, setOnboardingInitialData] = useState(null);

  // Five canonical workspaces: 'john' | 'sentinel' | 'nova' | 'atlas' | 'iris' | 'settings'
  const [activeTab, setActiveTab] = useState('john');
  const [explainAlertId, setExplainAlertId] = useState(null);
  const [userProfile, setUserProfile] = useState(EMPTY_USER_PROFILE);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  // Theme mode: 'system' | 'light' | 'dark'
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('finmate_theme_mode') || 'system';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDarkMode = themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark);

  useEffect(() => {
    localStorage.setItem('finmate_theme_mode', themeMode);
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [themeMode, isDarkMode]);

  const showNotification = (title, detail) => {
    setToastMessage({ title, detail });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check authentication session on application startup
  useEffect(() => {
    async function checkAuthSession() {
      try {
        const authRes = await authService.getCurrentUser();
        if (authRes?.success && authRes?.user) {
          const sessionUser = authRes.user;

          // Fetch user profile from v1 API (fail-closed, no mock fallback)
          try {
            const prof = await api.getProfile();
            if (prof?.profile) {
              setUserProfile(prof.profile);
            } else {
              setUserProfile({ 
                ...EMPTY_USER_PROFILE,
                name: sessionUser.name || 'User',
                email: sessionUser.email,
                monthlyIncome: sessionUser.monthly_income || 0,
                fixedExpenses: sessionUser.fixed_housing_expense || 0,
              });
            }
          } catch {
            setUserProfile({ 
              ...EMPTY_USER_PROFILE,
              name: sessionUser.name || 'User',
              email: sessionUser.email,
            });
          }

          setIsAuthenticated(true);
          setAuthMode('authenticated');
        } else {
          setIsAuthenticated(false);
          setAuthMode('login');
        }
      } catch {
        setIsAuthenticated(false);
        setAuthMode('login');
      } finally {
        setIsLoadingAuth(false);
      }
    }
    checkAuthSession();

    if (typeof window !== 'undefined' && window.finmateDesktop?.onNavigateTab) {
      window.finmateDesktop.onNavigateTab((tabName) => {
        setActiveTab(tabName);
      });
    }

    // 401 Unauthorized listener
    const onUnauthorized = () => {
      setIsAuthenticated(false);
      setAuthMode('login');
    };
    window.addEventListener('finmate:unauthorized', onUnauthorized);
    return () => window.removeEventListener('finmate:unauthorized', onUnauthorized);
  }, []);

  const handleStartOnboarding = (initialData) => {
    setOnboardingInitialData(initialData);
    setAuthMode('onboarding');
  };

  const handleCompleteOnboarding = (newProfile, newGoal) => {
    setUserProfile(newProfile);
    if (newGoal) {
      setGoals(prev => [newGoal, ...(prev || [])]);
    }
    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Account Setup Complete", `Welcome to FinMate AI, ${newProfile.name}.`);
  };

  const handleLoginSuccess = async (userObj) => {
    setUserProfile({ 
      ...EMPTY_USER_PROFILE,
      name: userObj.name || 'User', 
      email: userObj.email,
      monthlyIncome: userObj.monthly_income || 0,
      fixedExpenses: userObj.fixed_housing_expense || 0,
    });

    try {
      const prof = await api.getProfile();
      if (prof?.profile) {
        setUserProfile(prof.profile);
      }
    } catch {
      // Empty profile state, no mocks
    }

    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Welcome Back", `Logged in successfully.`);
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setAuthMode('login');
    setUserProfile(EMPTY_USER_PROFILE);
    setBudgets([]);
    setGoals([]);
    setTransactions([]);
    showNotification("Logged Out", "You have been logged out securely.");
  };

  const handleAddGoalFromJohn = async (newGoal) => {
    setGoals(prev => [newGoal, ...(prev || [])]);
    showNotification('New Goal Proposed', `Goal "${newGoal.name}" submitted to Atlas Strategist.`);
  };

  if (isLoadingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f4f6f8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        color: '#0f172a',
        fontFamily: 'var(--font-sans)'
      }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          backgroundColor: '#005f41',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff'
        }}>
          <Sparkles size={26} className="spin" />
        </div>
        <div style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a', fontFamily: 'var(--font-serif)' }}>
          FinMate AI
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Connecting to backend API & verifying session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authMode === 'onboarding') {
      return (
        <OnboardingView 
          initialData={onboardingInitialData}
          onCompleteOnboarding={handleCompleteOnboarding}
          isDarkMode={isDarkMode}
        />
      );
    }
    return (
      <AuthView 
        onLoginSuccess={handleLoginSuccess}
        onStartOnboarding={handleStartOnboarding}
        isDarkMode={isDarkMode}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'john':
        return (
          <JohnWorkspace 
            userProfile={userProfile}
            onNavigateToWorkspace={(tab) => setActiveTab(tab)}
            explainAlertId={explainAlertId}
          />
        );
      case 'sentinel':
      case 'home':
      case 'subscriptions':
      case 'analyser':
      case 'health':
        return <SentinelWorkspace userProfile={userProfile} onNavigateToWorkspace={(tab) => setActiveTab(tab)} />;
      case 'nova':
        return <NovaWorkspace budgets={budgets} setBudgets={setBudgets} userProfile={userProfile} setUserProfile={setUserProfile} />;
      case 'atlas':
        return <AtlasWorkspace goals={goals} setGoals={setGoals} userProfile={userProfile} />;
      case 'iris':
        return <IrisWorkspace userProfile={userProfile} />;
      case 'settings':
        return (
          <SettingsPage 
            userProfile={userProfile}
            setUserProfile={setUserProfile}
            showNotification={showNotification}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
          />
        );
      default:
        return (
          <JohnWorkspace 
            userProfile={userProfile}
            onNavigateToWorkspace={(tab) => setActiveTab(tab)}
            explainAlertId={explainAlertId}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userProfile={userProfile} onLogout={handleLogout} />

        <main className="main-content">
          <Header 
            activeTab={activeTab} 
            userProfile={userProfile}
            onSync={() => showNotification("Refreshed", "Workspace views refreshed.")} 
            onNavigateToWorkspace={(tab) => setActiveTab(tab)}
            onExplainAlert={(alertId) => {
              setExplainAlertId(alertId);
              setActiveTab('john');
            }}
          />

          <div className="content-body">
            {renderActiveView()}
          </div>
        </main>

        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '14px 20px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--accent-emerald)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            zIndex: 999
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669'
            }}>
              <Target size={18} />
            </div>
            <div>
              <div style={{ fontWeight: '700', color: '#059669' }}>{toastMessage.title}</div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{toastMessage.detail}</div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
