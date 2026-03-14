import React from 'react';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { ServiceRegister } from '@/components/ServiceRegister';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { LogOut, PlusCircle, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getDisplayVersion } from '@/lib/version';

const APP_VERSION = getDisplayVersion();

const Header = ({ onSignOut, user, role, t }) => (
  <header className="bg-white shadow-md sticky top-0 z-50">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-20">
        <div className="flex-shrink-0">
          <Link to="/dashboard" className="flex items-center">
            <img className="h-10 w-auto" src="https://horizons-cdn.hostinger.com/66ce8f1a-1805-4a09-9f17-041a9f68d79f/f39487d84caba3a65608a9652e97d727.jpg" alt="re:Compute-IT Logo" />
          </Link>
        </div>
        <div className="flex items-center gap-4">
           {user && <p className="text-gray-500 text-sm hidden sm:block">{t.dashboard.loggedInAs} {user.email}</p>}
          <span className="text-[11px] text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 hidden sm:inline-flex">
            v{APP_VERSION}
          </span>
          {role === 'superadmin' && (
            <Link to="/superadmin">
              <Button variant="outline" className="text-slate-600 hover:bg-slate-100 border-slate-300 gap-2">
                <Shield size={16} /> Super Admin
              </Button>
            </Link>
          )}
          <Button onClick={onSignOut} variant="outline" className="text-gray-600 hover:bg-gray-100 border-gray-300 gap-2">
            <LogOut size={16} /> {t.dashboard.logout}
          </Button>
        </div>
      </div>
    </div>
  </header>
);

export default function DashboardPage() {
  const { signOut, user, role } = useSupabaseAuth();
  const { t } = useUiLanguage();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onSignOut={signOut} user={user} role={role} t={t} />
      <main className="container mx-auto p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t.dashboard.staffView}
            </h1>
            <p className="mt-2 text-gray-600">{t.dashboard.staffViewSubtitle}</p>
          </div>
          <Link to="/">
            <Button className="bg-green-600 hover:bg-green-700 text-white gap-2">
              <PlusCircle size={18} />
              {t.dashboard.registerNewTicket}
            </Button>
          </Link>
        </motion.div>

        <ServiceRegister />
        {(role === 'admin' || role === 'superadmin') ? <AdminPanel /> : null}
      </main>
    </div>
  );
}
