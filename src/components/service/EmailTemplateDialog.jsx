import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { generateEmailContent } from '@/lib/emailTemplates';
import { Copy, Check, Send, Globe, Sparkles, Mail } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const translationPlaceholders = {
  sv: 'Beskriv diagnos här...',
  en: 'Describe diagnosis here...',
  ar: 'صف التشخيص هنا...',
  es: 'Describa el diagnóstico aquí...',
  fi: 'Kuvaa diagnoosi täällä...',
  ku: 'Teşhîsê li vir rave bike...',
  tr: 'Teşhisi buraya yazın...',
  pl: 'Opisz diagnozę tutaj...',
  uk: 'Опишіть діагноз тут...',
};

const languages = [
  { code: 'sv', name: 'Svenska' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'es', name: 'Español', },
  { code: 'fi', name: 'Suomi' },
  { code: 'ku', name: 'Kurdî' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'pl', name: 'Polski' },
  { code: 'uk', name: 'Українська' },
];

export const EmailTemplateDialog = ({ open, onOpenChange, ticket, onUpdate, templateType }) => {
  const { token } = useSupabaseAuth();
  const [costProposal, setCostProposal] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [copied, setCopied] = useState(false);
  const [currentLang, setCurrentLang] = useState('sv');
  const [isSending, setIsSending] = useState(false);
  const [previewContent, setPreviewContent] = useState({ subject: '', body: '' });
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const { toast } = useToast();

  const isCostProposal = templateType === 'kostnadsforslag';
  const requireStrictTranslatedPreview = templateType === 'reparationFardig';
  const placeholderText = translationPlaceholders[currentLang] || translationPlaceholders.sv;

  useEffect(() => {
    if (ticket) {
      setCostProposal(ticket.final_cost || '');
      setDiagnosis(ticket.diagnosis || '');
      setCurrentLang(ticket.disclaimer_language || 'sv');
    } else {
      setCostProposal('');
      setDiagnosis('');
      setCurrentLang('sv');
    }
  }, [ticket]);

  const emailContent = useMemo(() => {
    if (!ticket || !templateType) {
      return { subject: '', body: '' };
    }
    
    const tempTicket = {
      ...ticket,
      diagnosis,
      final_cost: costProposal,
    };

    return generateEmailContent(tempTicket, templateType, currentLang);
  }, [ticket, templateType, currentLang, diagnosis, costProposal]);

  useEffect(() => {
    if (!open || !ticket || !templateType || !token) return;

    const run = async () => {
      setIsPreviewLoading(true);
      try {
        const response = await fetch('/api/preview-notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ticketId: ticket.id,
            templateType,
            language: currentLang,
            diagnosis,
            work_done_summary: ticket.work_done_summary || '',
            final_cost: costProposal,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.details || errorData?.error || 'preview failed');
        }

        const data = await response.json();
        setPreviewContent({
          subject: data?.subject || '',
          body: data?.body || '',
        });
        setPreviewError('');
      } catch (error) {
        console.error('Preview generation error:', error);
        setPreviewContent({ subject: '', body: '' });
        setPreviewError(error?.message || 'Kunde inte översätta förhandsvisning.');
      } finally {
        setIsPreviewLoading(false);
      }
    };

    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  }, [open, ticket, templateType, token, currentLang, diagnosis, costProposal]);

  const canFallbackToLocal =
    currentLang === 'sv' || !requireStrictTranslatedPreview || !previewError;
  const effectiveSubject = canFallbackToLocal
    ? (previewContent.subject || emailContent?.subject || '')
    : '';
  const effectiveBody = canFallbackToLocal
    ? (previewContent.body || emailContent?.body || '')
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(effectiveBody);
    setCopied(true);
    toast({
      title: "Kopierat!",
      description: isCostProposal
        ? "Texten för kostnadsförslaget har kopierats till urklipp."
        : "Texten har kopierats till urklipp.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAndApprove = () => {
    handleCopy();
    if (isCostProposal) {
      onUpdate(ticket.id, {
        status: 'Väntar på kund',
        final_cost: costProposal,
        diagnosis: diagnosis, // Save original diagnosis to DB
        disclaimer_language: currentLang,
      });
    }
    onOpenChange(false);
  };

  const sendNotification = async (channel) => {
    if (!ticket || !templateType) return;
    if (templateType === 'kostnadsforslag' && !costProposal) {
      toast({
        title: "Kostnad saknas",
        description: "Ange kostnadsförslag innan du skickar.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      if (templateType === 'kostnadsforslag') {
        await onUpdate(ticket.id, { final_cost: costProposal, diagnosis });
      }

      const endpoint =
        templateType === 'kostnadsforslag' ? '/api/notify/cost-proposal' : '/api/notify/repair-ready';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          channel,
          language: currentLang,
        }),
      });

      if (!response.ok) {
        throw new Error('Send failed');
      }

      const result = await response.json().catch(() => ({}));
      const warningText = Array.isArray(result?.warnings) ? result.warnings.join(' ') : '';
      const sentSms = Boolean(result?.sms_sent);
      const sentEmail = Boolean(result?.email_sent);

      let description = "Skickat till kunden.";
      if (sentSms && sentEmail) {
        description = 'SMS och e-post skickades till kunden.';
      } else if (sentSms) {
        description = 'SMS skickades till kunden.';
      } else if (sentEmail) {
        description = 'E-post skickades till kunden.';
      }
      if (warningText) {
        description = `${description} ${warningText}`.trim();
      }

      toast({
        title: "Skickat!",
        description,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Send notification error:', error);
      toast({
        title: "Kunde inte skicka",
        description: "Kontrollera inställningar och försök igen.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };
  
  const handleFieldUpdate = (field, value) => {
    if (ticket && ticket[field] !== value) {
      onUpdate(ticket.id, { [field]: value });
      let title = '';
      if(field === 'diagnosis') title = 'Diagnos sparad';
      if(field === 'final_cost') title = 'Kostnad sparad';
      
      if(title){
        toast({ title: title, description: `Ärende #${ticket.ticket_number} har uppdaterats.` });
      }
    }
  };

  const handleLanguageChange = (newLang) => {
    setCurrentLang(newLang);
    if (ticket) {
      onUpdate(ticket.id, { disclaimer_language: newLang });
      toast({
        title: "Språk uppdaterat",
        description: `Ärendets språk har ändrats.`
      });
    }
  };

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isCostProposal ? 'Underlag för kostnadsförslag' : 'Meddelande till kund'}
          </DialogTitle>
          <DialogDescription>
            {isCostProposal
              ? 'Granska, kopiera och skicka detta kostnadsförslag till kunden.'
              : 'Granska, kopiera och skicka meddelande om färdig reparation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 my-4">
          <Label htmlFor="language" className="text-gray-700 flex items-center gap-2"><Globe className="h-4 w-4 text-gray-500" />Språk för mall</Label>
          <Select
            id="language"
            name="language"
            value={currentLang}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger className="bg-gray-50 border-gray-300 text-gray-900">
              <SelectValue placeholder="Välj språk..." />
            </SelectTrigger>
            <SelectContent>
              {languages.map(lang => (
                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCostProposal ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
            <div className="space-y-2">
              <Label htmlFor="diagnosis" className="flex items-center gap-2">
                Diagnos 
                {isPreviewLoading && <Sparkles size={16} className="text-purple-500 animate-pulse" />}
              </Label>
               <Textarea
                id="diagnosis"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                onBlur={() => handleFieldUpdate('diagnosis', diagnosis)}
                placeholder={placeholderText}
                className="bg-gray-50 min-h-[120px]"
              />
              <p className="text-xs text-gray-500">
                <Sparkles size={12} className="inline-block mr-1" /> Översättning anpassas vid utskick.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-proposal">Kostnadsförslag (kr)</Label>
              <Input
                id="cost-proposal"
                value={costProposal}
                onChange={(e) => setCostProposal(e.target.value)}
                onBlur={() => handleFieldUpdate('final_cost', costProposal)}
                placeholder="Ange total kostnad inkl. moms"
                className="bg-gray-50"
              />
            </div>
          </div>
        ) : (
          <div className="my-4">
            <p className="text-sm text-gray-600">
              Meddelandet skickas på kundens valda språk till alla tillgängliga kontaktvägar (SMS/e-post).
            </p>
          </div>
        )}

        <div className="bg-gray-100 p-4 rounded-md space-y-4 max-h-80 overflow-y-auto border border-gray-200">
          {previewError && currentLang !== 'sv' && requireStrictTranslatedPreview && (
            <p className="text-sm text-red-600">
              Förhandsvisning kunde inte översättas: {previewError}
            </p>
          )}
          <div>
            <Label className="font-semibold text-gray-800">Ämne</Label>
            <p className="text-sm bg-white p-2 rounded-md mt-1">{effectiveSubject}</p>
          </div>
          <div>
            <Label className="font-semibold text-gray-800">Meddelande</Label>
            <div className="text-sm bg-white p-3 rounded-md mt-1 whitespace-pre-wrap">{effectiveBody}</div>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            Kopiera text
          </Button>
          <Button onClick={handleCopyAndApprove} className="bg-green-600 hover:bg-green-700">
            <Send className="mr-2 h-4 w-4" />
            Godkänn & Kopiera
          </Button>
          <Button
            onClick={() => sendNotification('auto')}
            className="bg-slate-800 hover:bg-slate-900"
            disabled={isSending || (!ticket?.customer_phone && !ticket?.customer_email)}
          >
            <Mail className="mr-2 h-4 w-4" />
            Skicka till kund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
