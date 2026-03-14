import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { SupabaseAuthProvider, useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { UiLanguageProvider } from '@/contexts/UiLanguageContext';
import PublicRegistrationPage from '@/pages/PublicRegistrationPage';
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import { Loader2 } from 'lucide-react';

function ProtectedRoute({ children }) {
  const { session, loading } = useSupabaseAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}


function AppContent() {
  return (
    <>
      <Helmet>
        <title>re:Compute-IT - Service & Reparation</title>
        <meta name="description" content="Professionellt serviceregister för hantering av serviceärenden hos re:Compute-IT. Registrera enheter, kontaktuppgifter och felbeskrivningar enkelt och säkert." />
        <meta property="og:title" content="re:Compute-IT - Service & Reparation" />
        <meta property="og:description" content="Professionellt serviceregister för hantering av serviceärenden hos re:Compute-IT." />
        <link rel="icon" type="image/svg+xml" href="https://horizons-cdn.hostinger.com/66ce8f1a-1805-4a09-9f17-041a9f68d79f/f39487d84caba3a65608a9652e97d727.jpg" />
      </Helmet>
      
      <div className="min-h-screen bg-gray-50 text-gray-800">
        <Routes>
          <Route path="/" element={<PublicRegistrationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
        </Routes>
        <Toaster />
      </div>
    </>
  );
}

function App() {
  return (
    <SupabaseAuthProvider>
      <UiLanguageProvider>
        <AppContent />
      </UiLanguageProvider>
    </SupabaseAuthProvider>
  );
}

export default App;
