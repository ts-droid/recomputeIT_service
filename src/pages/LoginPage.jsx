import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { getDisplayVersion } from '@/lib/version';

const APP_VERSION = getDisplayVersion();

export default function LoginPage() {
  const { signInWithEmail, session, role } = useSupabaseAuth();
  const { t } = useUiLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    if (session) {
      // Redirect superadmin to the super admin panel by default
      if (role === 'superadmin' && from === '/dashboard') {
        navigate('/superadmin', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  }, [session, navigate, from, role]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signInWithEmail(email, password);
    if (error) {
      toast({
        title: t.login.loginErrorTitle,
        description: t.login.loginErrorDescription,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
       <Link to="/" className="text-3xl font-bold text-gray-800 flex items-center gap-3 mb-8">
          <span>
            <span className="text-green-600">re:</span><span>Compute-IT</span>
          </span>
          <span className="text-[11px] text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5">
            v{APP_VERSION}
          </span>
        </Link>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm p-8 space-y-6 bg-white rounded-lg shadow-lg"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">
            {t.login.title}
          </h1>
          <p className="mt-2 text-gray-500">{t.login.subtitle}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700">{t.login.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-gray-50 border-gray-300 text-gray-900"
              placeholder={t.login.emailPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t.login.passwordLabel}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-gray-50 border-gray-300 text-gray-900"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full bg-slate-700 hover:bg-slate-800 text-white" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.login.loginButton}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
