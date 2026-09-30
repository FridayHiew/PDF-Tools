import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navbar } from './components/Navbar.tsx';
import { MergeView } from './components/MergeView.tsx';
import { SplitView } from './components/SplitView.tsx';
import { EditView } from './components/EditView.tsx';
import { PreviewModal } from './components/PreviewModal.tsx';
import { usePdfStore } from './store/pdfStore.ts';

export default function App() {
  const isDarkMode = usePdfStore((state) => state.isDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
        <Navbar />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <Routes>
            <Route path="/merge" element={<MergeView />} />
            <Route path="/split" element={<SplitView />} />
            <Route path="/edit" element={<EditView />} />
            <Route path="/" element={<Navigate to="/merge" replace />} />
            <Route path="*" element={<Navigate to="/merge" replace />} />
          </Routes>
        </main>

        <footer className="border-t border-slate-200/80 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          <p>
            PDF Toolkit • In-memory processing • Files automatically removed after 1 hour • No data stored on disk
          </p>
        </footer>

        {/* Global PDF Preview Modal */}
        <PreviewModal />

        {/* Toast Notifications */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: isDarkMode ? '#1e293b' : '#ffffff',
              color: isDarkMode ? '#f8fafc' : '#0f172a',
              border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              fontSize: '0.8125rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            },
          }}
        />
      </div>
    </BrowserRouter>
  );
}
