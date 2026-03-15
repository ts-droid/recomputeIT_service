const templates = {
  sv: {
    reparationFardig: (ticket) => ({
      subject: `Service klar: Ärende ${ticket.ticket_number}`,
      body: `Hej ${ticket.customer_name},\n\nDin service gällande ${ticket.device_type} ${ticket.device_model || ''} med ärendenummer ${ticket.ticket_number} är nu klar och enheten är redo att hämtas.${ticket.final_cost ? `\n\nDen slutgiltiga kostnaden för reparationen är ${ticket.final_cost} kr.` : ''}\n\nUtförda åtgärder:\n${ticket.work_done_summary || 'Allmän service och felsökning.'}\n\nVåra öppettider är:\nMån-Fre: 10:00 - 18:00\nLör: 10:00 - 15:00\n\nVänligen ta med ditt servicekvitto vid upphämtning.\n\nMed vänliga hälsningar,\nDitt serviceteam`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Kostnadsförslag: Ärende ${ticket.ticket_number}`,
      body: `Hej ${ticket.customer_name},\n\nVi har felsökt din ${ticket.device_type} ${ticket.device_model || ''} med ärendenummer ${ticket.ticket_number} och har ett kostnadsförslag till dig.\n\nDiagnos:\n${ticket.diagnosis || '[BESKRIV DIAGNOS HÄR]'}\n\nTotal kostnad för reparation: ${ticket.final_cost || '[PRIS]'} kr\n\nVänligen meddela oss om du vill gå vidare med reparationen.\n\nMed vänliga hälsningar,\nDitt serviceteam`
    }),
    kostnadsforslag_uppdatering: (ticket) => ({
      subject: `Uppdaterat kostnadsförslag: Ärende ${ticket.ticket_number}`,
      body: `Hej ${ticket.customer_name},\n\nVi har ett uppdaterat kostnadsförslag för din ${ticket.device_type} ${ticket.device_model || ''} med ärendenummer ${ticket.ticket_number}.\n\nDiagnos:\n${ticket.diagnosis || '[BESKRIV DIAGNOS HÄR]'}\n\nNy total kostnad för reparation: ${ticket.final_cost || '[PRIS]'} kr\n\nVänligen meddela oss om du vill gå vidare med reparationen.\n\nMed vänliga hälsningar,\nDitt serviceteam`
    }),
  },
  en: {
    reparationFardig: (ticket) => ({
      subject: `Service Complete: Case ${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nYour service regarding ${ticket.device_type} ${ticket.device_model || ''} with case number ${ticket.ticket_number} is now complete and the device is ready for pickup.${ticket.final_cost ? `\n\nThe final cost for the repair is ${ticket.final_cost} kr.` : ''}\n\nWork performed:\n${ticket.work_done_summary || 'General service and troubleshooting.'}\n\nOur opening hours are:\nMon-Fri: 10:00 - 18:00\nSat: 10:00 - 15:00\n\nPlease bring your service receipt upon pickup.\n\nBest regards,\nYour Service Team`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Price Quote: Case ${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nWe have diagnosed your ${ticket.device_type} ${ticket.device_model || ''} with case number ${ticket.ticket_number} and have a price quote for you.\n\nDiagnosis:\n${ticket.diagnosis || '[DESCRIBE DIAGNOSIS HERE]'}\n\nTotal repair cost: ${ticket.final_cost || '[PRICE]'} kr\n\nPlease let us know if you wish to proceed with the repair.\n\nBest regards,\nYour Service Team`
    }),
    kostnadsforslag_uppdatering: (ticket) => ({
      subject: `Updated Price Quote: Case ${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nWe have an updated price quote for your ${ticket.device_type} ${ticket.device_model || ''} with case number ${ticket.ticket_number}.\n\nDiagnosis:\n${ticket.diagnosis || '[DESCRIBE DIAGNOSIS HERE]'}\n\nNew total repair cost: ${ticket.final_cost || '[PRICE]'} kr\n\nPlease let us know if you wish to proceed with the repair.\n\nBest regards,\nYour Service Team`
    }),
  },
  ar: {
    reparationFardig: (ticket) => ({
      subject: `اكتملت الخدمة: حالة ${ticket.ticket_number}`,
      body: `مرحباً ${ticket.customer_name}،\n\nخدمتك بخصوص ${ticket.device_type} ${ticket.device_model || ''} برقم الحالة ${ticket.ticket_number} قد اكتملت الآن والجهاز جاهز للاستلام.${ticket.final_cost ? `\n\nالتكلفة النهائية للإصلاح هي ${ticket.final_cost} kr.` : ''}\n\nالإجراءات المنجزة:\n${ticket.work_done_summary || 'خدمة عامة واستكشاف الأخطاء وإصلاحها.'}\n\nساعات العمل لدينا هي:\nالاثنين - الجمعة: 10:00 - 18:00\nالسبت: 10:00 - 15:00\n\nيرجى إحضار إيصال الخدمة عند الاستلام.\n\nمع أطيب التحيات،\nفريق الخدمة الخاص بك`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `عرض سعر: حالة ${ticket.ticket_number}`,
      body: `مرحباً ${ticket.customer_name}،\n\nلقد قمنا بتشخيص ${ticket.device_type} ${ticket.device_model || ''} الخاص بك برقم الحالة ${ticket.ticket_number} ولدينا عرض سعر لك.\n\nالتشخيص:\n${ticket.diagnosis || '[صف التشخيص هنا]'}\n\nالتكلفة الإجمالية للإصلاح: ${ticket.final_cost || '[السعر]'} kr\n\nيرجى إعلامنا إذا كنت ترغب في المتابعة مع الإصلاح.\n\nمع أطيب التحيات،\nفريق الخدمة الخاص بك`
    }),
  },
  es: {
    reparationFardig: (ticket) => ({
      subject: `Servicio Completado: Caso ${ticket.ticket_number}`,
      body: `Hola ${ticket.customer_name},\n\nSu servicio para ${ticket.device_type} ${ticket.device_model || ''} con número de caso ${ticket.ticket_number} está completo y el dispositivo está listo para ser recogido.${ticket.final_cost ? `\n\nEl costo final de la reparación es ${ticket.final_cost} kr.` : ''}\n\nTrabajo realizado:\n${ticket.work_done_summary || 'Servicio general y solución de problemas.'}\n\nNuestro horario de atención es:\nLun-Vie: 10:00 - 18:00\nSáb: 10:00 - 15:00\n\nPor favor, traiga su recibo de servicio al recogerlo.\n\nSaludos cordiales,\nSu equipo de servicio`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Cotización: Caso ${ticket.ticket_number}`,
      body: `Hola ${ticket.customer_name},\n\nHemos diagnosticado su ${ticket.device_type} ${ticket.device_model || ''} con número de caso ${ticket.ticket_number} y tenemos una cotización para usted.\n\nDiagnóstico:\n${ticket.diagnosis || '[DESCRIBA EL DIAGNÓSTICO AQUÍ]'}\n\nCosto total de la reparación: ${ticket.final_cost || '[PRECIO]'} kr\n\nPor favor, infórmenos si desea proceder con la reparación.\n\nSaludos cordiales,\nSu equipo de servicio`
    }),
  },
  fi: {
    reparationFardig: (ticket) => ({
      subject: `Huolto valmis: Tapaus ${ticket.ticket_number}`,
      body: `Hei ${ticket.customer_name},\n\nHuoltosi koskien ${ticket.device_type} ${ticket.device_model || ''} tapausnumerolla ${ticket.ticket_number} on nyt valmis ja laite on noudettavissa.${ticket.final_cost ? `\n\nKorjauksen lopullinen hinta on ${ticket.final_cost} kr.` : ''}\n\nTehdyt toimenpiteet:\n${ticket.work_done_summary || 'Yleinen huolto ja vianmääritys.'}\n\nAukioloaikamme ovat:\nMa-Pe: 10:00 - 18:00\nLa: 10:00 - 15:00\n\nOtathan huoltokuitin mukaan noutaessasi.\n\nTerveisin,\nHuoltotiimisi`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Kustannusarvio: Tapaus ${ticket.ticket_number}`,
      body: `Hei ${ticket.customer_name},\n\nOlemme tehneet vianmäärityksen laitteellesi ${ticket.device_type} ${ticket.device_model || ''} tapausnumerolla ${ticket.ticket_number} ja meillä on sinulle kustannusarvio.\n\nDiagnoosi:\n${ticket.diagnosis || '[KUVA DIAGNOOSI TÄHÄN]'}\n\nKorjauksen kokonaiskustannus: ${ticket.final_cost || '[HINTA]'} kr\n\nIlmoitathan meille, jos haluat jatkaa korjauksen kanssa.\n\nTerveisin,\nHuoltotiimisi`
    }),
  },
  ku: {
    reparationFardig: (ticket) => ({
      subject: `Xizmet Temam Bû: Doz ${ticket.ticket_number}`,
      body: `Silav ${ticket.customer_name},\n\nXizmeta we ya ji bo ${ticket.device_type} ${ticket.device_model || ''} bi hejmara dozê ${ticket.ticket_number} niha temam bûye û amûr ji bo wergirtinê amade ye.${ticket.final_cost ? `\n\nMesrefa dawî ya tamîrê ${ticket.final_cost} kr e.` : ''}\n\nKarê hatî kirin:\n${ticket.work_done_summary || 'Xizmeta giştî û çareserkirina pirsgirêkan.'}\n\nDemjimêrên me yên vekirinê:\nDuşem-În: 10:00 - 18:00\nŞemî: 10:00 - 15:00\n\nJi kerema xwe meqbûza xizmetê bi xwe re bînin dema wergirtinê.\n\nBi rêz,\nTîma we ya Xizmetê`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Pêşniyara Bihayê: Doz ${ticket.ticket_number}`,
      body: `Silav ${ticket.customer_name},\n\nMe ji bo ${ticket.device_type} ${ticket.device_model || ''} ya we bi hejmara dozê ${ticket.ticket_number} teşhîs kiriye û pêşniyarek bihayê ji bo we heye.\n\nTeşhîs:\n${ticket.diagnosis || '[TEŞHÎSÊ LI VIR ŞIROVE BIKE]'}\n\nMesrefa giştî ya tamîrê: ${ticket.final_cost || '[BIHA]'} kr\n\nJi kerema xwe ji me re agahdar bikin heke hûn dixwazin bi tamîrê bidomînin.\n\nBi rêz,\nTîma we ya Xizmetê`
    }),
  },
  tr: {
    reparationFardig: (ticket) => ({
      subject: `Servis Tamamlandı: Vaka ${ticket.ticket_number}`,
      body: `Merhaba ${ticket.customer_name},\n\n${ticket.device_type} ${ticket.device_model || ''} cihazınızla ilgili ${ticket.ticket_number} numaralı servisiniz tamamlanmıştır ve cihaz teslim alınmaya hazırdır.${ticket.final_cost ? `\n\nOnarımın nihai maliyeti ${ticket.final_cost} kr'dir.` : ''}\n\nYapılan işlemler:\n${ticket.work_done_summary || 'Genel servis ve sorun giderme.'}\n\nÇalışma saatlerimiz:\nPzt-Cum: 10:00 - 18:00\nCmt: 10:00 - 15:00\n\nLütfen teslim alırken servis fişinizi yanınızda getiriniz.\n\nSaygılarımızla,\nServis Ekibiniz`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Fiyat Teklifi: Vaka ${ticket.ticket_number}`,
      body: `Merhaba ${ticket.customer_name},\n\n${ticket.device_type} ${ticket.device_model || ''} cihazınız için ${ticket.ticket_number} numaralı vaka ile ilgili arıza tespiti yaptık ve size bir fiyat teklifimiz var.\n\nTeşhis:\n${ticket.diagnosis || '[TEŞHİSİ BURAYA AÇIKLAYIN]'}\n\nToplam onarım maliyeti: ${ticket.final_cost || '[FİYAT]'} kr\n\nOnarıma devam etmek isterseniz lütfen bize bildirin.\n\nSaygılarımızla,\nServis Ekibiniz`
    }),
  },
  pl: {
    reparationFardig: (ticket) => ({
      subject: `Serwis Zakończony: Sprawa ${ticket.ticket_number}`,
      body: `Cześć ${ticket.customer_name},\n\nTwój serwis dotyczący ${ticket.device_type} ${ticket.device_model || ''} o numerze sprawy ${ticket.ticket_number} został zakończony, a urządzenie jest gotowe do odbioru.${ticket.final_cost ? `\n\nOstateczny koszt naprawy wynosi ${ticket.final_cost} kr.` : ''}\n\nWykonane czynności:\n${ticket.work_done_summary || 'Ogólny serwis i rozwiązywanie problemów.'}\n\nNasze godziny otwarcia:\nPn-Pt: 10:00 - 18:00\nSb: 10:00 - 15:00\n\nProsimy o zabranie potwierdzenia serwisowego przy odbiorze.\n\nZ poważaniem,\nTwój Zespół Serwisowy`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Wycena: Sprawa ${ticket.ticket_number}`,
      body: `Cześć ${ticket.customer_name},\n\nZdiagnozowaliśmy Twoje urządzenie ${ticket.device_type} ${ticket.device_model || ''} o numerze sprawy ${ticket.ticket_number} i mamy dla Ciebie wycenę.\n\nDiagnoza:\n${ticket.diagnosis || '[OPISZ DIAGNOZĘ TUTAJ]'}\n\nCałkowity koszt naprawy: ${ticket.final_cost || '[CENA]'} kr\n\nProsimy o informację, czy chcesz kontynuować naprawę.\n\nZ poważaniem,\nTwój Zespół Serwisowy`
    }),
  },
  uk: {
    reparationFardig: (ticket) => ({
      subject: `Обслуговування Завершено: Справа ${ticket.ticket_number}`,
      body: `Вітаємо, ${ticket.customer_name}!\n\nВаше обслуговування щодо ${ticket.device_type} ${ticket.device_model || ''} з номером справи ${ticket.ticket_number} завершено, і пристрій готовий до видачі.${ticket.final_cost ? `\n\nКінцева вартість ремонту становить ${ticket.final_cost} kr.` : ''}\n\nВиконані роботи:\n${ticket.work_done_summary || 'Загальне обслуговування та усунення несправностей.'}\n\nНаші години роботи:\nПн-Пт: 10:00 - 18:00\nСб: 10:00 - 15:00\n\nБудь ласка, візьміть із собою квитанцію про обслуговування при отриманні.\n\nЗ повагою,\nВаша сервісна команда`
    }),
    kostnadsforslag: (ticket) => ({
      subject: `Цінова пропозиція: Справа ${ticket.ticket_number}`,
      body: `Вітаємо, ${ticket.customer_name}!\n\nМи провели діагностику вашого пристрою ${ticket.device_type} ${ticket.device_model || ''} з номером справи ${ticket.ticket_number} і маємо для вас цінову пропозицію.\n\nДіагноз:\n${ticket.diagnosis || '[ОПИШІТЬ ДІАГНОЗ ТУТ]'}\n\nЗагальна вартість ремонту: ${ticket.final_cost || '[ЦІНА]'} kr\n\nБудь ласка, повідомте нам, якщо ви бажаєте продовжити ремонт.\n\nЗ повагою,\nВаша сервісна команда`
    }),
  },
};

export const generateEmailContent = (ticket, templateType, language) => {
  const lang = language || ticket.disclaimer_language || 'sv';
  const templateGenerator = templates[lang]?.[templateType];
  
  if (!templateGenerator) {
    const fallbackGenerator = templates['sv']?.[templateType];
    if (fallbackGenerator) {
      return fallbackGenerator(ticket);
    }
    return null;
  }
  
  return templateGenerator(ticket);
};