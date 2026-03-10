import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { User, Phone, Mail, Smartphone, AlertCircle, Globe } from 'lucide-react';
import { countryDialCodes } from '@/lib/countryDialCodes';

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

const languages = [
  { code: 'sv', name: 'Svenska' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'es', name: 'Español' },
  { code: 'fi', name: 'Suomi' },
  { code: 'ku', name: 'Kurdî' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'pl', name: 'Polski' },
  { code: 'uk', name: 'Українська' },
];

const Section = ({ title, icon, children }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="space-y-6"
    >
        <div className="border-b border-gray-200 pb-3">
            <div className="flex items-center gap-3">
                {icon}
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            </div>
        </div>
        {children}
    </motion.div>
);

export function ServiceFormFields({ formData, handleInputChange, language, setLanguage, t }) {
  const currentDeviceTypes = deviceTypes[language] || deviceTypes.sv;
  
  return (
    <>
      <div className="space-y-2 mb-8">
        <Label htmlFor="language" className="text-gray-700 flex items-center gap-2"><Globe className="h-4 w-4 text-gray-500" />{t.languageLabel}</Label>
        <Select
          name="language"
          value={language}
          onValueChange={(value) => setLanguage(value)}
        >
          <SelectTrigger id="language" className="bg-gray-50 border-gray-300 text-gray-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map(lang => (
              <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Section title={t.customerInfo.title} icon={<User className="h-6 w-6 text-slate-500" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-gray-700">{t.customerInfo.firstName} *</Label>
            <Input id="firstName" name="firstName" value={formData.firstName} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.customerInfo.firstNamePlaceholder} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-gray-700">{t.customerInfo.lastName} *</Label>
            <Input id="lastName" name="lastName" value={formData.lastName} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.customerInfo.lastNamePlaceholder} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-gray-700 flex items-center gap-2"><Phone className="h-4 w-4 text-gray-500" />{t.customerInfo.phone} *</Label>
            <div className="flex gap-2">
              <Select
                name="phoneCountryCode"
                value={formData.phoneCountryCode || '+46'}
                onValueChange={(value) => handleInputChange({ target: { name: 'phoneCountryCode', value } })}
              >
                <SelectTrigger className="w-[130px] bg-gray-50 border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countryDialCodes.map((item) => (
                    <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.customerInfo.phonePlaceholder} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700 flex items-center gap-2"><Mail className="h-4 w-4 text-gray-500" />{t.customerInfo.email} *</Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.customerInfo.emailPlaceholder} required />
          </div>
        </div>
      </Section>

      <Section title={t.deviceInfo.title} icon={<Smartphone className="h-6 w-6 text-slate-500" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="deviceType" className="text-gray-700">{t.deviceInfo.deviceType} *</Label>
            <Select
              name="deviceType"
              value={formData.deviceType}
              onValueChange={(value) => handleInputChange({ target: { name: 'deviceType', value } })}
            >
              <SelectTrigger id="deviceType" className="bg-gray-50 border-gray-300 text-gray-900">
                 <SelectValue placeholder={t.deviceInfo.deviceTypePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {currentDeviceTypes.map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deviceModel" className="text-gray-700">{t.deviceInfo.modelBrand}</Label>
            <Input id="deviceModel" name="deviceModel" value={formData.deviceModel} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.deviceInfo.modelBrandPlaceholder} />
          </div>
        </div>
      </Section>

      <Section title={t.problemInfo.title} icon={<AlertCircle className="h-6 w-6 text-slate-500" />}>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="problemDescription" className="text-gray-700">{t.problemInfo.problemDescription} *</Label>
            <Textarea id="problemDescription" name="problemDescription" value={formData.problemDescription} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 min-h-[120px]" placeholder={t.problemInfo.problemDescriptionPlaceholder} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalNotes" className="text-gray-700">{t.problemInfo.additionalInfo}</Label>
            <Textarea id="additionalNotes" name="additionalNotes" value={formData.additionalNotes} onChange={handleInputChange} className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400" placeholder={t.problemInfo.additionalInfoPlaceholder} />
          </div>
        </div>
      </Section>
    </>
  );
}
