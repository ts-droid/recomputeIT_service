import React, { useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const formatDuration = (seconds) => {
  if (!seconds || Number.isNaN(seconds)) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
};

export function AdminPanel() {
  const { token, role } = useSupabaseAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [messageSettings, setMessageSettings] = useState({
    email_footer_by_lang: { sv: '', en: '' },
    sms_footer_by_lang: { sv: '', en: '' },
    cost_prompt_by_lang: { sv: '', en: '' },
    ready_prompt_by_lang: { sv: '', en: '' },
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'base',
    name: '',
  });

  const canView = role === 'admin';

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const loadStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.append('from', dateRange.from);
      if (dateRange.to) params.append('to', dateRange.to);
      const response = await fetch(`${API_BASE_URL}/api/admin/stats?${params.toString()}`, { headers });
      if (!response.ok) throw new Error('Stats error');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Stats fetch error:', error);
      toast({
        title: 'Kunde inte hämta statistik',
        description: 'Kontrollera behörighet och försök igen.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, { headers });
      if (!response.ok) throw new Error('Users error');
      const data = await response.json();
      setUsers(data || []);
    } catch (error) {
      console.error('Users fetch error:', error);
    }
  };

  const loadMessageSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/message-settings`, { headers });
      if (!response.ok) throw new Error('Message settings error');
      const data = await response.json();
      setMessageSettings({
        email_footer_by_lang: data?.email_footer_by_lang || { sv: '', en: '' },
        sms_footer_by_lang: data?.sms_footer_by_lang || { sv: '', en: '' },
        cost_prompt_by_lang: data?.cost_prompt_by_lang || { sv: '', en: '' },
        ready_prompt_by_lang: data?.ready_prompt_by_lang || { sv: '', en: '' },
      });
    } catch (error) {
      console.error('Message settings fetch error:', error);
      toast({
        title: 'Kunde inte hämta meddelandeinställningar',
        description: 'Försök igen.',
        variant: 'destructive',
      });
    }
  };

  const updateSettingField = (group, lang, value) => {
    setMessageSettings((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || {}),
        [lang]: value,
      },
    }));
  };

  const saveMessageSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/message-settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(messageSettings),
      });
      if (!response.ok) throw new Error('Save message settings error');
      const data = await response.json();
      setMessageSettings({
        email_footer_by_lang: data?.email_footer_by_lang || { sv: '', en: '' },
        sms_footer_by_lang: data?.sms_footer_by_lang || { sv: '', en: '' },
        cost_prompt_by_lang: data?.cost_prompt_by_lang || { sv: '', en: '' },
        ready_prompt_by_lang: data?.ready_prompt_by_lang || { sv: '', en: '' },
      });
      toast({
        title: 'Sparat',
        description: 'Meddelandeinställningar uppdaterade.',
      });
    } catch (error) {
      console.error('Save message settings error:', error);
      toast({
        title: 'Kunde inte spara',
        description: 'Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    if (!form.email || !form.password || !form.role) {
      toast({
        title: 'Fyll i alla fält',
        description: 'E-post, lösenord och roll krävs.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error('Create user error');
      }

      const newUser = await response.json();
      setUsers((prev) => [newUser, ...prev]);
      setForm({ email: '', password: '', role: 'base', name: '' });
      toast({
        title: 'Användare skapad',
        description: `${newUser.email} (${newUser.role})`,
      });
    } catch (error) {
      console.error('Create user error:', error);
      toast({
        title: 'Kunde inte skapa användare',
        description: 'Kontrollera uppgifterna och försök igen.',
        variant: 'destructive',
      });
    }
  };

  const updateUser = async (id, updates) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Update user error');
      const updated = await response.json();
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
    } catch (error) {
      console.error('Update user error:', error);
      toast({
        title: 'Kunde inte uppdatera användare',
        description: 'Försök igen.',
        variant: 'destructive',
      });
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: 'Fyll i e-post',
        description: 'Ange en mottagare för testmail.',
        variant: 'destructive',
      });
      return;
    }

    setSendingTest(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/test-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: testEmail }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || 'Test email error');
      }

      toast({
        title: 'Testmail skickat',
        description: `Kontrollera inkorgen för ${testEmail}.`,
      });
    } catch (error) {
      console.error('Test email error:', error);
      toast({
        title: 'Kunde inte skicka testmail',
        description: error?.message || 'Kontrollera SMTP/Resend-inställningarna.',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    loadStats();
    loadUsers();
    loadMessageSettings();
  }, [canView]);

  if (!canView) return null;

  return (
    <section className="mt-12 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Adminpanel</h2>
          <p className="text-sm text-gray-600">Statistik och användarhantering.</p>
        </div>
        <Button variant="outline" onClick={loadStats} disabled={loading}>
          Uppdatera statistik
        </Button>
      </div>

      <Tabs defaultValue="reports" className="w-full">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="reports">Rapporter</TabsTrigger>
          <TabsTrigger value="users">Användare</TabsTrigger>
          <TabsTrigger value="messages">Meddelanden</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Totalt antal ärenden</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.total_tickets ?? '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Avslutade ärenden</p>
              <p className="text-2xl font-semibold text-gray-900">{stats?.closed_tickets ?? '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Snittid reparation</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatDuration(stats?.avg_repair_seconds)}
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Snittid klar → kundinfo</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatDuration(stats?.avg_notify_seconds)}
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Snittid klar → hämtad</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatDuration(stats?.avg_pickup_seconds)}
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1">
              <Label htmlFor="stats-from">Från</Label>
              <Input
                id="stats-from"
                type="date"
                value={dateRange.from}
                onChange={(event) => setDateRange((prev) => ({ ...prev, from: event.target.value }))}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="stats-to">Till</Label>
              <Input
                id="stats-to"
                type="date"
                value={dateRange.to}
                onChange={(event) => setDateRange((prev) => ({ ...prev, to: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadStats} disabled={loading}>
                Kör filter
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">E-postfooter</h3>
                <Label className="mb-2 block">Svenska</Label>
                <Textarea
                  value={messageSettings.email_footer_by_lang?.sv || ''}
                  onChange={(event) => updateSettingField('email_footer_by_lang', 'sv', event.target.value)}
                  className="mb-3 min-h-[90px]"
                />
                <Label className="mb-2 block">English</Label>
                <Textarea
                  value={messageSettings.email_footer_by_lang?.en || ''}
                  onChange={(event) => updateSettingField('email_footer_by_lang', 'en', event.target.value)}
                  className="min-h-[90px]"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">SMS-footer</h3>
                <Label className="mb-2 block">Svenska</Label>
                <Input
                  value={messageSettings.sms_footer_by_lang?.sv || ''}
                  onChange={(event) => updateSettingField('sms_footer_by_lang', 'sv', event.target.value)}
                  className="mb-3"
                />
                <Label className="mb-2 block">English</Label>
                <Input
                  value={messageSettings.sms_footer_by_lang?.en || ''}
                  onChange={(event) => updateSettingField('sms_footer_by_lang', 'en', event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Prompt: Kostnadsförslag</h3>
                <Label className="mb-2 block">Svenska</Label>
                <Textarea
                  value={messageSettings.cost_prompt_by_lang?.sv || ''}
                  onChange={(event) => updateSettingField('cost_prompt_by_lang', 'sv', event.target.value)}
                  className="mb-3 min-h-[90px]"
                />
                <Label className="mb-2 block">English</Label>
                <Textarea
                  value={messageSettings.cost_prompt_by_lang?.en || ''}
                  onChange={(event) => updateSettingField('cost_prompt_by_lang', 'en', event.target.value)}
                  className="min-h-[90px]"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Prompt: Reparation klar</h3>
                <Label className="mb-2 block">Svenska</Label>
                <Textarea
                  value={messageSettings.ready_prompt_by_lang?.sv || ''}
                  onChange={(event) => updateSettingField('ready_prompt_by_lang', 'sv', event.target.value)}
                  className="mb-3 min-h-[90px]"
                />
                <Label className="mb-2 block">English</Label>
                <Textarea
                  value={messageSettings.ready_prompt_by_lang?.en || ''}
                  onChange={(event) => updateSettingField('ready_prompt_by_lang', 'en', event.target.value)}
                  className="min-h-[90px]"
                />
              </div>
            </div>
          </div>
          <div className="mt-6">
            <Button onClick={saveMessageSettings} disabled={savingSettings}>
              {savingSettings ? 'Sparar...' : 'Spara meddelandeinställningar'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Skapa användare</h3>
              <form onSubmit={createUser} className="space-y-4">
                <div>
                  <Label htmlFor="admin-name">Namn</Label>
                  <Input
                    id="admin-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Valfritt"
                  />
                </div>
                <div>
                  <Label htmlFor="admin-email">E-post</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="namn@foretag.se"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password">Lösenord</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Minst 8 tecken"
                    required
                  />
                </div>
                <div>
                  <Label>Roll</Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Välj roll" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Bas</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white">
                  Skapa användare
                </Button>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Användare</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 max-h-[420px] overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-gray-500">Inga användare ännu.</p>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{user.name || user.email}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <Select
                        value={user.role}
                        onValueChange={(value) => updateUser(user.id, { role: value })}
                      >
                        <SelectTrigger className="w-[140px] bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Bas</SelectItem>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Testa e-post</h3>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="test-email">Mottagare</Label>
                <Input
                  id="test-email"
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  placeholder="namn@foretag.se"
                />
              </div>
              <Button onClick={sendTestEmail} disabled={sendingTest}>
                Skicka testmail
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
