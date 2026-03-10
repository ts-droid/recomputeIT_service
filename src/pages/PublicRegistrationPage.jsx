import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useServiceTickets } from '@/hooks/useServiceTickets';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Languages, User, Smartphone, AlertCircle, Info, FileText } from 'lucide-react';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { downloadServiceTicketPdf, printDocuments } from '@/lib/print';
import { formTranslations } from '@/lib/formTranslations';
import { getDisplayVersion } from '@/lib/version';
import { countryDialCodes } from '@/lib/countryDialCodes';

const APP_VERSION = getDisplayVersion();

const PublicHeader = () => (
  <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-40">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-20">
        <Link to="/" className="flex-shrink-0">
          <img className="h-10 w-auto" src="https://horizons-cdn.hostinger.com/66ce8f1a-1805-4a09-9f17-041a9f68d79f/f39487d84caba3a65608a9652e97d727.jpg" alt="re:Compute-IT Logo" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5">
            v{APP_VERSION}
          </span>
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-2">
            Personal <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  </header>
);

const SectionHeader = ({ icon, title }) => (
  <div className="flex items-center gap-3 mb-4">
    {icon}
    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
  </div>
);

const deviceTypes = {
    sv: ['Smartphone', 'Surfplatta', 'Bärbar dator', 'Stationär dator', 'Smartwatch', 'Hörlurar', 'Spelkonsol', 'TV', 'Annat'],
    en: ['Smartphone', 'Tablet', 'Laptop', 'Desktop', 'Smartwatch', 'Headphones', 'Game Console', 'TV', 'Other'],
    ar: ['هاتف ذكي', 'جهاز لوحي', 'كمبيوتر محمول', 'كمبيوتر مكتبي', 'ساعة ذكية', 'سماعات رأس', 'وحدة تحكم ألعاب', 'تلفزيون', 'آخر'],
    es: ['Smartphone', 'Tableta', 'Portátil', 'Ordenador de sobremesa', 'Smartwatch', 'Auriculares', 'Consola de videojuegos', 'TV', 'Otro'],
    fi: ['Älypuhelin', 'Tabletti', 'Kannettava tietokone', 'Pöytätietokone', 'Älykello', 'Kuulokkeet', 'Pelikonsoli', 'TV', 'Muu'],
    ku: ['Smartphone', 'Tablet', 'Laptop', 'Desktop', 'Smartwatch', 'Guhdar', 'Konsolê Lîstikê', 'TV', 'Yên din'],
    tr: ['Akıllı Telefon', 'Tablet', 'Dizüstü Bilgisayar', 'Masaüstü Bilgisayar', 'Akıllı Saat', 'Kulaklık', 'Oyun Konsolu', 'TV', 'Diğer'],
    pl: ['Smartfon', 'Tablet', 'Laptop', 'Komputer stacjonarny', 'Smartwatch', 'Słuchawki', 'Konsola do gier', 'Telewizor', 'Inne'],
    uk: ['Смартфон', 'Планшет', 'Ноутбук', 'Настільний комп\'ютер', 'Смарт-годинник', 'Навушники', 'Ігрова консоль', 'Телевізор', 'Інше'],
};

