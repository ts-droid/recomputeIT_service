import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Printer, CheckCircle } from 'lucide-react';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { useToast } from '@/components/ui/use-toast';
import { useServiceTickets } from '@/hooks/useServiceTickets';
import { printDocuments } from '@/lib/print';
import { ServiceFormFields } from '@/components/service/ServiceFormFields';
import { formTranslations } from '@/lib/formTranslations';

const initialFormData = {
  firstName: '',
  lastName: '',
  phoneCountryCode: '+46',
  phone: '',
  email: '',
  deviceType: '',
  deviceModel: '',
  problemDescription: '',
  additionalNotes: '',
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

export function ServiceForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [disclaimerLanguage, setDisclaimerLanguage] = useState('sv');
  const { toast } = useToast();
  const { addTicket } = useServiceTickets();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const t = formTranslations[disclaimerLanguage] || formTranslations.sv;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
      return;
    }

    const requiredFields = ['firstName', 'lastName', 'phone', 'email', 'deviceType', 'problemDescription'];
    const missingFields = requiredFields.filter(field => !formData[field].trim());

    if (missingFields.length > 0) {
      toast({
        title: t.toast.incompleteTitle,
        description: t.toast.incompleteDescription,
        variant: "destructive"
      });
      return;
    }

    const newTicket = await addTicket({ ...formData, disclaimerLanguage });
    
    if (newTicket) {
      toast({
        title: t.toast.successTitle,
        description: `${t.toast.successDescription} ${newTicket.ticket_number}`,
      });
      
      printDocuments(newTicket, disclaimerLanguage);
      setFormData(initialFormData);
      setDisclaimerAccepted(false);
      setDisclaimerLanguage('sv');
    }
  };

  const handleDisclaimerAccept = (lang) => {
    setDisclaimerAccepted(true);
    setDisclaimerLanguage(lang);
    toast({
      title: t.toast.termsAcceptedTitle,
      description: t.toast.termsAcceptedDescription,
    });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto"
      >
        <div className="bg-white rounded-lg shadow-lg border border-gray-200">
          <form onSubmit={handleSubmit} className="p-8 space-y-8" dir={disclaimerLanguage === 'ar' || disclaimerLanguage === 'ku' ? 'rtl' : 'ltr'}>
            <ServiceFormFields 
              formData={formData} 
              handleInputChange={handleInputChange}
              language={disclaimerLanguage}
              setLanguage={setDisclaimerLanguage}
              t={t}
            />
            
            {disclaimerAccepted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 border border-green-300 rounded-lg p-4"
              >
                <p className="text-green-800 text-sm flex items-center gap-2 font-medium">
                  <CheckCircle className="h-5 w-5 text-green-600"/>
                   {t.termsAcceptedText.replace('{lang}', languageMap[disclaimerLanguage])}
                </p>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex gap-4 pt-6"
            >
              <Button
                type="submit"
                className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Printer className="h-5 w-5" />
                {disclaimerAccepted ? t.submitButton.complete : t.submitButton.continue}
              </Button>
            </motion.div>

            <p className="text-gray-500 text-xs text-center">
              {t.requiredFieldsNotice}
            </p>
          </form>
        </div>
      </motion.div>

      <DisclaimerDialog
        open={showDisclaimer}
        onOpenChange={setShowDisclaimer}
        onAccept={handleDisclaimerAccept}
        language={disclaimerLanguage}
      />
    </>
  );
}
