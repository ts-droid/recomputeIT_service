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
const LANGUAGE_OPTIONS = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'es', label: 'Español' },
  { code: 'fi', label: 'Suomi' },
  { code: 'ku', label: 'Kurdî' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: 'Українська' },
];

const emptyByLang = () =>
  LANGUAGE_OPTIONS.reduce((acc, item) => {
    acc[item.code] = '';
    return acc;
  }, {});

const normalizeSettingsPayload = (data = {}) => ({
  email_footer_by_lang: { ...emptyByLang(), ...(data?.email_footer_by_lang || {}) },
  sms_footer_by_lang: { ...emptyByLang(), ...(data?.sms_footer_by_lang || {}) },
  cost_prompt_by_lang: { ...emptyByLang(), ...(data?.cost_prompt_by_lang || {}) },
  ready_prompt_by_lang: { ...emptyByLang(), ...(data?.ready_prompt_by_lang || {}) },
  decision_approved_sms_by_lang: { ...emptyByLang(), ...(data?.decision_approved_sms_by_lang || {}) },
  decision_approved_email_subject_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_approved_email_subject_by_lang || {}),
  },
  decision_approved_email_body_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_approved_email_body_by_lang || {}),
  },
  decision_declined_sms_by_lang: { ...emptyByLang(), ...(data?.decision_declined_sms_by_lang || {}) },
  decision_declined_email_subject_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_declined_email_subject_by_lang || {}),
  },
  decision_declined_email_body_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_declined_email_body_by_lang || {}),
  },
  decision_unclear_sms_by_lang: { ...emptyByLang(), ...(data?.decision_unclear_sms_by_lang || {}) },
  decision_unclear_email_subject_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_unclear_email_subject_by_lang || {}),
  },
  decision_unclear_email_body_by_lang: {
    ...emptyByLang(),
    ...(data?.decision_unclear_email_body_by_lang || {}),
  },
  ai_reply_assistant_prompt: data?.ai_reply_assistant_prompt || '',
  ai_message_suggestion_prompt: data?.ai_message_suggestion_prompt || '',
  ai_work_done_prompt: data?.ai_work_done_prompt || '',
  chat_default_language: data?.chat_default_language || 'sv',
});

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
  const [messageSettings, setMessageSettings] = useState(normalizeSettingsPayload());
  const [savingSettings, setSavingSettings] = useState(false);
  const [translatingSettings, setTranslatingSettings] = useState(false);
  const [adminTab, setAdminTab] = useState('reports');
  const [messageTab, setMessageTab] = useState('footers');
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
      setMessageSettings(normalizeSettingsPayload(data));
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

  const updateTopLevelSetting = (key, value) => {
    setMessageSettings((prev) => ({ ...prev, [key]: value }));
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
      setMessageSettings(normalizeSettingsPayload(data));
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

  const autoTranslateMessageSettings = async () => {
    setTranslatingSettings(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/message-settings/auto-translate`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) throw new Error('Auto-translate message settings error');
      const data = await response.json();
      setMessageSettings(normalizeSettingsPayload(data));
      toast({
        title: 'Klart',
        description: 'Översättningar uppdaterade för alla språk.',
      });
    } catch (error) {
      console.error('Auto-translate message settings error:', error);
      toast({
        title: 'Auto-översättning misslyckades',
        description: 'Kontrollera DeepSeek-nyckel och försök igen.',
        variant: 'destructive',
      });
    } finally {
      setTranslatingSettings(false);
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

      <Tabs value={adminTab} onValueChange={setAdminTab} className="w-full">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="reports">Rapporter</TabsTrigger>
            <TabsTrigger value="users">Användare</TabsTrigger>
            <TabsTrigger value="messages">Meddelanden</TabsTrigger>
          </TabsList>
          {adminTab === 'messages' && (
            <Tabs value={messageTab} onValueChange={setMessageTab}>
              <TabsList className="bg-gray-100">
                <TabsTrigger value="footers">Footers</TabsTrigger>
                <TabsTrigger value="templates">Standardtexter</TabsTrigger>
                <TabsTrigger value="ai">AI-prompter</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

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
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Internt chatspråk (default)</Label>
              <Select
                value={messageSettings.chat_default_language || 'sv'}
                onValueChange={(value) => updateTopLevelSetting('chat_default_language', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj språk" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <SelectItem key={`chat-lang-${lang.code}`} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-2">
                Kundens meddelanden visas i original + översättning till detta språk (endast internt i chatten).
              </p>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={autoTranslateMessageSettings} disabled={translatingSettings}>
              {translatingSettings ? 'Översätter...' : 'AI-översätt alla språk'}
            </Button>
            <p className="text-xs text-gray-500 self-center">
              Fyll i svenska/engelska och låt systemet auto-översätta samt cacha översättningar.
            </p>
          </div>
          <Tabs value={messageTab} onValueChange={setMessageTab} className="w-full">
            <TabsContent value="footers" className="mt-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">E-postfooter</h3>
                  <div className="space-y-3 max-h-[620px] overflow-y-auto pr-2">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <div key={`email-footer-${lang.code}`}>
                        <Label className="mb-2 block">{lang.label}</Label>
                        <Textarea
                          value={messageSettings.email_footer_by_lang?.[lang.code] || ''}
                          onChange={(event) => updateSettingField('email_footer_by_lang', lang.code, event.target.value)}
                          className="min-h-[90px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">SMS-footer</h3>
                  <div className="space-y-3 max-h-[620px] overflow-y-auto pr-2">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <div key={`sms-footer-${lang.code}`}>
                        <Label className="mb-2 block">{lang.label}</Label>
                        <Input
                          value={messageSettings.sms_footer_by_lang?.[lang.code] || ''}
                          onChange={(event) => updateSettingField('sms_footer_by_lang', lang.code, event.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="templates" className="mt-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Standardtext: Kostnadsförslag</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Du kan använda variabler: <code>{'{{diagnosis}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{ticket_number}}'}</code>, <code>{'{{customer_name}}'}</code>.
                    </p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <div key={`cost-prompt-${lang.code}`}>
                          <Label className="mb-2 block">{lang.label}</Label>
                          <Textarea
                            value={messageSettings.cost_prompt_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('cost_prompt_by_lang', lang.code, event.target.value)}
                            className="min-h-[90px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Standardtext: Reparation klar</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Du kan använda variabler: <code>{'{{work_done}}'}</code>, <code>{'{{final_cost}}'}</code>, <code>{'{{ticket_number}}'}</code>, <code>{'{{customer_name}}'}</code>.
                    </p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <div key={`ready-prompt-${lang.code}`}>
                          <Label className="mb-2 block">{lang.label}</Label>
                          <Textarea
                            value={messageSettings.ready_prompt_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('ready_prompt_by_lang', lang.code, event.target.value)}
                            className="min-h-[90px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Autosvar: Kostnadsförslag godkänt</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Variabler: <code>{'{{customer_name}}'}</code>, <code>{'{{ticket_number}}'}</code>, <code>{'{{amount}}'}</code>.
                    </p>
                    <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <div key={`decision-approved-${lang.code}`} className="space-y-2">
                          <Label className="block">{lang.label}</Label>
                          <Input
                            value={messageSettings.decision_approved_email_subject_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_approved_email_subject_by_lang', lang.code, event.target.value)}
                            placeholder="E-postämne"
                          />
                          <Textarea
                            value={messageSettings.decision_approved_email_body_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_approved_email_body_by_lang', lang.code, event.target.value)}
                            className="min-h-[90px]"
                            placeholder="E-posttext"
                          />
                          <Input
                            value={messageSettings.decision_approved_sms_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_approved_sms_by_lang', lang.code, event.target.value)}
                            placeholder="SMS-text"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Autosvar: Kostnadsförslag nekat</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Variabler: <code>{'{{customer_name}}'}</code>, <code>{'{{ticket_number}}'}</code>, <code>{'{{amount}}'}</code>.
                    </p>
                    <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <div key={`decision-declined-${lang.code}`} className="space-y-2">
                          <Label className="block">{lang.label}</Label>
                          <Input
                            value={messageSettings.decision_declined_email_subject_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_declined_email_subject_by_lang', lang.code, event.target.value)}
                            placeholder="E-postämne"
                          />
                          <Textarea
                            value={messageSettings.decision_declined_email_body_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_declined_email_body_by_lang', lang.code, event.target.value)}
                            className="min-h-[90px]"
                            placeholder="E-posttext"
                          />
                          <Input
                            value={messageSettings.decision_declined_sms_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_declined_sms_by_lang', lang.code, event.target.value)}
                            placeholder="SMS-text"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Autosvar: Oklart svar</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Variabler: <code>{'{{customer_name}}'}</code>, <code>{'{{ticket_number}}'}</code>.
                    </p>
                    <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <div key={`decision-unclear-${lang.code}`} className="space-y-2">
                          <Label className="block">{lang.label}</Label>
                          <Input
                            value={messageSettings.decision_unclear_email_subject_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_unclear_email_subject_by_lang', lang.code, event.target.value)}
                            placeholder="E-postämne"
                          />
                          <Textarea
                            value={messageSettings.decision_unclear_email_body_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_unclear_email_body_by_lang', lang.code, event.target.value)}
                            className="min-h-[90px]"
                            placeholder="E-posttext"
                          />
                          <Input
                            value={messageSettings.decision_unclear_sms_by_lang?.[lang.code] || ''}
                            onChange={(event) => updateSettingField('decision_unclear_sms_by_lang', lang.code, event.target.value)}
                            placeholder="SMS-text"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="mt-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">AI-prompt: Svarshjälp</h3>
                  <Textarea
                    value={messageSettings.ai_reply_assistant_prompt || ''}
                    onChange={(event) => updateTopLevelSetting('ai_reply_assistant_prompt', event.target.value)}
                    className="min-h-[180px]"
                  />
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">AI-prompt: Meddelandeförslag</h3>
                  <Textarea
                    value={messageSettings.ai_message_suggestion_prompt || ''}
                    onChange={(event) => updateTopLevelSetting('ai_message_suggestion_prompt', event.target.value)}
                    className="min-h-[180px]"
                  />
                </div>
                <div className="border border-gray-200 rounded-xl p-4 lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">AI-prompt: Utförda åtgärder</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Används när planerade åtgärder omvandlas till fältet för utförda åtgärder.
                  </p>
                  <Textarea
                    value={messageSettings.ai_work_done_prompt || ''}
                    onChange={(event) => updateTopLevelSetting('ai_work_done_prompt', event.target.value)}
                    className="min-h-[160px]"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
