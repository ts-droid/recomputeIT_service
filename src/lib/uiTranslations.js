// ---------------------------------------------------------------------------
// UI translations for the staff-facing parts of the application.
// Customer-facing form strings live in formTranslations.js.
// ---------------------------------------------------------------------------

export const uiTranslations = {
  sv: {
    // ---- DashboardPage ----
    dashboard: {
      loggedInAs: 'Inloggad som',
      logout: 'Logga ut',
      staffView: 'Personalvy',
      staffViewSubtitle: 'Här kan du se och hantera alla inlämnade ärenden.',
      registerNewTicket: 'Registrera nytt ärende',
    },

    // ---- LoginPage ----
    login: {
      title: 'Personalinloggning',
      subtitle: 'Ange dina uppgifter för att fortsätta',
      emailLabel: 'E-postadress',
      emailPlaceholder: 'namn@foretag.se',
      passwordLabel: 'Lösenord',
      loginButton: 'Logga in',
      loginErrorTitle: 'Inloggningsfel',
      loginErrorDescription: 'Kontrollera din e-post och lösenord och försök igen.',
    },

    // ---- AdminPanel ----
    admin: {
      title: 'Adminpanel',
      subtitle: 'Statistik och användarhantering.',
      refreshStats: 'Uppdatera statistik',

      // tabs
      tabReports: 'Rapporter',
      tabUsers: 'Användare',
      tabMessages: 'Meddelanden',

      // message sub-tabs
      tabFooters: 'Footers',
      tabTemplates: 'Standardtexter',
      tabAi: 'AI-prompter',

      // reports
      totalTickets: 'Totalt antal ärenden',
      closedTickets: 'Avslutade ärenden',
      avgRepairTime: 'Snittid reparation',
      avgNotifyTime: 'Snittid klar \u2192 kundinfo',
      avgPickupTime: 'Snittid klar \u2192 hämtad',
      dateFrom: 'Från',
      dateTo: 'Till',
      applyFilter: 'Kör filter',

      // stats toasts
      statsErrorTitle: 'Kunde inte hämta statistik',
      statsErrorDescription: 'Kontrollera behörighet och försök igen.',

      // message settings
      chatDefaultLanguageLabel: 'Internt chatspråk (default)',
      chatDefaultLanguagePlaceholder: 'Välj språk',
      chatDefaultLanguageHint: 'Kundens meddelanden visas i original + översättning till detta språk (endast internt i chatten).',
      autoTranslateButton: 'AI-översätt alla språk',
      autoTranslateButtonLoading: 'Översätter...',
      autoTranslateHint: 'Fyll i svenska/engelska och låt systemet auto-översätta samt cacha översättningar.',

      // footers
      emailFooterTitle: 'E-postfooter',
      smsFooterTitle: 'SMS-footer',

      // templates
      costProposalTemplateTitle: 'Standardtext: Kostnadsförslag',
      costProposalTemplateHint: 'Du kan använda variabler: {{diagnosis}}, {{amount}}, {{ticket_number}}, {{customer_name}}.',
      repairReadyTemplateTitle: 'Standardtext: Reparation klar',
      repairReadyTemplateHint: 'Du kan använda variabler: {{work_done}}, {{final_cost}}, {{ticket_number}}, {{customer_name}}.',

      // auto-reply templates
      autoReplyApprovedTitle: 'Autosvar: Kostnadsförslag godkänt',
      autoReplyApprovedHint: 'Variabler: {{customer_name}}, {{ticket_number}}, {{amount}}.',
      autoReplyDeclinedTitle: 'Autosvar: Kostnadsförslag nekat',
      autoReplyDeclinedHint: 'Variabler: {{customer_name}}, {{ticket_number}}, {{amount}}.',
      autoReplyUnclearTitle: 'Autosvar: Oklart svar',
      autoReplyUnclearHint: 'Variabler: {{customer_name}}, {{ticket_number}}.',
      emailSubjectPlaceholder: 'E-postämne',
      emailBodyPlaceholder: 'E-posttext',
      smsTextPlaceholder: 'SMS-text',

      // AI prompts
      aiReplyPromptTitle: 'AI-prompt: Svarshjälp',
      aiSuggestionPromptTitle: 'AI-prompt: Meddelandeförslag',
      aiWorkDonePromptTitle: 'AI-prompt: Utförda åtgärder',
      aiWorkDonePromptHint: 'Används när planerade åtgärder omvandlas till fältet för utförda åtgärder.',

      // save message settings
      saveMessageSettings: 'Spara meddelandeinställningar',
      saveMessageSettingsLoading: 'Sparar...',
      savedTitle: 'Sparat',
      savedDescription: 'Meddelandeinställningar uppdaterade.',
      saveErrorTitle: 'Kunde inte spara',
      saveErrorDescription: 'Försök igen.',

      // auto-translate toasts
      autoTranslateDoneTitle: 'Klart',
      autoTranslateDoneDescription: 'Översättningar uppdaterade för alla språk.',
      autoTranslateErrorTitle: 'Auto-översättning misslyckades',
      autoTranslateErrorDescription: 'Kontrollera DeepSeek-nyckel och försök igen.',

      // message settings fetch error
      messageSettingsErrorTitle: 'Kunde inte hämta meddelandeinställningar',
      messageSettingsErrorDescription: 'Försök igen.',

      // users
      createUserTitle: 'Skapa användare',
      nameLabel: 'Namn',
      namePlaceholder: 'Valfritt',
      emailLabel: 'E-post',
      emailPlaceholder: 'namn@foretag.se',
      passwordLabel: 'Lösenord',
      passwordPlaceholder: 'Minst 8 tecken',
      roleLabel: 'Roll',
      rolePlaceholder: 'Välj roll',
      roleBase: 'Bas',
      roleService: 'Service',
      roleAdmin: 'Admin',
      createUserButton: 'Skapa användare',
      usersTitle: 'Användare',
      noUsersYet: 'Inga användare ännu.',
      userCreatedTitle: 'Användare skapad',
      createUserErrorTitle: 'Kunde inte skapa användare',
      createUserErrorDescription: 'Kontrollera uppgifterna och försök igen.',
      updateUserErrorTitle: 'Kunde inte uppdatera användare',
      updateUserErrorDescription: 'Försök igen.',
      fillAllFieldsTitle: 'Fyll i alla fält',
      fillAllFieldsDescription: 'E-post, lösenord och roll krävs.',

      // test email
      testEmailTitle: 'Testa e-post',
      testEmailRecipientLabel: 'Mottagare',
      sendTestEmail: 'Skicka testmail',
      testEmailSentTitle: 'Testmail skickat',
      testEmailSentDescription: 'Kontrollera inkorgen för {email}.',
      testEmailErrorTitle: 'Kunde inte skicka testmail',
      testEmailErrorFallbackDescription: 'Kontrollera SMTP/Resend-inställningarna.',
      fillEmailTitle: 'Fyll i e-post',
      fillEmailDescription: 'Ange en mottagare för testmail.',
    },

    // ---- ServiceDashboard ----
    serviceDashboard: {
      title: 'Personalvy Serviceregister',
      tabNewTicket: 'Nytt Ärende',
      tabTicketList: 'Ärendelista',
    },

    // ---- ServiceRegister (ticket list) ----
    register: {
      searchPlaceholder: 'Sök på namn, ärendenummer eller modell...',
      showCompleted: 'Visa avslutade ärenden',
      columnTicketNo: 'ÄRENDENR',
      columnCustomer: 'KUND',
      columnDevice: 'ENHET',
      columnStatus: 'STATUS',
      noTicketsFound: 'Inga ärenden hittades.',
    },

    // ---- TicketRow ----
    tickets: {
      // statuses
      statusNew: 'Nytt',
      statusInProgress: 'Pågående',
      statusWaitingCustomer: 'Väntar på kund',
      statusCostApproved: 'Kostnadsförslag godkänt',
      statusCostDeclined: 'Kostnadsförslag nekat',
      statusDone: 'Färdig',
      statusClosed: 'Avslutad',

      // customer decision badges
      decisionApproved: 'Kund svar: Godkänd',
      decisionDeclined: 'Kund svar: Nekad',
      decisionPending: 'Kund svar: Väntar bedömning',
      decisionUnknown: 'Kund svar: Oklart svar',

      // channel labels
      channelUnknown: 'okänd kanal',
      channelSmsEmail: 'SMS + e-post',
      channelSms: 'SMS',
      channelEmail: 'E-post',

      // new message badge
      newMessage: 'Nytt meddelande',

      // customer info section
      customerInfoTitle: 'Kundinformation',
      notProvided: 'Ej angiven',
      primaryContact: 'Primär kontakt:',
      contactSms: 'SMS',
      contactEmail: 'E-post',
      contactAutomatic: 'Automatisk',
      disclaimerLanguage: 'Godkännande:',
      createdAt: 'Skapad:',

      // device info section
      deviceInfoTitle: 'Enhetsinformation',
      modelNotProvided: 'Modell ej angiven',
      issueDescription: 'Felbeskrivning:',
      customerNotes: 'Anteckningar från kund:',
      latestDiagnosis: 'Senaste diagnos:',

      // communication section
      communicationTitle: 'Kommunikation',
      loadingMessages: 'Laddar...',
      noCommunication: 'Ingen kommunikation loggad ännu.',
      outboundSender: 'Ni',
      subjectPlaceholder: 'Ämne',
      composeDefaultSubject: 'Re: Ärende #{ticketNumber}',
      composePlaceholder: 'Skriv meddelande till kunden...',
      aiSuggestTitle: 'Skapa AI-förslag',
      sendTitle: 'Skicka',

      // message detail dialog
      messageDetailTitle: 'Meddelandedetaljer',
      directionOutbound: 'Utgående',
      directionInbound: 'Inkommande',
      detailSubject: 'Ämne',
      detailBody: 'Text',
      noBodyReceived: '(Ingen brödtext mottagen i webhook)',
      parserLabel: 'Parser:',
      parserMethodUnknown: 'okänd',
      confidenceLabel: 'Säkerhet:',
      rawBodyTitle: 'Originalmail (rå text)',

      // handling section
      handlingTitle: 'Hantering',
      plannedActionsLabel: 'Planerade åtgärder',
      plannedActionsPlaceholder: 'Beskriv planerade åtgärder...',
      costProposalLabel: 'Kostnadsförslag (kr)',
      costProposalPlaceholder: 't.ex. 1299',
      sendCostProposal: 'Skicka kostnadsförslag',
      costProposalApprovedLabel: 'Kostnadsförslag godkänt',
      workDoneLabel: 'Utförda åtgärder',
      workDonePlaceholder: 'Beskriv vad som har gjorts...',
      finalCostLabel: 'Slutlig kostnad (kr)',
      finalCostPlaceholder: 't.ex. 1299',
      notifyRepairReady: 'Meddela att reparation är klar',
      internalNotesLabel: 'Interna anteckningar',
      internalNotesPlaceholder: 'Anteckningar endast för personal...',

      // finalize
      finalizeButton: 'Lämna ut & Skriv ut kvitto',
      ticketClosed: 'Ärende Avslutat',
      finalizeReceiptHint: 'Skapar ett tydligt kvitto för kunden.',
      closeWithoutAction: 'Avsluta utan åtgärd',
      reprintButton: 'Skriv ut igen',
      showButton: 'Visa',
      hideButton: 'Dölj',

      // toast messages
      messageBodyMissing: 'Meddelandetext saknas',
      sentTitle: 'Skickat',
      sentDescription: 'Meddelandet skickades till kunden.',
      sendErrorTitle: 'Kunde inte skicka',
      sendErrorFallback: 'Försök igen.',
      aiSuggestionReadyTitle: 'AI-förslag klart',
      aiSuggestionReadyDescription: 'Förslaget är anpassat till kundens språk ({language}).',
      aiSuggestionErrorTitle: 'AI-förslag misslyckades',
      aiSuggestionErrorFallback: 'Försök igen.',
      notesSavedTitle: 'Anteckningar sparade',
      actionsSavedTitle: 'Åtgärder sparade',
      costSavedTitle: 'Kostnad sparad',
      ticketUpdatedDescription: 'Ärende #{ticketNumber} har uppdaterats.',

      // approval
      approvingTitle: 'Godkänner...',
      approvingDescription: 'Vi fyller i utförda åtgärder och uppdaterar ärendet.',
      approvedTitle: 'Kostnadsförslag godkänt!',
      approvedDescription: 'Utförda åtgärder och slutlig kostnad är nu ifyllda men kan fortfarande justeras manuellt.',
      statusUpdatedTitle: 'Status uppdaterad',
      statusUpdatedDescription: 'Status för ärende #{ticketNumber} har ändrats till "{status}".',

      // permissions
      permissionMissingTitle: 'Behörighet saknas',
      permissionMissingDescription: 'Du har inte behörighet att uppdatera ärenden.',
      contactMissingTitle: 'Kontaktuppgift saknas',
      contactMissingDescription: 'Kan inte meddela kund eftersom varken telefonnummer eller e-postadress är registrerad.',

      // finalize toasts
      finalizeMissingTitle: 'Information saknas',
      finalizeMissingDescription: 'Fyll in \'Utförda åtgärder\' och \'Slutlig kostnad\' innan du kan avsluta ärendet.',
      creatingReceiptTitle: 'Skapar kvitto...',
      creatingReceiptDescription: 'Förbereder slutgiltigt kvitto.',
      printBlockedError: 'Utskriftsfönster blockerades.',
      ticketClosedTitle: 'Ärende avslutat!',
      ticketClosedDescription: 'Kvitto visat och ärende #{ticketNumber} markerat som avslutat.',
      finalizeErrorTitle: 'Ett fel uppstod',
      finalizeErrorDescription: 'Kunde inte skapa kvitto. Försök igen.',

      // close without action
      closeConfirm: 'Avsluta ärende #{ticketNumber} utan åtgärd?\nDetta markerar ärendet som Avslutad.',
      closedWithoutActionDefault: 'Avslutad utan åtgärd (kostnadsförslag nekat).',
      closedWithoutActionTitle: 'Ärende avslutat',
      closedWithoutActionDescription: 'Ärende #{ticketNumber} avslutades utan åtgärd.',
      closeErrorTitle: 'Kunde inte avsluta ärendet',
      closeErrorFallback: 'Försök igen.',

      // reprint
      reprintTitle: 'Utskrift skapad',
      reprintDescription: 'Inlämningskvitto för ärende #{ticketNumber} har skapats.',

      // hide/show
      hiddenTitle: 'Ärende dolt',
      visibleTitle: 'Ärende synligt',
      hiddenDescription: 'Ärende #{ticketNumber} är nu dolt i listan.',
      visibleDescription: 'Ärende #{ticketNumber} är nu synligt i listan.',
    },

    // ---- TicketActions ----
    ticketActions: {
      actionsLabel: 'Åtgärder:',
      notifyRepairReady: 'Meddela att reparation är klar',
      sendCostProposal: 'Skicka kostnadsförslag',
      permissionMissingTitle: 'Behörighet saknas',
      permissionMissingDescription: 'Du har inte behörighet att uppdatera ärenden.',
      emailMissingTitle: 'E-postadress saknas',
      emailMissingDescription: 'Kan inte meddela kund eftersom ingen e-postadress är registrerad.',
    },

    // ---- SuperAdminPage ----
    superadmin: {
      title: 'Super Admin',
      subtitle: 'Plattformsöversikt och tenanthantering.',
      backToDashboard: 'Tillbaka till dashboard',
      tabDashboard: 'Dashboard',
      tabTenants: 'Tenants',

      // Dashboard / usage
      usageTitle: 'Meddelandestatistik',
      dateFrom: 'Från',
      dateTo: 'Till',
      applyFilter: 'Filtrera',
      tenantColumn: 'Tenant',
      smsOutbound: 'SMS ut',
      smsInbound: 'SMS in',
      emailOutbound: 'E-post ut',
      emailInbound: 'E-post in',
      totalMessages: 'Totalt',
      summaryTitle: 'Sammanfattning',
      totalSmsOut: 'Totalt SMS ut',
      totalSmsIn: 'Totalt SMS in',
      totalEmailOut: 'Totalt e-post ut',
      totalEmailIn: 'Totalt e-post in',
      grandTotal: 'Totalt meddelanden',
      noUsageData: 'Ingen meddelandedata hittades.',
      usageErrorTitle: 'Kunde inte hämta statistik',
      usageErrorDescription: 'Försök igen.',

      // Tenants CRUD
      tenantsTitle: 'Alla tenants',
      createTenant: 'Skapa ny tenant',
      editTenant: 'Redigera tenant',
      tenantName: 'Namn',
      tenantSlug: 'Slug',
      tenantEmail: 'Support-e-post',
      tenantPhone: 'Supporttelefon',
      tenantActive: 'Aktiv',
      tenantInactive: 'Inaktiv',
      tenantCreatedAt: 'Skapad',
      brandConfig: 'Varumärkesconfig (JSON)',
      saveTenant: 'Spara',
      cancelEdit: 'Avbryt',
      noTenants: 'Inga tenants hittades.',
      tenantCreatedTitle: 'Tenant skapad',
      tenantUpdatedTitle: 'Tenant uppdaterad',
      tenantErrorTitle: 'Kunde inte spara tenant',
      tenantErrorDescription: 'Kontrollera uppgifterna och försök igen.',
      slugExistsError: 'En tenant med detta slug finns redan.',
      confirmDeactivate: 'Vill du inaktivera denna tenant?',
      confirmActivate: 'Vill du aktivera denna tenant?',
    },

    // ---- EmailTemplateDialog ----
    emailDialog: {
      costProposalTitle: 'Underlag för kostnadsförslag',
      repairReadyTitle: 'Meddelande till kund',
      costProposalDescription: 'Granska, kopiera och skicka detta kostnadsförslag till kunden.',
      repairReadyDescription: 'Granska, kopiera och skicka meddelande om färdig reparation.',

      templateLanguageLabel: 'Språk för mall',
      templateLanguagePlaceholder: 'Välj språk...',

      diagnosisLabel: 'Diagnos',
      costProposalFieldLabel: 'Kostnadsförslag (kr)',
      costProposalFieldPlaceholder: 'Ange total kostnad inkl. moms',
      translationHint: 'Översättning anpassas vid utskick.',
      repairReadyHint: 'Meddelandet skickas på kundens valda språk till alla tillgängliga kontaktvägar (SMS/e-post).',

      previewSubjectLabel: 'Ämne',
      previewBodyLabel: 'Meddelande',
      previewTranslationError: 'Förhandsvisning kunde inte översättas:',

      copyButton: 'Kopiera text',
      approveAndCopyButton: 'Godkänn & Kopiera',
      sendToCustomerButton: 'Skicka till kund',

      // toasts
      copiedTitle: 'Kopierat!',
      copiedCostDescription: 'Texten för kostnadsförslaget har kopierats till urklipp.',
      copiedGenericDescription: 'Texten har kopierats till urklipp.',
      costMissingTitle: 'Kostnad saknas',
      costMissingDescription: 'Ange kostnadsförslag innan du skickar.',
      sentTitle: 'Skickat!',
      sentBothDescription: 'SMS och e-post skickades till kunden.',
      sentSmsDescription: 'SMS skickades till kunden.',
      sentEmailDescription: 'E-post skickades till kunden.',
      sentGenericDescription: 'Skickat till kunden.',
      sendErrorTitle: 'Kunde inte skicka',
      sendErrorDescription: 'Kontrollera inställningar och försök igen.',
      diagnosisSavedTitle: 'Diagnos sparad',
      costSavedTitle: 'Kostnad sparad',
      ticketUpdatedDescription: 'Ärende #{ticketNumber} har uppdaterats.',
      languageUpdatedTitle: 'Språk uppdaterat',
      languageUpdatedDescription: 'Ärendets språk har ändrats.',
      previewErrorFallback: 'Kunde inte översätta förhandsvisning.',
    },
  },

  en: {
    // ---- DashboardPage ----
    dashboard: {
      loggedInAs: 'Logged in as',
      logout: 'Log out',
      staffView: 'Staff view',
      staffViewSubtitle: 'Here you can view and manage all submitted tickets.',
      registerNewTicket: 'Register new ticket',
    },

    // ---- LoginPage ----
    login: {
      title: 'Staff login',
      subtitle: 'Enter your credentials to continue',
      emailLabel: 'Email address',
      emailPlaceholder: 'name@company.com',
      passwordLabel: 'Password',
      loginButton: 'Log in',
      loginErrorTitle: 'Login error',
      loginErrorDescription: 'Check your email and password and try again.',
    },

    // ---- AdminPanel ----
    admin: {
      title: 'Admin panel',
      subtitle: 'Statistics and user management.',
      refreshStats: 'Refresh statistics',

      // tabs
      tabReports: 'Reports',
      tabUsers: 'Users',
      tabMessages: 'Messages',

      // message sub-tabs
      tabFooters: 'Footers',
      tabTemplates: 'Standard texts',
      tabAi: 'AI prompts',

      // reports
      totalTickets: 'Total tickets',
      closedTickets: 'Closed tickets',
      avgRepairTime: 'Avg. repair time',
      avgNotifyTime: 'Avg. done \u2192 notified',
      avgPickupTime: 'Avg. done \u2192 picked up',
      dateFrom: 'From',
      dateTo: 'To',
      applyFilter: 'Apply filter',

      // stats toasts
      statsErrorTitle: 'Could not fetch statistics',
      statsErrorDescription: 'Check permissions and try again.',

      // message settings
      chatDefaultLanguageLabel: 'Internal chat language (default)',
      chatDefaultLanguagePlaceholder: 'Select language',
      chatDefaultLanguageHint: 'Customer messages are shown in original + translation to this language (internal chat only).',
      autoTranslateButton: 'AI-translate all languages',
      autoTranslateButtonLoading: 'Translating...',
      autoTranslateHint: 'Fill in Swedish/English and let the system auto-translate and cache translations.',

      // footers
      emailFooterTitle: 'Email footer',
      smsFooterTitle: 'SMS footer',

      // templates
      costProposalTemplateTitle: 'Standard text: Cost proposal',
      costProposalTemplateHint: 'You can use variables: {{diagnosis}}, {{amount}}, {{ticket_number}}, {{customer_name}}.',
      repairReadyTemplateTitle: 'Standard text: Repair ready',
      repairReadyTemplateHint: 'You can use variables: {{work_done}}, {{final_cost}}, {{ticket_number}}, {{customer_name}}.',

      // auto-reply templates
      autoReplyApprovedTitle: 'Auto-reply: Cost proposal approved',
      autoReplyApprovedHint: 'Variables: {{customer_name}}, {{ticket_number}}, {{amount}}.',
      autoReplyDeclinedTitle: 'Auto-reply: Cost proposal declined',
      autoReplyDeclinedHint: 'Variables: {{customer_name}}, {{ticket_number}}, {{amount}}.',
      autoReplyUnclearTitle: 'Auto-reply: Unclear response',
      autoReplyUnclearHint: 'Variables: {{customer_name}}, {{ticket_number}}.',
      emailSubjectPlaceholder: 'Email subject',
      emailBodyPlaceholder: 'Email body',
      smsTextPlaceholder: 'SMS text',

      // AI prompts
      aiReplyPromptTitle: 'AI prompt: Reply assistant',
      aiSuggestionPromptTitle: 'AI prompt: Message suggestion',
      aiWorkDonePromptTitle: 'AI prompt: Work done',
      aiWorkDonePromptHint: 'Used when planned actions are converted to the work-done field.',

      // save message settings
      saveMessageSettings: 'Save message settings',
      saveMessageSettingsLoading: 'Saving...',
      savedTitle: 'Saved',
      savedDescription: 'Message settings updated.',
      saveErrorTitle: 'Could not save',
      saveErrorDescription: 'Try again.',

      // auto-translate toasts
      autoTranslateDoneTitle: 'Done',
      autoTranslateDoneDescription: 'Translations updated for all languages.',
      autoTranslateErrorTitle: 'Auto-translation failed',
      autoTranslateErrorDescription: 'Check DeepSeek key and try again.',

      // message settings fetch error
      messageSettingsErrorTitle: 'Could not fetch message settings',
      messageSettingsErrorDescription: 'Try again.',

      // users
      createUserTitle: 'Create user',
      nameLabel: 'Name',
      namePlaceholder: 'Optional',
      emailLabel: 'Email',
      emailPlaceholder: 'name@company.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'At least 8 characters',
      roleLabel: 'Role',
      rolePlaceholder: 'Select role',
      roleBase: 'Base',
      roleService: 'Service',
      roleAdmin: 'Admin',
      createUserButton: 'Create user',
      usersTitle: 'Users',
      noUsersYet: 'No users yet.',
      userCreatedTitle: 'User created',
      createUserErrorTitle: 'Could not create user',
      createUserErrorDescription: 'Check the details and try again.',
      updateUserErrorTitle: 'Could not update user',
      updateUserErrorDescription: 'Try again.',
      fillAllFieldsTitle: 'Fill in all fields',
      fillAllFieldsDescription: 'Email, password and role are required.',

      // test email
      testEmailTitle: 'Test email',
      testEmailRecipientLabel: 'Recipient',
      sendTestEmail: 'Send test email',
      testEmailSentTitle: 'Test email sent',
      testEmailSentDescription: 'Check the inbox for {email}.',
      testEmailErrorTitle: 'Could not send test email',
      testEmailErrorFallbackDescription: 'Check SMTP/Resend settings.',
      fillEmailTitle: 'Enter email',
      fillEmailDescription: 'Enter a recipient for the test email.',
    },

    // ---- ServiceDashboard ----
    serviceDashboard: {
      title: 'Staff view Service register',
      tabNewTicket: 'New Ticket',
      tabTicketList: 'Ticket list',
    },

    // ---- ServiceRegister (ticket list) ----
    register: {
      searchPlaceholder: 'Search by name, ticket number or model...',
      showCompleted: 'Show completed tickets',
      columnTicketNo: 'TICKET NO',
      columnCustomer: 'CUSTOMER',
      columnDevice: 'DEVICE',
      columnStatus: 'STATUS',
      noTicketsFound: 'No tickets found.',
    },

    // ---- TicketRow ----
    tickets: {
      // statuses
      statusNew: 'New',
      statusInProgress: 'In progress',
      statusWaitingCustomer: 'Waiting for customer',
      statusCostApproved: 'Cost proposal approved',
      statusCostDeclined: 'Cost proposal declined',
      statusDone: 'Done',
      statusClosed: 'Closed',

      // customer decision badges
      decisionApproved: 'Customer reply: Approved',
      decisionDeclined: 'Customer reply: Declined',
      decisionPending: 'Customer reply: Awaiting assessment',
      decisionUnknown: 'Customer reply: Unclear response',

      // channel labels
      channelUnknown: 'unknown channel',
      channelSmsEmail: 'SMS + email',
      channelSms: 'SMS',
      channelEmail: 'Email',

      // new message badge
      newMessage: 'New message',

      // customer info section
      customerInfoTitle: 'Customer information',
      notProvided: 'Not provided',
      primaryContact: 'Primary contact:',
      contactSms: 'SMS',
      contactEmail: 'Email',
      contactAutomatic: 'Automatic',
      disclaimerLanguage: 'Disclaimer:',
      createdAt: 'Created:',

      // device info section
      deviceInfoTitle: 'Device information',
      modelNotProvided: 'Model not provided',
      issueDescription: 'Issue description:',
      customerNotes: 'Notes from customer:',
      latestDiagnosis: 'Latest diagnosis:',

      // communication section
      communicationTitle: 'Communication',
      loadingMessages: 'Loading...',
      noCommunication: 'No communication logged yet.',
      outboundSender: 'You',
      subjectPlaceholder: 'Subject',
      composeDefaultSubject: 'Re: Ticket #{ticketNumber}',
      composePlaceholder: 'Write a message to the customer...',
      aiSuggestTitle: 'Generate AI suggestion',
      sendTitle: 'Send',

      // message detail dialog
      messageDetailTitle: 'Message details',
      directionOutbound: 'Outbound',
      directionInbound: 'Inbound',
      detailSubject: 'Subject',
      detailBody: 'Body',
      noBodyReceived: '(No body text received in webhook)',
      parserLabel: 'Parser:',
      parserMethodUnknown: 'unknown',
      confidenceLabel: 'Confidence:',
      rawBodyTitle: 'Original email (raw text)',

      // handling section
      handlingTitle: 'Handling',
      plannedActionsLabel: 'Planned actions',
      plannedActionsPlaceholder: 'Describe planned actions...',
      costProposalLabel: 'Cost proposal (SEK)',
      costProposalPlaceholder: 'e.g. 1299',
      sendCostProposal: 'Send cost proposal',
      costProposalApprovedLabel: 'Cost proposal approved',
      workDoneLabel: 'Work done',
      workDonePlaceholder: 'Describe what has been done...',
      finalCostLabel: 'Final cost (SEK)',
      finalCostPlaceholder: 'e.g. 1299',
      notifyRepairReady: 'Notify repair is ready',
      internalNotesLabel: 'Internal notes',
      internalNotesPlaceholder: 'Notes for staff only...',

      // finalize
      finalizeButton: 'Hand out & Print receipt',
      ticketClosed: 'Ticket Closed',
      finalizeReceiptHint: 'Creates a clear receipt for the customer.',
      closeWithoutAction: 'Close without action',
      reprintButton: 'Print again',
      showButton: 'Show',
      hideButton: 'Hide',

      // toast messages
      messageBodyMissing: 'Message text is missing',
      sentTitle: 'Sent',
      sentDescription: 'The message was sent to the customer.',
      sendErrorTitle: 'Could not send',
      sendErrorFallback: 'Try again.',
      aiSuggestionReadyTitle: 'AI suggestion ready',
      aiSuggestionReadyDescription: 'The suggestion is adapted to the customer\'s language ({language}).',
      aiSuggestionErrorTitle: 'AI suggestion failed',
      aiSuggestionErrorFallback: 'Try again.',
      notesSavedTitle: 'Notes saved',
      actionsSavedTitle: 'Actions saved',
      costSavedTitle: 'Cost saved',
      ticketUpdatedDescription: 'Ticket #{ticketNumber} has been updated.',

      // approval
      approvingTitle: 'Approving...',
      approvingDescription: 'We are filling in the work done and updating the ticket.',
      approvedTitle: 'Cost proposal approved!',
      approvedDescription: 'Work done and final cost are now filled in but can still be adjusted manually.',
      statusUpdatedTitle: 'Status updated',
      statusUpdatedDescription: 'Status for ticket #{ticketNumber} has been changed to "{status}".',

      // permissions
      permissionMissingTitle: 'Permission required',
      permissionMissingDescription: 'You do not have permission to update tickets.',
      contactMissingTitle: 'Contact info missing',
      contactMissingDescription: 'Cannot notify customer because neither phone number nor email address is registered.',

      // finalize toasts
      finalizeMissingTitle: 'Information missing',
      finalizeMissingDescription: 'Fill in "Work done" and "Final cost" before you can close the ticket.',
      creatingReceiptTitle: 'Creating receipt...',
      creatingReceiptDescription: 'Preparing the final receipt.',
      printBlockedError: 'Print window was blocked.',
      ticketClosedTitle: 'Ticket closed!',
      ticketClosedDescription: 'Receipt shown and ticket #{ticketNumber} marked as closed.',
      finalizeErrorTitle: 'An error occurred',
      finalizeErrorDescription: 'Could not create receipt. Try again.',

      // close without action
      closeConfirm: 'Close ticket #{ticketNumber} without action?\nThis marks the ticket as Closed.',
      closedWithoutActionDefault: 'Closed without action (cost proposal declined).',
      closedWithoutActionTitle: 'Ticket closed',
      closedWithoutActionDescription: 'Ticket #{ticketNumber} was closed without action.',
      closeErrorTitle: 'Could not close the ticket',
      closeErrorFallback: 'Try again.',

      // reprint
      reprintTitle: 'Print created',
      reprintDescription: 'Drop-off receipt for ticket #{ticketNumber} has been created.',

      // hide/show
      hiddenTitle: 'Ticket hidden',
      visibleTitle: 'Ticket visible',
      hiddenDescription: 'Ticket #{ticketNumber} is now hidden from the list.',
      visibleDescription: 'Ticket #{ticketNumber} is now visible in the list.',
    },

    // ---- TicketActions ----
    ticketActions: {
      actionsLabel: 'Actions:',
      notifyRepairReady: 'Notify repair is ready',
      sendCostProposal: 'Send cost proposal',
      permissionMissingTitle: 'Permission required',
      permissionMissingDescription: 'You do not have permission to update tickets.',
      emailMissingTitle: 'Email address missing',
      emailMissingDescription: 'Cannot notify customer because no email address is registered.',
    },

    // ---- SuperAdminPage ----
    superadmin: {
      title: 'Super Admin',
      subtitle: 'Platform overview and tenant management.',
      backToDashboard: 'Back to dashboard',
      tabDashboard: 'Dashboard',
      tabTenants: 'Tenants',

      // Dashboard / usage
      usageTitle: 'Message statistics',
      dateFrom: 'From',
      dateTo: 'To',
      applyFilter: 'Filter',
      tenantColumn: 'Tenant',
      smsOutbound: 'SMS out',
      smsInbound: 'SMS in',
      emailOutbound: 'Email out',
      emailInbound: 'Email in',
      totalMessages: 'Total',
      summaryTitle: 'Summary',
      totalSmsOut: 'Total SMS out',
      totalSmsIn: 'Total SMS in',
      totalEmailOut: 'Total email out',
      totalEmailIn: 'Total email in',
      grandTotal: 'Total messages',
      noUsageData: 'No message data found.',
      usageErrorTitle: 'Could not fetch statistics',
      usageErrorDescription: 'Try again.',

      // Tenants CRUD
      tenantsTitle: 'All tenants',
      createTenant: 'Create new tenant',
      editTenant: 'Edit tenant',
      tenantName: 'Name',
      tenantSlug: 'Slug',
      tenantEmail: 'Support email',
      tenantPhone: 'Support phone',
      tenantActive: 'Active',
      tenantInactive: 'Inactive',
      tenantCreatedAt: 'Created',
      brandConfig: 'Brand config (JSON)',
      saveTenant: 'Save',
      cancelEdit: 'Cancel',
      noTenants: 'No tenants found.',
      tenantCreatedTitle: 'Tenant created',
      tenantUpdatedTitle: 'Tenant updated',
      tenantErrorTitle: 'Could not save tenant',
      tenantErrorDescription: 'Check the details and try again.',
      slugExistsError: 'A tenant with this slug already exists.',
      confirmDeactivate: 'Do you want to deactivate this tenant?',
      confirmActivate: 'Do you want to activate this tenant?',
    },

    // ---- EmailTemplateDialog ----
    emailDialog: {
      costProposalTitle: 'Cost proposal details',
      repairReadyTitle: 'Message to customer',
      costProposalDescription: 'Review, copy and send this cost proposal to the customer.',
      repairReadyDescription: 'Review, copy and send the repair-ready message.',

      templateLanguageLabel: 'Template language',
      templateLanguagePlaceholder: 'Select language...',

      diagnosisLabel: 'Diagnosis',
      costProposalFieldLabel: 'Cost proposal (SEK)',
      costProposalFieldPlaceholder: 'Enter total cost incl. VAT',
      translationHint: 'Translation is adapted when sending.',
      repairReadyHint: 'The message is sent in the customer\'s chosen language to all available contact channels (SMS/email).',

      previewSubjectLabel: 'Subject',
      previewBodyLabel: 'Message',
      previewTranslationError: 'Preview could not be translated:',

      copyButton: 'Copy text',
      approveAndCopyButton: 'Approve & Copy',
      sendToCustomerButton: 'Send to customer',

      // toasts
      copiedTitle: 'Copied!',
      copiedCostDescription: 'The cost proposal text has been copied to the clipboard.',
      copiedGenericDescription: 'The text has been copied to the clipboard.',
      costMissingTitle: 'Cost missing',
      costMissingDescription: 'Enter a cost proposal before sending.',
      sentTitle: 'Sent!',
      sentBothDescription: 'SMS and email were sent to the customer.',
      sentSmsDescription: 'SMS was sent to the customer.',
      sentEmailDescription: 'Email was sent to the customer.',
      sentGenericDescription: 'Sent to the customer.',
      sendErrorTitle: 'Could not send',
      sendErrorDescription: 'Check settings and try again.',
      diagnosisSavedTitle: 'Diagnosis saved',
      costSavedTitle: 'Cost saved',
      ticketUpdatedDescription: 'Ticket #{ticketNumber} has been updated.',
      languageUpdatedTitle: 'Language updated',
      languageUpdatedDescription: 'The ticket language has been changed.',
      previewErrorFallback: 'Could not translate the preview.',
    },
  },
};

// ---------------------------------------------------------------------------
// Hook -- returns the translation object for the requested language.
// Falls back to Swedish if the language is not available.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';

/**
 * Returns the UI translation strings for the given language code.
 *
 * @param {string} language - ISO 639-1 language code (e.g. 'sv', 'en').
 * @returns {object} The translation object for the requested language.
 *
 * @example
 *   const t = useUiTranslation('en');
 *   console.log(t.dashboard.logout); // 'Log out'
 */
export function useUiTranslation(language) {
  return useMemo(
    () => uiTranslations[language] || uiTranslations.sv,
    [language]
  );
}
