import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, ChevronRight, User, Smartphone, Mail, Phone, Calendar, Languages, Edit2, ShieldCheck, PenLine as FilePenLine, Wrench, DollarSign, Printer, Sparkles, EyeOff, Eye, MessageSquare, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { printFinalReceipt, printDocuments } from '@/lib/print';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { EmailTemplateDialog } from '@/components/service/EmailTemplateDialog';

const statusStyles = {
  "Nytt": "bg-blue-100 text-blue-800",
  "Pågående": "bg-yellow-100 text-yellow-800",
  "Väntar på kund": "bg-orange-100 text-orange-800",
  "Kostnadsförslag godkänt": "bg-green-100 text-green-800",
  "Kostnadsförslag nekat": "bg-red-100 text-red-800",
  "Färdig": "bg-green-100 text-green-800",
  "Avslutad": "bg-gray-100 text-gray-800",
};

const languageMap = {
  sv: 'Svenska',
  en: 'English',
  ar: 'العربية',
  es: 'Español',
  fi: 'Suomi',
  ku: 'Kurdî',
  tr: 'Türkçe',
  pl: 'Polski',
  uk: 'Українська'
};

const decisionMap = {
  approved: { label: 'Kund svar: Godkänd', className: 'bg-green-100 text-green-800 border-green-300' },
  declined: { label: 'Kund svar: Nekad', className: 'bg-red-100 text-red-800 border-red-300' },
  pending: { label: 'Kund svar: Väntar bedömning', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  unknown: { label: 'Kund svar: Oklart svar', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
};

const channelLabel = (channel) => {
  if (!channel) return 'okänd kanal';
  if (channel === 'sms+email') return 'SMS + e-post';
  if (channel === 'sms') return 'SMS';
  if (channel === 'email') return 'E-post';
  return channel;
};

const formatActionChecklist = (text = '') => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
    );

  const deduped = [];
  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (!deduped.some((item) => item.toLowerCase() === normalized)) {
      deduped.push(line.replace(/^[-*•]\s*/, ''));
    }
  }
  return deduped.map((item) => `- ${item}`).join('\n');
};

