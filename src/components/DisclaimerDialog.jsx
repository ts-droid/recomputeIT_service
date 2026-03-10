import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';

const translations = {
  sv: {
    title: 'Viktiga villkor för service',
    description: 'Läs igenom följande villkor noggrant innan du fortsätter.',
    disclaimer: `VIKTIGT: Genom att lämna in din enhet för service godkänner du följande villkor:

• Du ansvarar för att säkerhetskopiera all data innan service
• Vi ansvarar INTE för eventuell dataförlust under reparation
• Enheten lämnas på egen risk
• Service utförs efter bästa förmåga men utan garanti för databevarande
• Vi rekommenderar starkt att du tar backup av all viktig data
• Reparationstid kan variera beroende på fel och reservdelstillgång
• Du godkänner att vi kan behöva återställa enheten till fabriksinställningar
• Vid nekat kostnadsförslag ska enheten hämtas inom 7 dagar, annars kan den kasseras

Genom att acceptera dessa villkor bekräftar du att du förstår och godkänner ovanstående.`,
    acceptLabel: 'Jag har läst och godkänner villkoren',
    acceptButton: 'Godkänn och fortsätt',
    cancelButton: 'Avbryt'
  },
  en: {
    title: 'Important Service Terms',
    description: 'Please read the following terms carefully before proceeding.',
    disclaimer: `IMPORTANT: By submitting your device for service, you agree to the following terms:

• You are responsible for backing up all data before service
• We are NOT responsible for any data loss during repair
• Device is left at your own risk
• Service is performed to the best of our ability but without guarantee of data preservation
• We strongly recommend backing up all important data
• Repair time may vary depending on the fault and parts availability
• You agree that we may need to reset the device to factory settings
• If a cost proposal is declined, the device must be collected within 7 days, otherwise it may be discarded

By accepting these terms, you confirm that you understand and agree to the above.`,
    acceptLabel: 'I have read and accept the terms',
    acceptButton: 'Accept and continue',
    cancelButton: 'Cancel'
  },
  ar: {
    title: 'شروط الخدمة المهمة',
    description: 'يرجى قراءة الشروط التالية بعناية قبل المتابعة.',
    disclaimer: `مهم: من خلال تقديم جهازك للخدمة، فإنك توافق على الشروط التالية:

• أنت مسؤول عن نسخ احتياطي لجميع البيانات قبل الخدمة
• نحن لسنا مسؤولين عن أي فقدان للبيانات أثناء الإصلاح
• يُترك الجهاز على مسؤوليتك الخاصة
• يتم تنفيذ الخدمة بأفضل ما لدينا من قدرة ولكن بدون ضمان للحفاظ على البيانات
• نوصي بشدة بعمل نسخة احتياطية من جميع البيانات المهمة
• قد يختلف وقت الإصلاح حسب العطل وتوفر قطع الغيار
• توافق على أننا قد نحتاج إلى إعادة تعيين الجهاز إلى إعدادات المصنع
• في حال رفض عرض السعر، يجب استلام الجهاز خلال 7 أيام، وإلا قد يتم التخلص منه

بقبول هذه الشروط، تؤكد أنك تفهم وتوافق على ما سبق.`,
    acceptLabel: 'لقد قرأت ووافقت على الشروط',
    acceptButton: 'قبول والمتابعة',
    cancelButton: 'إلغاء'
  },
  es: {
    title: 'Términos Importantes del Servicio',
    description: 'Por favor, lea los siguientes términos cuidadosamente antes de continuar.',
    disclaimer: `IMPORTANTE: Al enviar su dispositivo para servicio, usted acepta los siguientes términos:

• Usted es responsable de hacer una copia de seguridad de todos los datos antes del servicio
• NO somos responsables de ninguna pérdida de datos durante la reparación
• El dispositivo se deja bajo su propio riesgo
• El servicio se realiza con la mejor de nuestras habilidades pero sin garantía de preservación de datos
• Recomendamos encarecidamente hacer una copia de seguridad de todos los datos importantes
• El tiempo de reparación puede variar dependiendo de la falla y disponibilidad de repuestos
• Usted acepta que podemos necesitar restablecer el dispositivo a la configuración de fábrica
• Si se rechaza el presupuesto, el dispositivo debe recogerse dentro de 7 días; de lo contrario, puede desecharse

Al aceptar estos términos, confirma que entiende y acepta lo anterior.`,
    acceptLabel: 'He leído y acepto los términos',
    acceptButton: 'Aceptar y continuar',
    cancelButton: 'Cancelar'
  },
  fi: {
    title: 'Tärkeitä palveluehtoja',
    description: 'Lue seuraavat ehdot huolellisesti ennen jatkamista.',
    disclaimer: `TÄRKEÄÄ: Toimittamalla laitteesi huoltoon hyväksyt seuraavat ehdot:

• Olet vastuussa kaikkien tietojen varmuuskopioinnista ennen huoltoa
• Emme ole vastuussa mahdollisesta tietojen menetyksestä korjauksen aikana
• Laite jätetään omalla vastuullasi
• Huolto suoritetaan parhaan kykymme mukaan, mutta ilman takuuta tietojen säilymisestä
• Suosittelemme vahvasti kaikkien tärkeiden tietojen varmuuskopiointia
• Korjausaika voi vaihdella vian ja varaosien saatavuuden mukaan
• Hyväksyt, että saatamme joutua palauttamaan laitteen tehdasasetuksiin
• Jos kustannusarvio hylätään, laite on noudettava 7 päivän kuluessa, muuten se voidaan hävittää

Hyväksymällä nämä ehdot vahvistat ymmärtäväsi ja hyväksyväsi yllä olevat seikat.`,
    acceptLabel: 'Olen lukenut ja hyväksyn ehdot',
    acceptButton: 'Hyväksy ja jatka',
    cancelButton: 'Peruuta'
  },
  ku: {
    title: 'Mercên Girîng ên Xizmetê',
    description: 'Ji kerema xwe berî ku hûn bidomînin, şertên jêrîn bi baldarî bixwînin.',
    disclaimer: `GIRÎNG: Bi şandina amûrê xwe ji bo xizmetê, hûn şertên jêrîn qebûl dikin:

• Hûn berpirsiyar in ku hemî daneyan berî xizmetê paşve hilînin
• Em ji windabûna daneyan di dema tamîrê de berpirsiyar nînin
• Amûr li ser rîska we tê hiştin
• Xizmet li gorî kapasîteya me ya herî baş tê kirin lê bêyî garantîya parastina daneyan
• Em bi tundî pêşniyar dikin ku hemî daneyên girîng paşve hilînin
• Dema tamîrê dibe ku li gorî xeletî û hebûna parçeyan biguhere
• Hûn qebûl dikin ku dibe ku em hewce bikin ku amûrê li mîhengên kargehê vegerînin
• Heke pêşniyara bihayê were redkirin, divê amûr di nav 7 rojan de were standin, wekî din dibe ku were avêtin

Bi qebûlkirina van şertan, hûn piştrast dikin ku hûn tiştên jorîn fêm dikin û qebûl dikin.`,
    acceptLabel: 'Min şert xwendin û qebûl dikim',
    acceptButton: 'Qebûl bike û bidomîne',
    cancelButton: 'Betal bike'
  },
  tr: {
    title: 'Önemli Servis Şartları',
    description: 'Lütfen devam etmeden önce aşağıdaki şartları dikkatlice okuyun.',
    disclaimer: `ÖNEMLİ: Cihazınızı servise göndererek aşağıdaki şartları kabul etmiş olursunuz:

• Servis öncesinde tüm verileri yedeklemek sizin sorumluluğunuzdadır
• Onarım sırasında oluşabilecek veri kaybından sorumlu DEĞİLİZ
• Cihaz kendi sorumluluğunuzda bırakılır
• Servis, elimizden gelen en iyi şekilde yapılır ancak veri koruma garantisi verilmez
• Tüm önemli verilerinizi yedeklemenizi şiddetle tavsiye ederiz
• Onarım süresi, arızaya ve parça bulunabilirliğine göre değişebilir
• Cihazı fabrika ayarlarına sıfırlamamız gerekebileceğini kabul edersiniz
• Fiyat teklifi reddedilirse cihaz 7 gün içinde teslim alınmalıdır, aksi takdirde imha edilebilir

Bu şartları kabul ederek, yukarıdakileri anladığınızı ve kabul ettiğinizi onaylamış olursunuz.`,
    acceptLabel: 'Şartları okudum ve kabul ediyorum',
    acceptButton: 'Kabul et ve devam et',
    cancelButton: 'İptal'
  },
  pl: {
    title: 'Ważne warunki świadczenia usług',
    description: 'Prosimy o uważne przeczytanie poniższych warunków przed kontynuowaniem.',
    disclaimer: `WAŻNE: Przekazując urządzenie do serwisu, akceptujesz następujące warunki:

• Jesteś odpowiedzialny za wykonanie kopii zapasowej wszystkich danych przed serwisem
• NIE ponosimy odpowiedzialności za utratę danych podczas naprawy
• Urządzenie pozostawiasz na własne ryzyko
• Serwis jest wykonywany najlepiej jak potrafimy, ale bez gwarancji zachowania danych
• Zdecydowanie zalecamy wykonanie kopii zapasowej wszystkich ważnych danych
• Czas naprawy może się różnić w zależności od usterki i dostępności części
• Zgadzasz się, że możemy potrzebować przywrócić urządzenie do ustawień fabrycznych
• W przypadku odrzucenia wyceny urządzenie należy odebrać w ciągu 7 dni, w przeciwnym razie może zostać zutylizowane

Akceptując te warunki, potwierdzasz, że rozumiesz i zgadzasz się na powyższe.`,
    acceptLabel: 'Przeczytałem i akceptuję warunki',
    acceptButton: 'Akceptuj i kontynuuj',
    cancelButton: 'Anuluj'
  },
  uk: {
    title: 'Важливі умови обслуговування',
    description: 'Будь ласка, уважно прочитайте наступні умови, перш ніж продовжити.',
    disclaimer: `ВАЖЛИВО: Подаючи свій пристрій на обслуговування, ви погоджуєтеся з наступними умовами:

• Ви несете відповідальність за резервне копіювання всіх даних перед обслуговуванням
• Ми НЕ несемо відповідальності за будь-яку втрату даних під час ремонту
• Пристрій залишається на ваш власний ризик
• Обслуговування виконується в міру наших можливостей, але без гарантії збереження даних
• Ми настійно рекомендуємо створювати резервні копії всіх важливих даних
• Час ремонту може змінюватися залежно від несправності та наявності запчастин
• Ви погоджуєтеся, що нам може знадобитися скинути пристрій до заводських налаштувань
• Якщо кошторис відхилено, пристрій потрібно забрати протягом 7 днів, інакше його можуть утилізувати

Приймаючи ці умови, ви підтверджуєте, що розумієте та погоджуєтеся з вищезазначеним.`,
    acceptLabel: 'Я прочитав і приймаю умови',
    acceptButton: 'Прийняти та продовжити',
    cancelButton: 'Скасувати'
  }
};

