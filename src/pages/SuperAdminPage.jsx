import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import {
  LogOut,
  BarChart3,
  Building2,
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { getDisplayVersion } from '@/lib/version';

const APP_VERSION = getDisplayVersion();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function SAHeader({ onSignOut, user, t }) {
  return (
    <header className="bg-slate-900 shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-slate-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-white font-bold text-lg tracking-tight">Super Admin</h1>
            <span className="text-[11px] text-slate-500 border border-slate-700 rounded-full px-2 py-0.5">
              v{APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <p className="text-slate-400 text-sm hidden sm:block">{user.email}</p>
            )}
            <Button
              onClick={onSignOut}
              variant="outline"
              size="sm"
              className="text-slate-300 hover:bg-slate-800 border-slate-700 gap-2"
            >
              <LogOut size={14} /> {t.dashboard.logout}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Usage Dashboard Tab
// ---------------------------------------------------------------------------
function UsageDashboard({ token, t }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const sa = t.superadmin;

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const qs = params.toString() ? `?${params}` : '';

      const res = await fetch(`${API_BASE_URL}/api/superadmin/usage${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('fetch failed');
      setData(await res.json());
    } catch {
      toast({ title: sa.usageErrorTitle, description: sa.usageErrorDescription, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, toast, sa]);

  useEffect(() => {
    fetchUsage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-gray-600 text-xs">{sa.dateFrom}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-44 bg-white border-gray-300"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-gray-600 text-xs">{sa.dateTo}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-44 bg-white border-gray-300"
          />
        </div>
        <Button
          onClick={fetchUsage}
          disabled={loading}
          className="bg-slate-700 hover:bg-slate-800 text-white"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {sa.applyFilter}
        </Button>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: sa.totalSmsOut, value: data.summary.sms_outbound, color: 'bg-blue-50 text-blue-700' },
            { label: sa.totalSmsIn, value: data.summary.sms_inbound, color: 'bg-blue-50 text-blue-600' },
            { label: sa.totalEmailOut, value: data.summary.email_outbound, color: 'bg-emerald-50 text-emerald-700' },
            { label: sa.totalEmailIn, value: data.summary.email_inbound, color: 'bg-emerald-50 text-emerald-600' },
            { label: sa.grandTotal, value: data.summary.total_messages, color: 'bg-slate-100 text-slate-800' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-lg p-4 ${color}`}>
              <p className="text-xs font-medium opacity-80">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per-tenant table */}
      {data?.tenants?.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantColumn}</th>
                <th className="text-right px-4 py-3 font-semibold">{sa.smsOutbound}</th>
                <th className="text-right px-4 py-3 font-semibold">{sa.smsInbound}</th>
                <th className="text-right px-4 py-3 font-semibold">{sa.emailOutbound}</th>
                <th className="text-right px-4 py-3 font-semibold">{sa.emailInbound}</th>
                <th className="text-right px-4 py-3 font-semibold">{sa.totalMessages}</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map((row) => (
                <tr key={row.tenant_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.tenant_name}
                    <span className="ml-2 text-xs text-gray-400">{row.slug}</span>
                  </td>
                  <td className="text-right px-4 py-3 text-blue-700 font-medium">{row.sms_outbound}</td>
                  <td className="text-right px-4 py-3 text-blue-600">{row.sms_inbound}</td>
                  <td className="text-right px-4 py-3 text-emerald-700 font-medium">{row.email_outbound}</td>
                  <td className="text-right px-4 py-3 text-emerald-600">{row.email_inbound}</td>
                  <td className="text-right px-4 py-3 font-bold text-gray-800">{row.total_messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <div className="text-center py-12 text-gray-500">{sa.noUsageData}</div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tenants CRUD Tab
// ---------------------------------------------------------------------------
const EMPTY_TENANT = {
  name: '',
  slug: '',
  support_email: '',
  support_phone: '',
  brand_config: {},
  is_active: true,
};

function TenantsManager({ token, t }) {
  const { toast } = useToast();
  const sa = t.superadmin;

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create
  const [form, setForm] = useState({ ...EMPTY_TENANT });
  const [brandJson, setBrandJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setTenants(await res.json());
    } catch {
      toast({ title: sa.tenantErrorTitle, description: sa.tenantErrorDescription, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [token, toast, sa]);

  useEffect(() => {
    fetchTenants();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_TENANT });
    setBrandJson('{}');
    setDialogOpen(true);
  };

  const openEdit = (tenant) => {
    setEditing(tenant);
    setForm({
      name: tenant.name || '',
      slug: tenant.slug || '',
      support_email: tenant.support_email || '',
      support_phone: tenant.support_phone || '',
      brand_config: tenant.brand_config || {},
      is_active: tenant.is_active,
    });
    setBrandJson(JSON.stringify(tenant.brand_config || {}, null, 2));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Parse brand_config JSON
    let parsedBrand;
    try {
      parsedBrand = JSON.parse(brandJson);
    } catch {
      toast({ title: sa.tenantErrorTitle, description: 'Invalid JSON in brand config.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const body = { ...form, brand_config: parsedBrand };
      const url = editing
        ? `${API_BASE_URL}/api/superadmin/tenants/${editing.id}`
        : `${API_BASE_URL}/api/superadmin/tenants`;
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        toast({ title: sa.tenantErrorTitle, description: sa.slugExistsError, variant: 'destructive' });
        setSaving(false);
        return;
      }
      if (!res.ok) throw new Error();

      toast({ title: editing ? sa.tenantUpdatedTitle : sa.tenantCreatedTitle });
      setDialogOpen(false);
      fetchTenants();
    } catch {
      toast({ title: sa.tenantErrorTitle, description: sa.tenantErrorDescription, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (tenant) => {
    const newActive = !tenant.is_active;
    const confirmMsg = newActive ? sa.confirmActivate : sa.confirmDeactivate;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) throw new Error();
      toast({ title: sa.tenantUpdatedTitle });
      fetchTenants();
    } catch {
      toast({ title: sa.tenantErrorTitle, description: sa.tenantErrorDescription, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">{sa.tenantsTitle}</h2>
        <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white gap-2">
          <Plus size={16} /> {sa.createTenant}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{sa.noTenants}</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantName}</th>
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantSlug}</th>
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantEmail}</th>
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantPhone}</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">{sa.tenantCreatedAt}</th>
                <th className="text-right px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{tenant.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant.support_email || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant.support_phone || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={tenant.is_active ? 'default' : 'secondary'} className={tenant.is_active ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-500'}>
                      {tenant.is_active ? sa.tenantActive : sa.tenantInactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(tenant.created_at).toLocaleDateString('sv-SE')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(tenant)}
                        className="text-gray-500 hover:text-gray-800"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(tenant)}
                        className={tenant.is_active ? 'text-orange-500 hover:text-orange-700' : 'text-green-500 hover:text-green-700'}
                      >
                        {tenant.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? sa.editTenant : sa.createTenant}</DialogTitle>
            <DialogDescription>
              {editing ? `${sa.editTenant}: ${editing.name}` : sa.createTenant}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>{sa.tenantName}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Corp"
                className="bg-gray-50 border-gray-300"
              />
            </div>
            <div className="space-y-2">
              <Label>{sa.tenantSlug}</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="acme-corp"
                className="bg-gray-50 border-gray-300 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{sa.tenantEmail}</Label>
                <Input
                  value={form.support_email}
                  onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
                  placeholder="support@acme.com"
                  className="bg-gray-50 border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label>{sa.tenantPhone}</Label>
                <Input
                  value={form.support_phone}
                  onChange={(e) => setForm((f) => ({ ...f, support_phone: e.target.value }))}
                  placeholder="+46 8 123 456"
                  className="bg-gray-50 border-gray-300"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{sa.brandConfig}</Label>
              <Textarea
                value={brandJson}
                onChange={(e) => setBrandJson(e.target.value)}
                rows={8}
                className="bg-gray-50 border-gray-300 font-mono text-xs"
                placeholder='{ "logoUrl": "", "themePreset": "forest" }'
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300">
                {sa.cancelEdit}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name || !form.slug}
                className="bg-slate-700 hover:bg-slate-800 text-white"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {sa.saveTenant}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function SuperAdminPage() {
  const { signOut, user, token } = useSupabaseAuth();
  const { t } = useUiLanguage();
  const sa = t.superadmin;

  return (
    <div className="min-h-screen bg-gray-50">
      <SAHeader onSignOut={signOut} user={user} t={t} />

      <main className="container mx-auto p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">{sa.title}</h1>
          <p className="mt-2 text-gray-600">{sa.subtitle}</p>
        </motion.div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 size={16} /> {sa.tabDashboard}
            </TabsTrigger>
            <TabsTrigger value="tenants" className="gap-2">
              <Building2 size={16} /> {sa.tabTenants}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <UsageDashboard token={token} t={t} />
          </TabsContent>
          <TabsContent value="tenants">
            <TenantsManager token={token} t={t} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