const cleanChatBody = (body = '') => {
  const text = String(body || '').replace(/\r/g, '').trim();
  if (!text) return '';

  const lines = text.split('\n');
  const cleaned = [];

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (!trimmed) {
      cleaned.push(line);
      continue;
    }

    if (trimmed.startsWith('>')) break;
    if (/^on .+wrote:$/i.test(trimmed)) break;
    if (/^den .+skrev:$/i.test(trimmed)) break;
    if (/^(from:|från:|sent:|skickat:|to:|till:|subject:|ämne:)/i.test(trimmed)) break;
    if (lower.includes('recompute_reply_start') || lower.includes('svc_reply_start')) break;
    if (lower.includes('svc_outbound_start') || lower.includes('svc_outbound_end')) continue;
    if (lower.includes('recompute_outbound_start') || lower.includes('recompute_outbound_end')) continue;
    if (trimmed === '----------<>----------') continue;
    if (lower.includes('svara ovanför denna linje')) break;
    if (lower.includes('reply above this line')) break;

    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const TicketRow = ({ ticket, onUpdate, onRefreshTickets }) => {
  const { role, token } = useSupabaseAuth();
  const canEdit = role !== 'base';
  const [isOpen, setIsOpen] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [plannedActions, setPlannedActions] = useState('');
  const [costProposal, setCostProposal] = useState('');
  const [workDoneSummary, setWorkDoneSummary] = useState('');
  const [finalCost, setFinalCost] = useState('');
  const [currentDiagnosis, setCurrentDiagnosis] = useState(null);

  // Track which fields the user is actively editing ("dirty") so that
  // polling refreshes don't overwrite unsaved input.
  const dirtyFieldsRef = React.useRef(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSendingManual, setIsSendingManual] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [isStandardizingActions, setIsStandardizingActions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const { toast } = useToast();
  const customerDecision = decisionMap[ticket.last_customer_decision] || null;
  const hasNewCustomerMessage = Boolean(ticket.has_new_customer_message);
  const canCloseWithoutAction =
    ticket.status === 'Kostnadsförslag nekat' || ticket.last_customer_decision === 'declined';
  const hasSentCostProposal = Boolean(
    ticket.cost_proposal && (
      ticket.status === 'Väntar på kund' ||
      ticket.status === 'Kostnadsförslag godkänt' ||
      ticket.status === 'Kostnadsförslag nekat' ||
      ticket.last_customer_decision
    )
  );
  const [showUpdateProposal, setShowUpdateProposal] = useState(false);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages]
  );
  const chatMessages = useMemo(
    () =>
      sortedMessages.filter(
        (msg) => (msg.body && String(msg.body).trim()) || (msg.subject && String(msg.subject).trim())
      ),
    [sortedMessages]
  );
  const customerFirstName = useMemo(() => {
    const full = String(ticket.customer_name || '').trim();
    if (!full) return 'Kund';
    const [first] = full.split(/\s+/);
    return first || 'Kund';
  }, [ticket.customer_name]);
  const latestInboundMessage = useMemo(
    () => [...messages].find((msg) => msg.direction === 'inbound' && (msg.body || msg.subject)),
    [messages]
  );

  useEffect(() => {
    const dirty = dirtyFieldsRef.current;
    if (!dirty.has('planned_actions'))  setPlannedActions(ticket.planned_actions || '');
    if (!dirty.has('cost_proposal'))    setCostProposal(ticket.cost_proposal || '');
    if (!dirty.has('work_done_summary')) setWorkDoneSummary(ticket.work_done_summary || '');
    if (!dirty.has('final_cost'))       setFinalCost(ticket.final_cost || '');
    if (!dirty.has('internal_notes'))   setInternalNotes(ticket.internal_notes || '');
    setCurrentDiagnosis(ticket.diagnosis || null);
    setComposeSubject(`Re: Ärende #${ticket.ticket_number}`);
  }, [ticket]);

  const hasLoadedMessagesRef = React.useRef(false);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    if (!hasLoadedMessagesRef.current) setLoadingMessages(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticket.id}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Kunde inte hämta kommunikationslogg.');
      const data = await response.json();
      setMessages(Array.isArray(data) ? data : []);
      hasLoadedMessagesRef.current = true;
    } catch (error) {
      console.error(error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [API_BASE_URL, ticket.id, token]);

  const prevMessageCountRef = React.useRef(0);

  const pollMessages = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      const newMessages = Array.isArray(data) ? data : [];
      setMessages(newMessages);

      // Only refresh ticket data when a new message has arrived
      if (newMessages.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
        onRefreshTickets?.();
      }
      prevMessageCountRef.current = newMessages.length;
    } catch {
      // silent — polling failure is not critical
    }
  }, [API_BASE_URL, ticket.id, token, onRefreshTickets]);

  useEffect(() => {
    if (isOpen) {
      loadMessages().then(() => {
        prevMessageCountRef.current = messages.length;
      });

      const pollInterval = window.setInterval(pollMessages, 15000);
      return () => window.clearInterval(pollInterval);
    }
    return undefined;
  }, [isOpen, loadMessages, pollMessages]);

  const handleSendManualEmail = async () => {
    if (!canEdit) return;
    if (!composeBody.trim()) {
      toast({ title: 'Meddelandetext saknas', variant: 'destructive' });
      return;
    }
    setIsSendingManual(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: 'email',
          subject: composeSubject,
          body: composeBody,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Kunde inte skicka meddelandet.');
      }
      setComposeBody('');
      setMessages((prev) => [payload, ...prev]);
      toast({ title: 'Skickat', description: 'Meddelandet skickades till kunden.' });
    } catch (error) {
      toast({
        title: 'Kunde inte skicka',
        description: error?.message || 'Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingManual(false);
    }
  };

  const handleGenerateAiSuggestion = async () => {
    if (!canEdit) return;
    setIsGeneratingSuggestion(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticket.id}/messages/ai-suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draft: composeBody,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Kunde inte skapa AI-förslag.');
      }
      setComposeBody(payload?.suggestion || '');
      toast({
        title: 'AI-förslag klart',
        description: `Förslaget är anpassat till kundens språk (${payload?.language || ticket.disclaimer_language}).`,
      });
    } catch (error) {
      toast({
        title: 'AI-förslag misslyckades',
        description: error?.message || 'Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const markDirty = (field) => dirtyFieldsRef.current.add(field);
  const clearDirty = (field) => dirtyFieldsRef.current.delete(field);

  const handleFieldUpdate = (field, value) => {
    clearDirty(field);
    if (ticket[field] !== value) {
      onUpdate(ticket.id, { [field]: value });
      let title = '';
      if(field === 'internal_notes') title = 'Anteckningar sparade';
      if(field === 'work_done_summary') title = 'Åtgärder sparade';
      if(field === 'final_cost') title = 'Kostnad sparad';

      if (title) {
        toast({ title: title, description: `Ärende #${ticket.ticket_number} har uppdaterats.` });
      }
    }
  };

  const standardizePlannedActions = async (text) => {
    const source = String(text || '').trim();
    if (!source) return '';

    setIsStandardizingActions(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/${ticket.id}/actions/standardize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planned_actions: source }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Kunde inte standardisera åtgärder.');
      }
      return payload?.standardized_actions || source;
    } catch (error) {
      return formatActionChecklist(source) || source;
    } finally {
      setIsStandardizingActions(false);
    }
  };

  const handleApprovalChange = async (checked) => {
    setIsApproving(true);
    const newStatus = checked ? 'Kostnadsförslag godkänt' : 'Väntar på kund';
    const sourceActions = String(plannedActions || ticket.planned_actions || currentDiagnosis || ticket.diagnosis || '').trim();

    if (checked) {
        toast({ title: "Godkänner...", description: "Vi fyller i utförda åtgärder och uppdaterar ärendet." });
        const copiedWorkDone =
          !workDoneSummary.trim() && sourceActions ? await standardizePlannedActions(sourceActions) : workDoneSummary;
        const resolvedFinalCost = String(finalCost || costProposal || ticket.cost_proposal || '').trim();

        const updates = {
            cost_proposal_approved: true,
            status: newStatus,
            work_done_summary: copiedWorkDone,
            final_cost: resolvedFinalCost,
        };
        
        const updatedTicket = await onUpdate(ticket.id, updates);
        
        if (updatedTicket) {
            setWorkDoneSummary(updatedTicket.work_done_summary || '');
            setFinalCost(updatedTicket.final_cost || '');
            setCurrentDiagnosis(updatedTicket.diagnosis || sourceActions || null);
            toast({ title: "Kostnadsförslag godkänt!", description: `Utförda åtgärder och slutlig kostnad är nu ifyllda men kan fortfarande justeras manuellt.` });
        }

    } else {
        await onUpdate(ticket.id, { cost_proposal_approved: checked, status: newStatus });
        toast({ 
            title: "Status uppdaterad", 
            description: `Status för ärende #${ticket.ticket_number} har ändrats till "${newStatus}".` 
        });
    }
    setIsApproving(false);
  };

  const handleNotify = async (templateType) => {
    if (!canEdit) {
      toast({
        title: "Behörighet saknas",
        description: "Du har inte behörighet att uppdatera ärenden.",
        variant: "destructive",
      });
      return;
    }

    if (!ticket.customer_email && !ticket.customer_phone) {
      toast({
        title: "Kontaktuppgift saknas",
        description: "Kan inte meddela kund eftersom varken telefonnummer eller e-postadress är registrerad.",
        variant: "destructive",
      });
      return;
    }

    if (templateType === 'kostnadsforslag' || templateType === 'kostnadsforslag_uppdatering') {
      clearDirty('planned_actions');
      clearDirty('cost_proposal');
      await onUpdate(ticket.id, {
        planned_actions: plannedActions || '',
        cost_proposal: costProposal || '',
      });
    }

    const newStatus = templateType === 'reparationFardig' ? 'Färdig' : 'Väntar på kund';
    if (ticket.status !== newStatus) {
      await onUpdate(ticket.id, { status: newStatus });
    }

    setSelectedTemplateType(templateType);
    setIsDialogOpen(true);
  };


  const handleFinalizeTicket = async () => {
    if (!workDoneSummary || !finalCost) {
      toast({
        title: "Information saknas",
        description: "Fyll in 'Utförda åtgärder' och 'Slutlig kostnad' innan du kan avsluta ärendet.",
        variant: "destructive",
      });
      return;
    }

    const language = ticket.disclaimer_language || 'sv';
    const ticketWithFinalCost = { ...ticket, final_cost: finalCost, work_done_summary: workDoneSummary };
    
    setIsProcessing(true);
    toast({ title: "Skapar kvitto...", description: "Förbereder slutgiltigt kvitto." });

    try {
      let summaryForReceipt = workDoneSummary;
      if (language !== 'sv' && workDoneSummary?.trim()) {
        const translateResponse = await fetch(
          `${API_BASE_URL}/api/tickets/${ticket.id}/actions/translate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ text: workDoneSummary, language }),
          }
        );
        const translatePayload = await translateResponse.json().catch(() => ({}));
        if (translateResponse.ok && translatePayload?.translated_text) {
          summaryForReceipt = translatePayload.translated_text;
        }
      }

      const didOpenPrint = await printFinalReceipt(
        { ...ticketWithFinalCost, work_done_summary: workDoneSummary },
        summaryForReceipt,
        language
      );
      if (!didOpenPrint) {
        throw new Error('Utskriftsfönster blockerades.');
      }

      await onUpdate(ticket.id, { status: 'Avslutad', work_done_summary: workDoneSummary });

      toast({
        title: "Ärende avslutat!",
        description: `Kvitto visat och ärende #${ticket.ticket_number} markerat som avslutat.`,
      });

    } catch (error) {
      console.error("Error finalizing ticket:", error);
      toast({
        title: "Ett fel uppstod",
        description: "Kunde inte skapa kvitto. Försök igen.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseWithoutAction = async () => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `Avsluta ärende #${ticket.ticket_number} utan åtgärd?\nDetta markerar ärendet som Avslutad.`
    );
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await onUpdate(ticket.id, {
        status: 'Avslutad',
        work_done_summary: workDoneSummary || 'Avslutad utan åtgärd (kostnadsförslag nekat).',
      });
      toast({
        title: 'Ärende avslutat',
        description: `Ärende #${ticket.ticket_number} avslutades utan åtgärd.`,
      });
    } catch (error) {
      toast({
        title: 'Kunde inte avsluta ärendet',
        description: error?.message || 'Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReprint = () => {
    printDocuments(ticket, ticket.disclaimer_language);
    toast({
      title: "Utskrift skapad",
      description: `Inlämningskvitto för ärende #${ticket.ticket_number} har skapats.`,
    });
  };

  const handleToggleHidden = () => {
    const newHiddenState = !ticket.is_hidden;
    onUpdate(ticket.id, { is_hidden: newHiddenState });
    toast({
      title: newHiddenState ? "Ärende dolt" : "Ärende synligt",
      description: `Ärende #${ticket.ticket_number} är nu ${newHiddenState ? 'dolt' : 'synligt'} i listan.`,
    });
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`bg-white rounded-lg shadow-md border border-gray-200 mb-3 ${ticket.is_hidden ? 'opacity-60 bg-gray-50' : ''}`}
    >
      <div 
        className="flex items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-1/12 text-gray-500">
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
        <div className="w-2/12 font-semibold text-gray-800">#{ticket.ticket_number}</div>
        <div className="w-3/12 text-gray-700">{ticket.customer_name}</div>
        <div className="w-3/12 text-gray-600">{ticket.device_type}</div>
        <div className="w-3/12 text-right flex items-center gap-2 justify-end">
          {hasNewCustomerMessage && (
            <Badge className="bg-blue-100 text-blue-800 border border-blue-200 font-medium">
              <MessageSquare size={12} className="mr-1" />
              Nytt meddelande
            </Badge>
          )}
          <Badge className={`${statusStyles[ticket.status] || statusStyles['Nytt']} font-medium`}>{ticket.status}</Badge>
        </div>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-50/70 p-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-8">

              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2"><User size={16} />Kundinformation</h3>
                    <p className="text-sm text-gray-600 flex items-center gap-2"><Mail size={14} /> {ticket.customer_email || 'Ej angiven'}</p>
                    <p className="text-sm text-gray-600 flex items-center gap-2"><Phone size={14} /> {ticket.customer_phone || 'Ej angiven'}</p>
                    <p className="text-sm text-gray-600">
                      <strong className="font-medium">Primär kontakt:</strong>{' '}
                      {ticket.preferred_contact_channel === 'sms'
                        ? 'SMS'
                        : ticket.preferred_contact_channel === 'email'
                          ? 'E-post'
                          : 'Automatisk'}
                    </p>
                    <p className="text-sm text-gray-600 flex items-center gap-2"><Languages size={14} /> Godkännande: {languageMap[ticket.disclaimer_language] || ticket.disclaimer_language}</p>
                    <p className="text-sm text-gray-600 flex items-center gap-2"><Calendar size={14} /> Skapad: {new Date(ticket.created_at).toLocaleString('sv-SE')}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Smartphone size={16} />Enhetsinformation</h3>
                    <p className="text-sm text-gray-700 font-medium">{ticket.device_model || 'Modell ej angiven'}</p>
                    <p className="text-sm text-gray-600"><strong className="font-medium">Felbeskrivning:</strong> {ticket.issue_description}</p>
                    {ticket.additional_notes && <p className="text-sm text-gray-600"><strong className="font-medium">Anteckningar från kund:</strong> {ticket.additional_notes}</p>}
                    {currentDiagnosis && <p className="text-sm text-gray-600 mt-2 p-2 bg-yellow-50 border-l-4 border-yellow-300"><strong className="font-medium">Senaste diagnos:</strong> {currentDiagnosis}</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
                  <p className="font-semibold text-sm text-gray-800">Kommunikation</p>
                  <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1 rounded-lg border border-gray-200 bg-[#f5efe5] p-3">
                    {loadingMessages ? (
                      <p className="text-xs text-gray-500">Laddar...</p>
                    ) : chatMessages.length === 0 ? (
                      <p className="text-xs text-gray-500">Ingen kommunikation loggad ännu.</p>
                    ) : (
                      chatMessages.map((msg) => (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => setSelectedMessage(msg)}
                          className={`flex w-full ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[86%] rounded-xl p-3 text-xs border shadow-sm text-left ${
                            msg.direction === 'outbound'
                              ? 'bg-green-100 border-green-200 text-gray-800 rounded-br-md'
                              : 'bg-white border-gray-200 text-gray-800 rounded-bl-md'
                          }`}>
                          <p className="font-semibold text-gray-700">
                            {msg.direction === 'outbound' ? (msg.sender_display_name || msg.sender_user || import.meta.env.VITE_BRAND_NAME || 're:Compute-IT') : customerFirstName} · {channelLabel(msg.channel)}
                          </p>
                          {msg.subject && <p className="text-gray-700 mt-1 break-words">{msg.subject}</p>}
                          {msg.body && <p className="text-gray-700 mt-1 break-words whitespace-pre-wrap">{cleanChatBody(msg.body) || msg.body}</p>}
                          {msg.chat_internal_translation && (
                            <p className="text-gray-500 mt-2 break-words whitespace-pre-wrap border-t border-gray-200 pt-2">
                              ({msg.chat_internal_translation})
                            </p>
                          )}
                          <p className="text-gray-500 mt-2 text-[11px]">
                            {new Date(msg.created_at).toLocaleString('sv-SE')}
                            {msg.sender_user ? ` · ${msg.sender_display_name || msg.sender_user}` : ''}
                          </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {canEdit && (
                    <div className="space-y-2 border-t pt-3">
                      <Input
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        placeholder="Ämne"
                        className="bg-white"
                      />
                      <div className="flex gap-2 items-end">
                        <Textarea
                          value={composeBody}
                          onChange={(e) => setComposeBody(e.target.value)}
                          placeholder="Skriv meddelande till kunden..."
                          className="bg-white min-h-[70px]"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={handleGenerateAiSuggestion}
                          disabled={isGeneratingSuggestion}
                          className="h-10 w-10 shrink-0"
                          title="Skapa AI-förslag"
                        >
                          {isGeneratingSuggestion ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        </Button>
                        <Button
                          size="icon"
                          onClick={handleSendManualEmail}
                          disabled={isSendingManual || (!ticket.customer_email && !ticket.customer_phone)}
                          className="h-10 w-10 shrink-0"
                          title="Skicka"
                        >
                          {isSendingManual ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                 <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Edit2 size={16} />Hantering</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor={`diagnosis-${ticket.id}`} className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                      <Wrench size={16} />
                      Planerade åtgärder
                    </Label>
                    <Textarea
                      id={`planned-actions-${ticket.id}`}
                      value={plannedActions}
                      onChange={(e) => { markDirty('planned_actions'); setPlannedActions(e.target.value); }}
                      onBlur={() => handleFieldUpdate('planned_actions', plannedActions)}
                      placeholder="Beskriv planerade åtgärder..."
                      className="bg-white min-h-[100px]"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cost-proposal-${ticket.id}`} className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                      <DollarSign size={16} />
                      Kostnadsförslag (kr)
                    </Label>
                    {hasSentCostProposal && !showUpdateProposal ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                          <DollarSign size={14} className="text-purple-600" />
                          <span className="text-sm font-medium text-purple-800">{ticket.cost_proposal} kr</span>
                          <span className="text-xs text-purple-500 ml-auto">Skickat</span>
                        </div>
                        {customerDecision && (
                          <div className={`text-xs px-2 py-1 rounded border ${customerDecision.className}`}>
                            {customerDecision.label}
                          </div>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-500/50 text-purple-700 hover:bg-purple-50 gap-2 w-full"
                            onClick={() => setShowUpdateProposal(true)}
                          >
                            <DollarSign size={16} /> Uppdatera kostnadsförslag
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <Input
                          id={`cost-proposal-${ticket.id}`}
                          value={costProposal}
                          onChange={(e) => { markDirty('cost_proposal'); setCostProposal(e.target.value); }}
                          onBlur={() => handleFieldUpdate('cost_proposal', costProposal)}
                          placeholder="t.ex. 1299"
                          className="bg-white"
                          disabled={!canEdit}
                        />
                        {showUpdateProposal && ticket.cost_proposal !== costProposal && costProposal && (
                          <p className="text-xs text-gray-500 mt-1">
                            Tidigare: {ticket.cost_proposal} kr → Nytt: {costProposal} kr
                          </p>
                        )}
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-500/50 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800 gap-2"
                            onClick={() => {
                              handleNotify(hasSentCostProposal ? 'kostnadsforslag_uppdatering' : 'kostnadsforslag');
                              setShowUpdateProposal(false);
                            }}
                            disabled={(!ticket.customer_email && !ticket.customer_phone) || !canEdit}
                          >
                            <DollarSign size={16} />
                            {hasSentCostProposal ? 'Skicka uppdaterat förslag' : 'Skicka kostnadsförslag'}
                          </Button>
                          {showUpdateProposal && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-500"
                              onClick={() => setShowUpdateProposal(false)}
                            >
                              Avbryt
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                   <div className={`p-3 rounded-lg transition-colors ${ticket.cost_proposal_approved ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-200'} border`}>
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id={`cost-approved-${ticket.id}`} 
                        checked={!!ticket.cost_proposal_approved}
                        onCheckedChange={handleApprovalChange}
                        disabled={isApproving || isStandardizingActions || !canEdit}
                        className="h-5 w-5"
                      />
                      <Label htmlFor={`cost-approved-${ticket.id}`} className={`text-base font-semibold flex items-center gap-2 cursor-pointer ${ticket.cost_proposal_approved ? 'text-green-800' : 'text-gray-700'}`}>
                        {isApproving || isStandardizingActions ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                        Kostnadsförslag godkänt
                      </Label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                     <div>
                        <Label htmlFor={`work-done-${ticket.id}`} className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                           <Wrench size={16} />
                           Utförda åtgärder
                        </Label>
                        <Textarea
                          id={`work-done-${ticket.id}`}
                          value={workDoneSummary}
                          onChange={(e) => { markDirty('work_done_summary'); setWorkDoneSummary(e.target.value); }}
                          onBlur={() => handleFieldUpdate('work_done_summary', workDoneSummary)}
                          placeholder="Beskriv vad som har gjorts..."
                          className="bg-white min-h-[100px]"
                          disabled={!canEdit}
                        />
                      </div>
                       <div>
                        <Label htmlFor={`final-cost-${ticket.id}`} className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                           <DollarSign size={16} />
                           Slutlig kostnad (kr)
                        </Label>
                       <Input
                          id={`final-cost-${ticket.id}`}
                          value={finalCost}
                          onChange={(e) => { markDirty('final_cost'); setFinalCost(e.target.value); }}
                          onBlur={() => handleFieldUpdate('final_cost', finalCost)}
                          placeholder="t.ex. 1299"
                          className="bg-white"
                          disabled={!canEdit}
                        />
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-500/50 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 gap-2"
                            onClick={() => handleNotify('reparationFardig')}
                            disabled={(!ticket.customer_email && !ticket.customer_phone) || !canEdit}
                          >
                            <Mail size={16} /> Meddela att reparation är klar
                          </Button>
                        </div>
                      </div>
                  </div>

                  <div>
                    <Label htmlFor={`internal-notes-${ticket.id}`} className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                       <FilePenLine size={16} />
                       Interna anteckningar
                    </Label>
                    <Textarea
                      id={`internal-notes-${ticket.id}`}
                      value={internalNotes}
                      onChange={(e) => { markDirty('internal_notes'); setInternalNotes(e.target.value); }}
                      onBlur={() => handleFieldUpdate('internal_notes', internalNotes)}
                      placeholder="Anteckningar endast för personal..."
                      className="bg-white min-h-[100px]"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="border-t border-gray-200 pt-4 mt-4 space-y-3">
                    <Button 
                      onClick={handleFinalizeTicket} 
                      disabled={isProcessing || ticket.status === 'Avslutad' || !canEdit}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isProcessing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Printer size={16} className="mr-2" />}
                      {ticket.status === 'Avslutad' ? 'Ärende Avslutat' : 'Lämna ut & Skriv ut kvitto'}
                    </Button>
                    <p className="text-xs text-center text-gray-500 mt-2 flex items-center justify-center gap-1">
                      <Sparkles size={12} className="text-purple-500" /> Skapar ett tydligt kvitto för kunden.
                    </p>
                    {canCloseWithoutAction && ticket.status !== 'Avslutad' && (
                      <Button
                        onClick={handleCloseWithoutAction}
                        disabled={isProcessing || !canEdit}
                        className="w-full bg-red-600 hover:bg-red-700 text-white"
                      >
                        Avsluta utan åtgärd
                      </Button>
                    )}
                    <div className="flex gap-3">
                      <Button 
                        onClick={handleReprint} 
                        variant="outline"
                        className="w-full"
                      >
                        <Printer size={16} className="mr-2" /> Skriv ut igen
                      </Button>
                      <Button 
                        onClick={handleToggleHidden} 
                        variant="outline"
                        className="w-full"
                        disabled={!canEdit}
                      >
                        {ticket.is_hidden ? <Eye size={16} className="mr-2" /> : <EyeOff size={16} className="mr-2" />}
                        {ticket.is_hidden ? 'Visa' : 'Dölj'}
                      </Button>
                    </div>
                  </div>
                </div>
                <EmailTemplateDialog
                  open={isDialogOpen}
                  onOpenChange={setIsDialogOpen}
                  ticket={ticket}
                  templateType={selectedTemplateType}
                  onUpdate={onUpdate}
                />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Meddelandedetaljer</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-3 text-sm">
              <p className="text-gray-600">
                {selectedMessage.direction === 'outbound' ? 'Utgående' : 'Inkommande'} · {channelLabel(selectedMessage.channel)} · {new Date(selectedMessage.created_at).toLocaleString('sv-SE')}
              </p>
              {selectedMessage.subject && (
                <div>
                  <p className="font-semibold text-gray-800">Ämne</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{selectedMessage.subject}</p>
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-800">Text</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{cleanChatBody(selectedMessage.body) || selectedMessage.body || '(Ingen brödtext mottagen i webhook)'}</p>
                {selectedMessage.chat_internal_translation && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-gray-500 border-t border-gray-200 pt-2">
                    ({selectedMessage.chat_internal_translation})
                  </p>
                )}
              </div>
              {selectedMessage.parse_confidence && (
                <p className="text-xs text-gray-500">
                  Parser: {selectedMessage.parse_method || 'okänd'} · Säkerhet: {selectedMessage.parse_confidence}
                </p>
              )}
              {selectedMessage.raw_body && selectedMessage.raw_body !== selectedMessage.body && (
                <div>
                  <p className="font-semibold text-gray-800">Originalmail (rå text)</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-gray-600">{selectedMessage.raw_body}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
