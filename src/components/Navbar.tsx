import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FileStack,
  Scissors,
  Edit3,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { usePdfStore } from '../store/pdfStore.ts';

export const Navbar: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = usePdfStore();

  const navLinks = [
    { to: '/merge', label: 'Merge', icon: FileStack },
    { to: '/split', label: 'Split', icon: Scissors },
    { to: '/edit', label: 'Edit & Fill', icon: Edit3 },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <span className="font-black text-sm tracking-tighter">PDF</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                PDF Toolkit
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" /> Secure & In-Memory
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Auto 10-min memory cleanup • Zero disk persistence
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
          {navLinks.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Actions Right */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
