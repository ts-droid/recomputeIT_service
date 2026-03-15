import React, { useState, useMemo } from 'react';
import { useServiceTickets } from '@/hooks/useServiceTickets';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { Loader2, Hash, User, Smartphone, FileText, PackageCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TicketRow } from '@/components/service/TicketRow';

const normalizeStatus = (ticket) =>
  (ticket.status || '').toString().trim().toLowerCase();

export function ServiceRegister() {
  const { tickets, loading, updateTicket, refreshTickets } = useServiceTickets();
  const { t } = useUiLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const isClosedTicket = (ticket) => {
    const status = normalizeStatus(ticket);
    return status === 'avslutad' || Boolean(ticket.closed_at) || Boolean(ticket.picked_up_at);
  };

  const isReadyForPickup = (ticket) => {
    const status = normalizeStatus(ticket);
    return status === 'färdig' && !isClosedTicket(ticket);
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

  const { activeTickets, readyTickets, closedTickets } = useMemo(() => {
    const active = [];
    const ready = [];
    const closed = [];

    for (const ticket of tickets) {
      if (!matchesSearch(ticket)) continue;

      if (isClosedTicket(ticket)) {
        closed.push(ticket);
      } else if (isReadyForPickup(ticket)) {
        ready.push(ticket);
      } else {
        active.push(ticket);
      }
    }

    return { activeTickets: active, readyTickets: ready, closedTickets: closed };
  }, [tickets, searchTerm]);

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
      <div className="w-3/12 flex items-center gap-2"><Smartphone size={14} />{t.register.columnDevice}</div>
      <div className="w-3/12 text-right flex items-center gap-2 justify-end"><FileText size={14} />{t.register.columnStatus}</div>
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
        />
      ))
    ) : (
      <div className="text-center p-8 text-gray-500">
        <p>{t.register.noTicketsFound}</p>
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

      {/* Active tickets */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <TableHeader />
        <div className="p-2">
          {renderTickets(activeTickets)}
        </div>
      </div>

      {/* Ready for pickup */}
      {readyTickets.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <PackageCheck size={18} className="text-green-600" />
            <h3 className="text-lg font-semibold text-gray-800">
              Klara för upphämtning
            </h3>
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {readyTickets.length}
            </span>
          </div>
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
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={18} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-600">
              Avslutade ärenden
            </h3>
            <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
              {closedTickets.length}
            </span>
          </div>
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
