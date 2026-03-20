import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useServiceTickets } from '@/hooks/useServiceTickets';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { Loader2, Hash, User, UserCircle, Smartphone, FileText, PackageCheck, Inbox, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TicketRow } from '@/components/service/TicketRow';

const normalizeStatus = (ticket) =>
  (ticket.status || '').toString().trim().toLowerCase();

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function ServiceRegister() {
  const { tickets, loading, updateTicket, deleteTicket, refreshTickets } = useServiceTickets();
  const { token, user: currentUser } = useSupabaseAuth();
  const { t } = useUiLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [tenantUsers, setTenantUsers] = useState([]);

  const loadTenantUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/tickets/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTenantUsers(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    loadTenantUsers();
  }, [loadTenantUsers]);

  const isClosedTicket = (ticket) => {
    const status = normalizeStatus(ticket);
    return status === 'avslutad' || Boolean(ticket.closed_at) || Boolean(ticket.picked_up_at);
  };

  const isReadyForPickup = (ticket) => {
    const status = normalizeStatus(ticket);
    return status === 'färdig' && !isClosedTicket(ticket);
  };

  const isUnhandled = (ticket) => {
    const status = normalizeStatus(ticket);
    return status === 'nytt' && !ticket.assigned_to;
  };

  const matchesSearch = (ticket) => {
    if (searchTerm === '') return true;
    const term = searchTerm.toLowerCase();
    return (
      ticket.customer_name?.toLowerCase().includes(term) ||
      ticket.ticket_number?.toString().includes(searchTerm) ||
      (ticket.device_model && ticket.device_model.toLowerCase().includes(term))
    );
  };

  const { myTickets, unhandledTickets, inProgressTickets, readyTickets, closedTickets } = useMemo(() => {
    const mine = [];
    const unhandled = [];
    const inProgress = [];
    const ready = [];
    const closed = [];

    const myId = currentUser?.id;

    for (const ticket of tickets) {
      if (!matchesSearch(ticket)) continue;

      if (isClosedTicket(ticket)) {
        closed.push(ticket);
      } else if (isReadyForPickup(ticket)) {
        ready.push(ticket);
      } else if (isUnhandled(ticket)) {
        unhandled.push(ticket);
      } else {
        // Active / in progress — also check if it's mine
        if (myId && ticket.assigned_to === myId) {
          mine.push(ticket);
        } else {
          inProgress.push(ticket);
        }
      }
    }

    return { myTickets: mine, unhandledTickets: unhandled, inProgressTickets: inProgress, readyTickets: ready, closedTickets: closed };
  }, [tickets, searchTerm, currentUser?.id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const TableHeader = () => (
    <div className="flex items-center p-4 bg-gray-50 rounded-t-lg font-semibold text-gray-600 text-sm">
      <div className="w-1/12"></div>
      <div className="w-2/12 flex items-center gap-2"><Hash size={14} />{t.register.columnTicketNo}</div>
      <div className="w-3/12 flex items-center gap-2"><User size={14} />{t.register.columnCustomer}</div>
      <div className="w-2/12 flex items-center gap-2"><Smartphone size={14} />{t.register.columnDevice}</div>
      <div className="w-2/12 flex items-center gap-2"><UserCircle size={14} />Tekniker</div>
      <div className="w-2/12 text-right flex items-center gap-2 justify-end"><FileText size={14} />{t.register.columnStatus}</div>
    </div>
  );

  const renderTickets = (list) =>
    list.length > 0 ? (
      list.map((ticket) => (
        <TicketRow
          key={ticket.id}
          ticket={ticket}
          onUpdate={updateTicket}
          onRefreshTickets={refreshTickets}
          onDelete={deleteTicket}
          tenantUsers={tenantUsers}
        />
      ))
    ) : (
      <div className="text-center p-8 text-gray-500">
        <p>{t.register.noTicketsFound}</p>
      </div>
    );

  const SectionHeader = ({ icon: Icon, iconColor, title, count, countColor }) => (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className={iconColor} />
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <span className={`${countColor} text-xs font-medium px-2 py-0.5 rounded-full`}>
        {count}
      </span>
    </div>
  );

  return (
    <div className="bg-slate-50 p-4 sm:p-6 lg:p-8 rounded-b-2xl">
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Input
          type="text"
          placeholder={t.register.searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md bg-white border-gray-300"
        />
        <div className="flex items-center space-x-2 pt-2 sm:pt-0">
          <Checkbox
            id="show-completed"
            checked={showCompleted}
            onCheckedChange={setShowCompleted}
          />
          <Label htmlFor="show-completed" className="text-sm font-medium text-gray-700 cursor-pointer">
            {t.register.showCompleted}
          </Label>
        </div>
      </div>

      {/* My tickets */}
      {myTickets.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={UserCircle} iconColor="text-blue-600" title="Mina ärenden" count={myTickets.length} countColor="bg-blue-100 text-blue-700" />
          <div className="bg-white rounded-lg shadow-sm border border-blue-200">
            <TableHeader />
            <div className="p-2">
              {renderTickets(myTickets)}
            </div>
          </div>
        </div>
      )}

      {/* Unhandled tickets */}
      <div className="mb-8">
        <SectionHeader icon={Inbox} iconColor="text-orange-500" title="Ohanterade" count={unhandledTickets.length} countColor="bg-orange-100 text-orange-700" />
        <div className="bg-white rounded-lg shadow-sm border border-orange-200">
          <TableHeader />
          <div className="p-2">
            {renderTickets(unhandledTickets)}
          </div>
        </div>
      </div>

      {/* In progress tickets */}
      {inProgressTickets.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={Wrench} iconColor="text-yellow-600" title="Under reparation" count={inProgressTickets.length} countColor="bg-yellow-100 text-yellow-700" />
          <div className="bg-white rounded-lg shadow-sm border border-yellow-200">
            <TableHeader />
            <div className="p-2">
              {renderTickets(inProgressTickets)}
            </div>
          </div>
        </div>
      )}

      {/* Ready for pickup */}
      {readyTickets.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={PackageCheck} iconColor="text-green-600" title="Klara för upphämtning" count={readyTickets.length} countColor="bg-green-100 text-green-700" />
          <div className="bg-white rounded-lg shadow-sm border border-green-200">
            <TableHeader />
            <div className="p-2">
              {renderTickets(readyTickets)}
            </div>
          </div>
        </div>
      )}

      {/* Completed / closed tickets */}
      {showCompleted && closedTickets.length > 0 && (
        <div className="mb-8">
          <SectionHeader icon={FileText} iconColor="text-gray-500" title="Avslutade ärenden" count={closedTickets.length} countColor="bg-gray-100 text-gray-600" />
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <TableHeader />
            <div className="p-2">
              {renderTickets(closedTickets)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
