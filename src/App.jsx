import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JohnCoachDashboard from './agents/john/JohnCoachDashboard';
import SentinelPredictorView from './tools/sentinel/SentinelPredictorView';
import IrisAdvisorView from './agents/iris/IrisAdvisorView';
import AtlasStrategistView from './agents/atlas/AtlasStrategistView';
import NovaGuardianView from './agents/nova/NovaGuardianView';
import SpendingAnalyserView from './tools/tally/SpendingAnalyserView';
import FinancialHealthView from './components/FinancialHealthView';
import SettingsView from './components/SettingsView';
import AuthView from './components/AuthView';
import OnboardingView from './components/OnboardingView';
import HomeDashboardView from './components/HomeDashboardView';
import SubscriptionsView from './components/SubscriptionsView';
import StatementImportModal from './components/StatementImportModal';
import { authService } from './services/authService';
import { profileService } from './services/profileService';
import { goalService } from './services/goalService';
import { transactionService } from './services/transactionService';
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
  healthScore: 75,
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
            <div style={{ fontSize: '36px', marginBottom: '12px' }}></div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>
              FinMate Command Center
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
              {this.state.error?.message || 'A minor display formatting error occurred.'}
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
              Reload Command Center
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

  const [activeTab, setActiveTab] = useState('home');
  const [userProfile, setUserProfile] = useState(EMPTY_USER_PROFILE);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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

  const handleImportSuccess = (importedLines, count) => {
    if (importedLines && importedLines.length > 0) {
      setTransactions(prev => [...importedLines, ...(prev || [])]);
      transactionService.getBudgets().then(res => {
        if (res.success && Array.isArray(res.budgets)) {
          setBudgets(res.budgets);
        }
      });
    }

    showNotification(
      'Statement Ingested Successfully!',
      `Imported ${count} transactions into your live record. Budgets and analytics updated.`
    );
  };

  // Check authentication session on application startup
  useEffect(() => {
    async function checkAuthSession() {
      try {
        const authRes = await authService.getCurrentUser();
        if (authRes.success && authRes.user) {
          const sessionUser = authRes.user;

          // Fetch user profile from API
          const profRes = await profileService.getProfile();
          if (profRes.success && profRes.profile) {
            setUserProfile(profRes.profile);
          } else {
            setUserProfile({ 
              ...EMPTY_USER_PROFILE,
              name: sessionUser.name || 'User',
              email: sessionUser.email,
              monthlyIncome: sessionUser.monthly_income || 0,
              fixedExpenses: sessionUser.fixed_housing_expense || 0,
            });
          }

          // Fetch user goals from API
          const goalsRes = await goalService.getGoals();
          if (goalsRes.success && Array.isArray(goalsRes.goals)) {
            setGoals(goalsRes.goals);
          } else {
            setGoals([]);
          }

          // Fetch category budgets from API
          const budgetRes = await transactionService.getBudgets();
          if (budgetRes.success && Array.isArray(budgetRes.budgets)) {
            setBudgets(budgetRes.budgets);
          } else {
            setBudgets([]);
          }

          // Fetch user transactions from API
          const txRes = await transactionService.getTransactions();
          if (txRes.success && Array.isArray(txRes.transactions)) {
            setTransactions(txRes.transactions);
          } else {
            setTransactions([]);
          }

          setIsAuthenticated(true);
          setAuthMode('authenticated');
        } else {
          setIsAuthenticated(false);
          setAuthMode('login');
        }
      } catch (err) {
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
    transactionService.getBudgets().then(res => {
      if (res.success && Array.isArray(res.budgets)) setBudgets(res.budgets);
    });
    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Account Setup Complete!", `Welcome to FinMate AI, ${newProfile.name}. John AI Coach is synced to your financial details.`);
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
      const profRes = await profileService.getProfile();
      if (profRes.success && profRes.profile) {
        setUserProfile(profRes.profile);
      }

      const goalsRes = await goalService.getGoals();
      if (goalsRes.success && Array.isArray(goalsRes.goals)) {
        setGoals(goalsRes.goals);
      } else {
        setGoals([]);
      }

      const budgetRes = await transactionService.getBudgets();
      if (budgetRes.success && Array.isArray(budgetRes.budgets)) {
        setBudgets(budgetRes.budgets);
      } else {
        setBudgets([]);
      }

      const txRes = await transactionService.getTransactions();
      if (txRes.success && Array.isArray(txRes.transactions)) {
        setTransactions(txRes.transactions);
      } else {
        setTransactions([]);
      }
    } catch (e) {
      console.warn('Backend load on login fallback:', e.message);
    }

    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Welcome Back!", `Logged in successfully as ${userObj.name || 'User'}.`);
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
    await goalService.createGoal(newGoal);
    showNotification('New Goal Created!', `Added "${newGoal.name}" (Target: ₹${newGoal.target.toLocaleString()}) to Atlas Strategist.`);
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
      case 'home':
        return (
          <HomeDashboardView 
            userProfile={userProfile}
            budgets={budgets}
            goals={goals}
            transactions={transactions}
            setActiveTab={setActiveTab}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        );
      case 'subscriptions':
        return <SubscriptionsView userProfile={userProfile} />;
      case 'john':
        return (
          <JohnCoachDashboard 
            userProfile={userProfile}
            goals={goals} 
            onAcceptGoal={handleAddGoalFromJohn} 
            setActiveTab={setActiveTab}
          />
        );
      case 'sentinel':
        return <SentinelPredictorView userProfile={userProfile} />;
      case 'iris':
        return <IrisAdvisorView userProfile={userProfile} />;
      case 'atlas':
        return <AtlasStrategistView goals={goals} setGoals={setGoals} userProfile={userProfile} />;
      case 'nova':
        return <NovaGuardianView budgets={budgets} setBudgets={setBudgets} userProfile={userProfile} setUserProfile={setUserProfile} />;
      case 'analyser':
        return <SpendingAnalyserView userProfile={userProfile} onOpenImportModal={() => setIsImportModalOpen(true)} />;
      case 'health':
        return <FinancialHealthView userProfile={userProfile} />;
      case 'settings':
        return (
          <SettingsView 
            userProfile={userProfile}
            setUserProfile={setUserProfile}
            budgets={budgets}
            setBudgets={setBudgets}
            showNotification={showNotification}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            isDarkMode={isDarkMode}
          />
        );
      default:
        return (
          <HomeDashboardView 
            userProfile={userProfile}
            budgets={budgets}
            goals={goals}
            transactions={transactions}
            setActiveTab={setActiveTab}
            onOpenImportModal={() => setIsImportModalOpen(true)}
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
            onSync={() => showNotification("Network Synced", "All agent states refreshed.")} 
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />

          <div className="content-body">
            {renderActiveView()}
          </div>
        </main>

        <StatementImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportSuccess={handleImportSuccess}
          userProfile={userProfile}
        />

        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '14px 20px',
            backgroundColor: '#ffffff',
            border: '1px solid #059669',
            borderRadius: 'var(--radius-md)',
            color: '#0f172a',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
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
