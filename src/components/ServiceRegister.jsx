import React, { useState } from 'react';
import { useServiceTickets } from '@/hooks/useServiceTickets';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { Loader2, Hash, User, Smartphone, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TicketRow } from '@/components/service/TicketRow';

export function ServiceRegister() {
  const { tickets, loading, updateTicket, refreshTickets } = useServiceTickets();
  const { t } = useUiLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const isCompletedTicket = (ticket) => {
    const normalizedStatus = (ticket.status || '').toString().trim().toLowerCase();
    return (
      normalizedStatus === 'färdig' ||
      normalizedStatus === 'avslutad' ||
      Boolean(ticket.closed_at) ||
      Boolean(ticket.picked_up_at)
    );
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = searchTerm === '' ||
      ticket.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticket_number.toString().includes(searchTerm) ||
      (ticket.device_model && ticket.device_model.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (searchTerm.trim()) return true;

    return showCompleted ? isCompletedTicket(ticket) : !isCompletedTicket(ticket);
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center p-4 bg-gray-50 rounded-t-lg font-semibold text-gray-600 text-sm">
          <div className="w-1/12"></div>
          <div className="w-2/12 flex items-center gap-2"><Hash size={14} />{t.register.columnTicketNo}</div>
          <div className="w-3/12 flex items-center gap-2"><User size={14} />{t.register.columnCustomer}</div>
          <div className="w-3/12 flex items-center gap-2"><Smartphone size={14} />{t.register.columnDevice}</div>
          <div className="w-3/12 text-right flex items-center gap-2 justify-end"><FileText size={14} />{t.register.columnStatus}</div>
        </div>
        <div className="p-2">
          {filteredTickets.length > 0 ? (
            filteredTickets.map(ticket => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                onUpdate={updateTicket}
                onRefreshTickets={refreshTickets}
              />
            ))
          ) : (
            <div className="text-center p-12 text-gray-500">
              <p>{t.register.noTicketsFound}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