export default function PublicRegistrationPage() {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_lastname: '',
    customer_phone_country_code: '+46',
    customer_email: '',
    customer_phone: '',
    preferred_contact_channel: '',
    device_type: '',
    device_model: '',
    issue_description: '',
    additional_notes: '',
  });
  const [language, setLanguage] = useState('sv');
  const [loading, setLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const { toast } = useToast();
  const { addTicket } = useServiceTickets();
  const { session, token } = useSupabaseAuth();

  const t = formTranslations[language] || formTranslations.sv;
  const currentDeviceTypes = deviceTypes[language] || deviceTypes.sv;
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      const hasPhone = Boolean(next.customer_phone?.trim());
      const hasEmail = Boolean(next.customer_email?.trim());
      if (hasPhone && !hasEmail) next.preferred_contact_channel = 'sms';
      if (hasEmail && !hasPhone) next.preferred_contact_channel = 'email';
      if (!hasPhone && !hasEmail) next.preferred_contact_channel = '';
      if (hasPhone && hasEmail && !['sms', 'email'].includes(next.preferred_contact_channel)) {
        next.preferred_contact_channel = '';
      }
      return next;
    });
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    // Reset device type if it's not in the new language's list
    setFormData(prev => ({ ...prev, device_type: '' }));
  };
  
  const validateForm = () => {
    const { customer_name, customer_lastname, customer_phone, customer_email, preferred_contact_channel, device_type, issue_description } = formData;
    const hasPhone = Boolean(customer_phone?.trim());
    const hasEmail = Boolean(customer_email?.trim());
    const hasAnyContact = hasPhone || hasEmail;
    const hasPreferredWhenBoth = !(hasPhone && hasEmail) || ['sms', 'email'].includes(preferred_contact_channel);

    if (!customer_name || !customer_lastname || !device_type || !issue_description || !hasAnyContact || !hasPreferredWhenBoth) {
      toast({
        title: t.toast.incompleteTitle,
        description: !hasAnyContact
          ? (t.toast.missingContactDescription || 'Ange minst telefonnummer eller e-postadress.')
          : !hasPreferredWhenBoth
            ? (t.toast.missingPrimaryContactDescription || 'Välj primär kontaktväg (SMS eller e-post).')
            : t.toast.incompleteDescription,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setShowDisclaimer(true);
    }
  };

  const handleDisclaimerAccept = async (lang) => {
    setLoading(true);

    try {
      const newTicket = await addTicket({
        firstName: formData.customer_name,
        lastName: formData.customer_lastname,
        email: formData.customer_email,
        phone: formData.customer_phone,
        phoneCountryCode: formData.customer_phone_country_code,
        preferredContactChannel: formData.preferred_contact_channel,
        deviceType: formData.device_type,
        deviceModel: formData.device_model,
        problemDescription: formData.issue_description,
        additionalNotes: formData.additional_notes,
        disclaimerLanguage: lang,
      });

      if (!newTicket) {
        return;
      }
      
      downloadServiceTicketPdf(newTicket, lang);
      printDocuments(newTicket, lang);

      toast({
        title: t.toast.successTitle,
        description: `${t.toast.successDescription} #${newTicket.ticket_number}. ${t.toast.printStarted} PDF skapad.`,
      });
      
      setFormData({
        customer_name: '', customer_lastname: '', customer_phone_country_code: '+46', customer_email: '', customer_phone: '',
        preferred_contact_channel: '',
        device_type: '', device_model: '', issue_description: '', additional_notes: '',
      });
      setLanguage('sv');

    } catch (error) {
      console.error('Error submitting service ticket:', error);
      toast({
        title: t.toast.errorTitle,
        description: error?.message || t.toast.errorDescription,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <PublicHeader />
      <main className="container mx-auto px-4 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{t.public.title}</h1>
            <p className="mt-3 text-lg text-gray-600">{t.public.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg space-y-8" dir={language === 'ar' || language === 'ku' ? 'rtl' : 'ltr'}>
            
            <div>
              <SectionHeader icon={<Languages className="text-gray-400" />} title={t.languageLabel} />
              <Select onValueChange={handleLanguageChange} value={language}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sv">Svenska</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fi">Suomi</SelectItem>
                  <SelectItem value="ku">Kurdî</SelectItem>
                  <SelectItem value="tr">Türkçe</SelectItem>
                  <SelectItem value="pl">Polski</SelectItem>
                  <SelectItem value="uk">Українська</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <SectionHeader icon={<User className="text-gray-400" />} title={t.customerInfo.title} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="customer_name">{t.customerInfo.firstName} *</Label>
                  <Input id="customer_name" name="customer_name" value={formData.customer_name} onChange={handleInputChange} placeholder={t.customerInfo.firstNamePlaceholder} />
                </div>
                <div>
                  <Label htmlFor="customer_lastname">{t.customerInfo.lastName} *</Label>
                  <Input id="customer_lastname" name="customer_lastname" value={formData.customer_lastname} onChange={handleInputChange} placeholder={t.customerInfo.lastNamePlaceholder} />
                </div>
                <div>
                  <Label htmlFor="customer_phone">{t.customerInfo.phone}</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.customer_phone_country_code}
                      onValueChange={(value) => handleSelectChange('customer_phone_country_code', value)}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {countryDialCodes.map((item) => (
                          <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input id="customer_phone" name="customer_phone" value={formData.customer_phone} onChange={handleInputChange} placeholder={t.customerInfo.phonePlaceholder} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer_email">{t.customerInfo.email}</Label>
                  <Input id="customer_email" name="customer_email" type="email" value={formData.customer_email} onChange={handleInputChange} placeholder={t.customerInfo.emailPlaceholder} />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 mb-2">
                    {t.customerInfo.contactRequirementNote}
                  </p>
                  {formData.customer_phone?.trim() && formData.customer_email?.trim() ? (
                    <div>
                      <Label>{t.customerInfo.primaryContactLabel} *</Label>
                      <Select
                        value={formData.preferred_contact_channel}
                        onValueChange={(value) => handleSelectChange('preferred_contact_channel', value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={t.customerInfo.primaryContactPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sms">{t.customerInfo.contactOptionSms}</SelectItem>
                          <SelectItem value="email">{t.customerInfo.contactOptionEmail}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {t.customerInfo.primaryContactAutoNote}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <SectionHeader icon={<Smartphone className="text-gray-400" />} title={t.deviceInfo.title} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="device_type">{t.deviceInfo.deviceType} *</Label>
                  <Select name="device_type" onValueChange={(value) => handleSelectChange('device_type', value)} value={formData.device_type}>
                    <SelectTrigger><SelectValue placeholder={t.deviceInfo.deviceTypePlaceholder} /></SelectTrigger>
                    <SelectContent>
                      {currentDeviceTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="device_model">{t.deviceInfo.modelBrand}</Label>
                  <Input id="device_model" name="device_model" value={formData.device_model} onChange={handleInputChange} placeholder={t.deviceInfo.modelBrandPlaceholder} />
                </div>
              </div>
            </div>

            <div>
              <SectionHeader icon={<AlertCircle className="text-gray-400" />} title={t.problemInfo.title} />
              <div>
                <Label htmlFor="issue_description">{t.problemInfo.problemDescription} *</Label>
                <Textarea id="issue_description" name="issue_description" value={formData.issue_description} onChange={handleInputChange} placeholder={t.problemInfo.problemDescriptionPlaceholder} rows={4} />
              </div>
            </div>

            <div>
              <SectionHeader icon={<Info className="text-gray-400" />} title={t.problemInfo.additionalInfo} />
              <div>
                <Label htmlFor="additional_notes">{t.problemInfo.additionalInfoPlaceholder}</Label>
                <Textarea id="additional_notes" name="additional_notes" value={formData.additional_notes} onChange={handleInputChange} placeholder={t.problemInfo.additionalInfoAccessoryPlaceholder} rows={3} />
              </div>
            </div>

            <div className="pt-4 text-center">
              {!session || !token ? (
                <p className="text-sm text-red-500 mb-3">
                  Personalinloggning krävs för att registrera ärenden.
                </p>
              ) : null}
              <Button type="submit" disabled={loading || !session || !token} className="w-full max-w-xs mx-auto text-lg py-6 bg-gray-800 hover:bg-gray-900">
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileText className="mr-2 h-5 w-5" />}
                {t.submitButton.continue}
              </Button>
              <p className="text-xs text-gray-500 mt-4">{t.requiredFieldsNotice}</p>
            </div>
          </form>
        </motion.div>
      </main>
      <DisclaimerDialog
        open={showDisclaimer}
        onOpenChange={setShowDisclaimer}
        onAccept={handleDisclaimerAccept}
        language={language}
      />
    </div>
  );
}
