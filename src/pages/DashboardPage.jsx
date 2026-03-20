import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { ServiceRegister } from '@/components/ServiceRegister';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { LogOut, PlusCircle, Shield, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getDisplayVersion } from '@/lib/version';

const APP_VERSION = getDisplayVersion();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const LANGUAGE_OPTIONS = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
];

function AccountDialog({ open, onOpenChange, user, token }) {
  const { toast } = useToast();
  const { language, setLanguage } = useUiLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast({ title: 'Fyll i båda fälten', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Nytt lösenord måste vara minst 8 tecken', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Kunde inte byta lösenord');
      }
      toast({ title: 'Lösenord bytt', description: 'Ditt lösenord har uppdaterats.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast({ title: 'Fel', description: err?.message || 'Försök igen.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mitt konto</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-600">Inloggad som <span className="font-medium">{user?.name || user?.email}</span></p>
            <p className="text-xs text-gray-400">{user?.email}</p>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Språk i gränssnittet</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-800">Byt lösenord</h3>
            <div>
              <Label className="text-sm">Nuvarande lösenord</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label className="text-sm">Nytt lösenord</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-400 mt-1">Minst 8 tecken</p>
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Sparar...' : 'Byt lösenord'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const Header = ({ onSignOut, onOpenAccount, user, role, t }) => (
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
          <Button onClick={onOpenAccount} variant="outline" className="text-gray-600 hover:bg-gray-100 border-gray-300 gap-2">
            <Settings size={16} /> Mitt konto
          </Button>
          <Button onClick={onSignOut} variant="outline" className="text-gray-600 hover:bg-gray-100 border-gray-300 gap-2">
            <LogOut size={16} /> {t.dashboard.logout}
          </Button>
        </div>
      </div>
    </div>
  </header>
);

export default function DashboardPage() {
  const { signOut, user, role, token } = useSupabaseAuth();
  const { t } = useUiLanguage();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onSignOut={signOut} onOpenAccount={() => setAccountOpen(true)} user={user} role={role} t={t} />
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
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} user={user} token={token} />
    </div>
  );
}
