import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const apiFetch = async (path, options) => {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: mergedHeaders,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => ({}));
      const message =
        payload?.details ||
        payload?.error ||
        `Request failed (${response.status})`;
      throw new Error(message);
    }

    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }

  return response.json();
};

export const useServiceTickets = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { session, user, token, loading: authLoading } = useSupabaseAuth();
  const { toast } = useToast();

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      if (!session) {
        setTickets([]);
        return;
      }

      const data = await apiFetch('/api/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTickets(data || []);
    } catch (error) {
      console.error("Failed to load service tickets:", error);
      toast({
        title: "Kunde inte hämta ärenden",
        description: "Ett fel uppstod vid hämtning av data från databasen.",
        variant: "destructive",
      });
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [session, toast, token]);

  useEffect(() => {
    if (!authLoading) {
      loadTickets();
    }
  }, [authLoading, loadTickets]);

  const addTicket = useCallback(async (ticketData) => {
    try {
      const newTicketPayload = {
        customer_name: `${ticketData.firstName} ${ticketData.lastName}`,
        customer_email: ticketData.email,
        customer_phone: ticketData.phone,
        device_type: ticketData.deviceType,
        device_model: ticketData.deviceModel,
        issue_description: ticketData.problemDescription,
        additional_notes: ticketData.additionalNotes,
        disclaimer_language: ticketData.disclaimerLanguage,
        status: 'Nytt',
        user_id: user ? user.id : null,
      };

      const data = await apiFetch('/api/tickets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTicketPayload),
      });

      if (session) {
        loadTickets();
      }
      return data;
    } catch (error) {
      console.error("Error adding ticket:", error);
      toast({
        title: "Kunde inte skapa ärende",
        description: error?.message || "Ett fel uppstod. Försök igen.",
        variant: "destructive",
      });
      return null;
    }
  }, [user, session, loadTickets, toast, token]);
  
  const updateTicket = useCallback(async (ticketId, updates) => {
    try {
      const updatedTicket = await apiFetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });

      setTickets(prevTickets =>
        prevTickets.map(ticket => (ticket.id === ticketId ? updatedTicket : ticket))
      );

      return updatedTicket;
    } catch (error) {
      console.error("Error updating ticket:", error);
      toast({
        title: "Kunde inte uppdatera ärende",
        description: "Ett fel uppstod. Försök igen.",
        variant: "destructive",
      });
      return null;
    }
  }, [toast, token]);
  
  return { tickets, addTicket, loading: loading || authLoading, refreshTickets: loadTickets, updateTicket };
};
