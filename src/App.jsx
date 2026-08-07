import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JohnCoachDashboard from './components/JohnCoachDashboard';
import SentinelPredictorView from './components/SentinelPredictorView';
import IrisAdvisorView from './components/IrisAdvisorView';
import AtlasStrategistView from './components/AtlasStrategistView';
import NovaGuardianView from './components/NovaGuardianView';
import TransactionCategorizerView from './components/TransactionCategorizerView';
import FinancialHealthView from './components/FinancialHealthView';
import SettingsView from './components/SettingsView';
import AuthView from './components/AuthView';
import OnboardingView from './components/OnboardingView';
import { 
  USER_PROFILE, 
  BUDGET_BUDGETS, 
  INITIAL_SAVINGS_GOALS 
} from './data/mockFinancialData';
import { Target } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authMode, setAuthMode] = useState('authenticated'); // 'login' | 'signup' | 'onboarding' | 'authenticated'
  const [onboardingInitialData, setOnboardingInitialData] = useState(null);

  const [activeTab, setActiveTab] = useState('john');
  const [userProfile, setUserProfile] = useState(USER_PROFILE);
  const [budgets, setBudgets] = useState(BUDGET_BUDGETS);
  const [goals, setGoals] = useState(INITIAL_SAVINGS_GOALS);
  const [toastMessage, setToastMessage] = useState(null);

  const showNotification = (title, detail) => {
    setToastMessage({ title, detail });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleStartOnboarding = (initialData) => {
    setOnboardingInitialData(initialData);
    setAuthMode('onboarding');
  };

  const handleCompleteOnboarding = (newProfile, newGoal) => {
    setUserProfile(newProfile);
    if (newGoal) {
      setGoals(prev => [newGoal, ...prev]);
    }
    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Account Setup Complete!", `Welcome to FinMate AI, ${newProfile.name}. John AI Coach is synced to your financial details.`);
  };

  const handleLoginSuccess = (loginData) => {
    setUserProfile(prev => ({ ...prev, name: loginData.name || prev.name }));
    setIsAuthenticated(true);
    setAuthMode('authenticated');
    showNotification("Welcome Back!", `Logged in successfully as ${loginData.name || 'Aryan'}.`);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthMode('login');
  };

  const handleAddGoalFromJohn = (newGoal) => {
    setGoals(prev => [newGoal, ...prev]);
    showNotification('New Goal Created!', `Added "${newGoal.name}" (Target: ₹${newGoal.target.toLocaleString()}) to Atlas Strategist.`);
  };

  // Render Auth screens if not authenticated
  if (!isAuthenticated) {
    if (authMode === 'onboarding') {
      return (
        <OnboardingView 
          initialData={onboardingInitialData}
          onCompleteOnboarding={handleCompleteOnboarding}
        />
      );
    }
    return (
      <AuthView 
        onLoginSuccess={handleLoginSuccess}
        onStartOnboarding={handleStartOnboarding}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
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
      case 'categorizer':
        return <TransactionCategorizerView userProfile={userProfile} />;
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
          />
        );
      default:
        return (
          <JohnCoachDashboard 
            userProfile={userProfile}
            goals={goals} 
            onAcceptGoal={handleAddGoalFromJohn} 
            setActiveTab={setActiveTab} 
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userProfile={userProfile} onLogout={handleLogout} />

      {/* Main Work Area */}
      <main className="main-content">
        <Header activeTab={activeTab} onSync={() => showNotification("Network Synced", "All agent states refreshed.")} />

        <div className="content-body">
          {renderActiveView()}
        </div>
      </main>

      {/* Toast Notification Banner */}
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
  );
}
