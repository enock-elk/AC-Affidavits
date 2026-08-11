import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  FileSignature, 
  FileText, 
  LogOut, 
  Moon, 
  Sun, 
  ShieldCheck, 
  Building2
} from 'lucide-react';

// Import standalone modular components
import TrelloDashboard from './TrelloDashboard';
import CaseMaker from './CaseMaker';
import EmailEngine from './EmailEngine';
import AffidavitAutomation from './AffidavitAutomation';

// ============================================================================
// MAIN APP SHELL
// ============================================================================

const SESSION_KEY = 'currentUser';
const REMEMBER_KEY = 'ac_remembered_user';
const REMEMBER_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const loadRememberedName = () => {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.name && (!data.expiresAt || Date.now() <= data.expiresAt)) {
        return String(data.name).trim();
      }
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY);
  }
  // Migrate older sessions that only stored currentUser
  return (localStorage.getItem(SESSION_KEY) || '').trim();
};

const persistUserName = (name) => {
  const trimmed = name.trim();
  localStorage.setItem(SESSION_KEY, trimmed);
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({
    name: trimmed,
    expiresAt: Date.now() + REMEMBER_MS
  }));
};

export default function App() {
  const rememberedName = loadRememberedName();
  // Active session only — remembered name is used to prefill after logout
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem(SESSION_KEY));
  const [userName, setUserName] = useState(
    () => localStorage.getItem(SESSION_KEY) || rememberedName || ''
  );
  const [currentRoute, setCurrentRoute] = useState('affidavits'); 
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Refresh the 1-year remember window while the user stays signed in
  useEffect(() => {
    const active = localStorage.getItem(SESSION_KEY);
    if (isAuthenticated && active) {
      persistUserName(active);
    }
  }, [isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (userName.trim().length < 2) return;
    persistUserName(userName);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // End the active session, but keep the remembered name for easy return
    localStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
    setUserName(loadRememberedName());
    setCurrentRoute('affidavits');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-300 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl p-6 mb-8 shadow-inner inline-block">
            <Building2 className="w-12 h-12 text-amber-500 mx-auto mb-2" />
            <h2 className="text-3xl font-serif text-amber-600 dark:text-amber-500 tracking-wide leading-none mb-1">ACTUARY</h2>
            <p className="text-[0.65rem] font-sans text-slate-500 tracking-[0.3em] uppercase">Consulting</p>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Command Center</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
            Secure workspace. Please enter your full name to access unified tools and maintain an audit trail.
            {userName ? (
              <span className="block mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Welcome back — your name is remembered on this device.
              </span>
            ) : null}
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="text" 
              placeholder="Enter your Full Name" 
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              autoComplete="name"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>Enter Workspace</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100 overflow-hidden transition-colors duration-300">
      <div className="w-20 shrink-0 flex flex-col items-center py-6 border-r border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-slate-400 z-20">
        <div className="mb-8 hover:scale-105 transition-transform duration-300 cursor-pointer text-amber-500">
          <Building2 className="w-10 h-10" />
        </div>
        
        <nav className="flex-1 flex flex-col gap-4 w-full px-3">
          <button 
            onClick={() => setCurrentRoute('affidavits')}
            className={`p-3 rounded-xl transition-all flex justify-center w-full ${currentRoute === 'affidavits' ? 'text-white bg-slate-800' : 'hover:text-white hover:bg-slate-800/50'}`}
            title="Affidavit Automation"
          >
            <FileSignature size={22} />
          </button>

          <button 
            onClick={() => setCurrentRoute('dashboard')}
            className={`p-3 rounded-xl transition-all flex justify-center w-full ${currentRoute === 'dashboard' ? 'text-white bg-slate-800' : 'hover:text-white hover:bg-slate-800/50'}`}
            title="Trello Watcher"
          >
            <LayoutDashboard size={22} />
          </button>
          
          <button 
            onClick={() => setCurrentRoute('casemaker')}
            className={`p-3 rounded-xl transition-all flex justify-center w-full ${currentRoute === 'casemaker' ? 'text-white bg-slate-800' : 'hover:text-white hover:bg-slate-800/50'}`}
            title="Case Maker"
          >
            <Briefcase size={22} />
          </button>

          <button 
            onClick={() => setCurrentRoute('emails')}
            className={`p-3 rounded-xl transition-all flex justify-center w-full ${currentRoute === 'emails' ? 'text-white bg-slate-800' : 'hover:text-white hover:bg-slate-800/50'}`}
            title="Email Drafts"
          >
            <FileText size={22} />
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4 w-full px-3">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all flex justify-center w-full"
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          
          <button 
            onClick={handleLogout}
            className="p-3 text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-xl transition-all flex justify-center w-full"
            title="Secure Logout"
          >
            <LogOut size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col h-full bg-slate-50 dark:bg-slate-900/50">
        <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md z-10">
           <h1 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
             {currentRoute === 'dashboard' && 'Trello Watcher'}
             {currentRoute === 'casemaker' && 'Case Maker'}
             {currentRoute === 'emails' && 'Draft Email Generator'}
             {currentRoute === 'affidavits' && 'Affidavit Automation'}
           </h1>
           <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">System Online</span>
             </div>
           </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {/* GUARDIAN: CSS-based display toggling to preserve component states (specifically Web Workers) */}
          <div className={currentRoute === 'dashboard' ? 'block h-full' : 'hidden'}>
            <TrelloDashboard />
          </div>
          <div className={currentRoute === 'casemaker' ? 'block h-full' : 'hidden'}>
            <CaseMaker />
          </div>
          <div className={currentRoute === 'emails' ? 'block h-full' : 'hidden'}>
            <EmailEngine />
          </div>
          <div className={currentRoute === 'affidavits' ? 'block h-full' : 'hidden'}>
            <AffidavitAutomation />
          </div>
        </main>
      </div>
    </div>
  );
}