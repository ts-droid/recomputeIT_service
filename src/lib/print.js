const printTranslations = {
  sv: {
    serviceReceipt: 'SERVICEKVITTO',
    workshopForm: 'VERKSTADSUNDERLAG',
    caseNumber: 'Ärendenummer',
    date: 'Datum',
    time: 'Tid',
    customerInfo: 'Kunduppgifter',
    name: 'Namn',
    phone: 'Telefon',
    email: 'E-post',
    deviceInfo: 'Enhetsinformation',
    deviceType: 'Enhetstyp',
    model: 'Modell',
    problemDescription: 'Felbeskrivning',
    importantNotice: 'VIKTIGT: Spara detta kvitto som bevis på inlämning.',
    contactMessage: 'Vi kontaktar dig när servicen är klar eller om vi behöver mer information.',
    pickupMessage: 'Hämta din enhet inom 30 dagar efter att vi meddelat att den är klar.',
    customerProblemDescription: 'Kundens felbeskrivning',
    additionalInfo: 'Ytterligare information',
    technicianNotes: 'Tekniker anteckningar',
    diagnosis: 'Diagnos',
    actionsTaken: 'Utförda åtgärder',
    spareParts: 'Reservdelar',
    technicianSignature: 'Tekniker signatur',
    serviceSpecification: 'Servicespecifikation',
    thankYouMessage: 'Tack för att du anlitat oss!',
    customer: 'Kund',
    finalCost: 'Slutlig kostnad',
    currency: 'kr',
    rightsReserved: 'Alla rättigheter förbehållna',
    notCashReceiptNotice:
      'Detta är inget kassakvitto, endast underlag för betalning. Spara även kassakvitto.',
  },
  en: {
    serviceReceipt: 'SERVICE RECEIPT',
    workshopForm: 'WORKSHOP FORM',
    caseNumber: 'Case Number',
    date: 'Date',
    time: 'Time',
    customerInfo: 'Customer Information',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    deviceInfo: 'Device Information',
    deviceType: 'Device Type',
    model: 'Model',
    problemDescription: 'Problem Description',
    importantNotice: 'IMPORTANT: Keep this receipt as proof of submission.',
    contactMessage: 'We will contact you when the service is complete or if we need more information.',
    pickupMessage: 'Please pick up your device within 30 days after we notify you that it is ready.',
    customerProblemDescription: 'Customer\'s Problem Description',
    additionalInfo: 'Additional Information',
    technicianNotes: 'Technician Notes',
    diagnosis: 'Diagnosis',
    actionsTaken: 'Actions Taken',
    spareParts: 'Spare Parts',
    technicianSignature: 'Technician Signature',
    serviceSpecification: 'Service Specification',
    thankYouMessage: 'Thank you for choosing us!',
    customer: 'Customer',
    finalCost: 'Final Cost',
    currency: 'SEK',
    rightsReserved: 'All rights reserved',
    notCashReceiptNotice:
      'This is not a cash register receipt, only payment documentation. Please also save the cash register receipt.',
  },
  // Add other languages as needed
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const printDocuments = (ticket, language = 'sv') => {
  const t = printTranslations[language] || printTranslations.sv;
  const printWindow = window.open('', '_blank');
  const creationDate = new Date(ticket.created_at);
  const currentDate = creationDate.toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-CA');
  const currentTime = creationDate.toLocaleTimeString(language === 'sv' ? 'sv-SE' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <title>${t.serviceReceipt} & ${t.workshopForm}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; }
        .page {
          page-break-after: always;
          box-sizing: border-box;
          width: 210mm;
          height: 297mm;
          padding: 10mm;
          display: flex;
          flex-direction: column;
        }
        .page:last-child {
          page-break-after: auto;
        }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 15px; }
        .header h1 { font-size: 20px; margin-bottom: 5px; }
        .ticket-number { font-size: 18px; font-weight: bold; color: #2563eb; }
        .header p { font-size: 10px; margin: 0; }
        .section { margin-bottom: 15px; }
        .section h3 { background: #f3f4f6; padding: 6px; margin: 0 0 8px 0; border-left: 4px solid #2563eb; font-size: 12px; }
        .field { margin-bottom: 5px; font-size: 10px; }
        .label { font-weight: bold; display: inline-block; width: 100px; } /* Adjusted width */
        .value { display: inline-block; word-wrap: break-word; }
        .problem-box { border: 1px solid #ccc; padding: 10px; background: #f9f9f9; min-height: 60px; white-space: pre-wrap; word-wrap: break-word; font-size: 10px; }
        .footer { margin-top: auto; padding-top: 15px; text-align: center; font-size: 9px; color: #666; }
        .workshop-notes { border: 1px solid #ccc; padding: 10px; min-height: 100px; margin-top: 15px; font-size: 10px; }
        .workshop-notes h4 { margin-top: 0; font-size: 11px; }
        .workshop-notes p { margin-top: 5px; font-size: 10px; }
        .content-wrapper { flex-grow: 1; }
        @page { size: A4; margin: 0; }
      </style>
    </head>
    <body>
      <!-- CUSTOMER RECEIPT -->
      <div class="page">
        <div class="content-wrapper">
          <div class="header">
            <h1>${t.serviceReceipt}</h1>
            <div class="ticket-number">${t.caseNumber}: ${ticket.ticket_number}</div>
            <p>${t.date}: ${currentDate} | ${t.time}: ${currentTime}</p>
          </div>
          <div class="section">
            <h3>${t.customerInfo}</h3>
            <div class="field"><span class="label">${t.name}:</span><span class="value">${escapeHtml(ticket.customer_name)}</span></div>
            <div class="field"><span class="label">${t.phone}:</span><span class="value">${escapeHtml(ticket.customer_phone)}</span></div>
            ${ticket.customer_email ? `<div class="field"><span class="label">${t.email}:</span><span class="value">${escapeHtml(ticket.customer_email)}</span></div>` : ''}
          </div>
          <div class="section">
            <h3>${t.deviceInfo}</h3>
            <div class="field"><span class="label">${t.deviceType}:</span><span class="value">${escapeHtml(ticket.device_type)}</span></div>
            ${ticket.device_model ? `<div class="field"><span class="label">${t.model}:</span><span class="value">${escapeHtml(ticket.device_model)}</span></div>` : ''}
          </div>
          <div class="section">
            <h3>${t.problemDescription}</h3>
            <div class="problem-box">${escapeHtml(ticket.issue_description)}</div>
          </div>
        </div>
        <div class="footer">
          <p><strong>${t.importantNotice}</strong></p>
          <p>${t.contactMessage}</p>
          <p>${t.pickupMessage}</p>
        </div>
      </div>
      <!-- WORKSHOP FORM -->
      <div class="page">
         <div class="content-wrapper">
            <div class="header">
              <h1>${t.workshopForm}</h1>
              <div class="ticket-number">${t.caseNumber}: ${ticket.ticket_number}</div>
              <p>${t.date}: ${currentDate} | ${t.time}: ${currentTime}</p>
            </div>
            <div class="section">
              <h3>${t.customerInfo}</h3>
              <div class="field"><span class="label">${t.name}:</span><span class="value">${escapeHtml(ticket.customer_name)}</span></div>
              <div class="field"><span class="label">${t.phone}:</span><span class="value">${escapeHtml(ticket.customer_phone)}</span></div>
              ${ticket.customer_email ? `<div class="field"><span class="label">${t.email}:</span><span class="value">${escapeHtml(ticket.customer_email)}</span></div>` : ''}
            </div>
            <div class="section">
              <h3>${t.deviceInfo}</h3>
              <div class="field"><span class="label">${t.deviceType}:</span><span class="value">${escapeHtml(ticket.device_type)}</span></div>
              ${ticket.device_model ? `<div class="field"><span class="label">${t.model}:</span><span class="value">${escapeHtml(ticket.device_model)}</span></div>` : ''}
            </div>
            <div class="section">
              <h3>${t.customerProblemDescription}</h3>
              <div class="problem-box">${escapeHtml(ticket.issue_description)}</div>
              ${ticket.additional_notes ? `<h4>${t.additionalInfo}:</h4><div class="problem-box">${escapeHtml(ticket.additional_notes)}</div>` : ''}
            </div>
            <div class="workshop-notes">
              <h4>${t.technicianNotes}:</h4>
              <p style="margin-top: 1em;">${t.diagnosis}:</p><div style="height: 4em; border-bottom: 1px dotted #ccc;"></div>
              <p style="margin-top: 1em;">${t.actionsTaken}:</p><div style="height: 4em; border-bottom: 1px dotted #ccc;"></div>
              <p style="margin-top: 1em;">${t.spareParts}:</p><div style="height: 4em; border-bottom: 1px dotted #ccc;"></div>
            </div>
        </div>
         <div class="footer">
            <p style="margin-top: 2em;">${t.technicianSignature}: ________________________</p>
        </div>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};

export const printFinalReceipt = (ticket, enhancedSummary, language = 'sv') => {
  const t = printTranslations[language] || printTranslations.sv;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return Promise.resolve(false);
  const currentDate = new Date().toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-CA');
  const finalCostValue = ticket.final_cost || 'Ej angiven';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <title>${t.serviceSpecification} - ${t.caseNumber} ${ticket.ticket_number}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; }
        .page { 
            box-sizing: border-box; 
            width: 210mm; 
            height: 297mm; 
            padding: 10mm; 
            display: flex; 
            flex-direction: column; 
        }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 24px; color: #111827; margin-bottom: 4px; }
        .header p { color: #6b7280; font-size: 12px; }
        .ticket-info { display: flex; justify-content: space-between; background-color: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #e5e7eb; font-size: 12px; }
        .ticket-info div { font-size: 12px; }
        .ticket-info .label { color: #6b7280; }
        .ticket-info .value { font-weight: 600; color: #111827; }
        .section { margin-bottom: 25px; }
        .section h2 { font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; color: #111827; }
        .summary-box { background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; white-space: pre-wrap; line-height: 1.5; word-wrap: break-word; font-size: 12px; }
        .cost-section { text-align: right; margin-top: 30px; }
        .cost-section .total { font-size: 20px; font-weight: bold; color: #16a34a; }
        .content { flex-grow: 1; }
        .footer { margin-top: auto; padding-top: 15px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb;}
        @page { size: A4; margin: 0; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="content">
            <div class="header">
            <h1>${t.serviceSpecification}</h1>
            <p>${t.thankYouMessage}</p>
            </div>
            
            <div class="ticket-info">
            <div><span class="label">${t.caseNumber}:</span> <span class="value">#${escapeHtml(ticket.ticket_number)}</span></div>
            <div><span class="label">${t.date}:</span> <span class="value">${escapeHtml(currentDate)}</span></div>
            <div><span class="label">${t.customer}:</span> <span class="value">${escapeHtml(ticket.customer_name)}</span></div>
            </div>

            <div class="section">
            <h2>${t.actionsTaken}</h2>
            <div class="summary-box">${escapeHtml(enhancedSummary)}</div>
            </div>

            <div class="cost-section">
            <div class="total">${t.finalCost}: ${finalCostValue} ${t.currency}</div>
            </div>
        </div>
        <div class="footer">
          <p><strong>${t.notCashReceiptNotice}</strong></p>
          <p>re:Compute-IT | ${t.rightsReserved}</p>
        </div>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  return new Promise((resolve) => {
    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      try {
        printWindow.close();
      } catch (_) {}
      resolve(result);
    };

    const afterPrintHandler = () => done(true);
    printWindow.onafterprint = afterPrintHandler;

    setTimeout(() => {
      try {
        printWindow.print();
      } catch (_) {
        done(false);
      }
    }, 250);

    // Fallback for browsers that do not trigger onafterprint reliably
    setTimeout(() => done(true), 4000);
  });
};

const toAscii = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?');

const pdfEscape = (value) =>
  toAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const createSimplePdf = (lines) => {
  const lineCommands = lines.map((line) => `(${pdfEscape(line)}) Tj`).join('\nT*\n');
  const contentStream = `BT
/F1 11 Tf
14 TL
1 0 0 1 40 800 Tm
${lineCommands}
ET`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
};

export const downloadServiceTicketPdf = (ticket, language = 'sv') => {
  const t = printTranslations[language] || printTranslations.sv;
  const creationDate = new Date(ticket.created_at || Date.now());
  const currentDate = creationDate.toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-CA');
  const currentTime = creationDate.toLocaleTimeString(language === 'sv' ? 'sv-SE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines = [
    `${t.serviceReceipt} - re:Compute-IT`,
    '',
    `${t.caseNumber}: ${ticket.ticket_number}`,
    `${t.date}: ${currentDate}`,
    `${t.time}: ${currentTime}`,
    '',
    `${t.customerInfo}`,
    `${t.name}: ${ticket.customer_name || ''}`,
    `${t.phone}: ${ticket.customer_phone || ''}`,
    `${t.email}: ${ticket.customer_email || '-'}`,
    '',
    `${t.deviceInfo}`,
    `${t.deviceType}: ${ticket.device_type || ''}`,
    `${t.model}: ${ticket.device_model || '-'}`,
    '',
    `${t.problemDescription}`,
    `${ticket.issue_description || ''}`,
    '',
    `${t.importantNotice}`,
  ];

  const pdf = createSimplePdf(lines);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `service-ticket-${ticket.ticket_number}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