export function DisclaimerDialog({ open, onOpenChange, onAccept, language }) {
  const [accepted, setAccepted] = useState(false);

  const currentTranslation = translations[language] || translations.sv;
  
  useEffect(() => {
    if (!open) {
      setAccepted(false);
    }
  }, [open]);

  const handleAccept = () => {
    if (accepted) {
      onAccept(language);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-gray-200 text-gray-800 no-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-gray-900">
            {currentTranslation.title}
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-center">
            {currentTranslation.description}
          </DialogDescription>
        </DialogHeader>

        <motion.div 
          key={language}
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 max-h-[40vh] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed" dir={language === 'ar' || language === 'ku' ? 'rtl' : 'ltr'}>
              {currentTranslation.disclaimer}
            </pre>
          </div>

          <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <Checkbox
              id="accept"
              checked={accepted}
              onCheckedChange={setAccepted}
              className="border-gray-400 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
              aria-label={currentTranslation.acceptLabel}
            />
            <Label 
              htmlFor="accept" 
              className="text-sm text-gray-700 cursor-pointer flex-1"
              dir={language === 'ar' || language === 'ku' ? 'rtl' : 'ltr'}
            >
              {currentTranslation.acceptLabel}
            </Label>
          </div>
        </motion.div>

        <DialogFooter className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            {currentTranslation.cancelButton}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!accepted}
            className="bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentTranslation.acceptButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
