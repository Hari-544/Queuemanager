/*
 * QueueManager - English / Telugu strings and formatting.
 * Plain text only (no HTML) so everything is XSS-safe by construction.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.QEI18N = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LANG_KEY = 'queueease.lang';

  var STR = {
    /* ---------------- header / chrome ---------------- */
    skip_link: { en: 'Skip to main content', te: 'ప్రధాన విషయానికి వెళ్లండి' },
    brand_sub: { en: 'Less waiting. Better service.', te: 'తక్కువ వేచి ఉండటం. మెరుగైన సేవ.' },
    nav_citizen: { en: 'Citizen', te: 'పౌరులు' },
    nav_book: { en: 'Book', te: 'బుక్' },
    nav_mytokens: { en: 'My tokens', te: 'నా టోకెన్లు' },
    nav_staff: { en: 'Staff page', te: 'సిబ్బంది పేజీ' },
    nav_display: { en: 'Display board', te: 'డిస్‌ప్లే బోర్డు' },
    nav_how: { en: 'How it works', te: 'ఇది ఎలా పనిచేస్తుంది' },
    lang_label: { en: 'Language', te: 'భాష' },
    doc_title_citizen: { en: 'QueueManager - Book an appointment', te: 'క్యూఈజ్ - డెమో అపాయింట్‌మెంట్ బుక్ చేయండి' },
    doc_title_staff: { en: 'QueueManager - Staff demonstration', te: 'క్యూఈజ్ - సిబ్బంది ప్రదర్శన' },
    doc_title_display: { en: 'QueueManager - Now serving display', te: 'క్యూఈజ్ - ప్రస్తుత సేవా ప్రదర్శన' },

    /* ---------------- citizen hero ---------------- */
    hero_eyebrow: { en: 'Community Service Internship demonstration', te: 'కమ్యూనిటీ సర్వీస్ ఇంటర్న్‌షిప్ ప్రదర్శన' },
    hero_title: { en: 'Book a token. Skip the long queue.', te: 'టోకెన్ బుక్ చేయండి. పొడవైన క్యూను దాటండి.' },
    hero_lead: {
      en: 'Choose a service counter, pick a date and time slot, and receive a queue token. Follow your status online instead of standing in line.',
      te: 'డెమో సేవా కౌంటర్‌ను ఎంచుకోండి, తేదీ మరియు సమయాన్ని ఎంచుకోండి, క్యూ టోకెన్ పొందండి. వరుసలో నిలబడకుండా మీ స్థితిని ఆన్‌లైన్‌లో తెలుసుకోંడి.'
    },
    hero_cta_book: { en: 'Book an appointment', te: 'అపాయింట్‌మెంట్ బుక్ చేయండి' },
    hero_cta_staff: { en: 'Open staff page', te: 'సిబ్బంది పేజీ తెరవండి' },
    hero_storage_note: {
      en: 'Saved only in this browser. Queues do not sync between phones or computers.',
      te: 'ఈ బ్రౌజర్‌లో మాత్రమే భద్రపరచబడుతుంది. డెమో క్యూలు ఫోన్లు లేదా కంప్యూటర్ల మధ్య సమకాలీకరించబడవు.'
    },

    /* ---------------- stats ---------------- */
    stat_waiting: { en: 'Waiting', te: 'వేచి ఉన్నవి' },
    stat_serving: { en: 'Now serving', te: 'సేవ జరుగుతోంది' },
    stat_completed: { en: 'Completed', te: 'పూర్తయినవి' },
    stat_total: { en: 'Tokens today', te: 'ఈరోజు టోకెన్లు' },
    stat_all_records: { en: 'All records', te: 'అన్ని రికార్డులు' },
    summary_all_note: { en: 'Counts across every demo record in this browser.', te: 'ఈ బ్రౌజర్‌లోని అన్ని డెమో రికార్డుల గణనలు.' },
    stat_cancelled: { en: 'Cancelled', te: 'రద్దయినవి' },
    stat_noshow: { en: 'No-show', te: 'హాజరు కానివి' },
    stats_today_note: { en: 'Counts for today across all counters.', te: 'అన్ని కౌంటర్లలో ఈరోజు గణనలు.' },

    /* ---------------- offices ---------------- */
    offices_eyebrow: { en: 'Counters', te: 'కౌంటర్లు' },
    offices_title: { en: 'Choose a office', te: 'డెమో కార్యాలయాన్ని ఎంచుకోండి' },
    offices_sub: {
      en: 'Four fictional public-service counters for demonstration. Real offices are not connected.',
      te: 'ప్రదర్శన కోసం నాలుగు కల్పిత ప్రజా సేవా కౌంటర్లు. నిజమైన కార్యాలయాలు అనుసంధానించబడలేదు.'
    },
    office_services_n: { en: '{n} services', te: '{n} సేవలు' },
    office_waiting_n: { en: '{n} waiting today', te: 'ఈరోజు {n} వేచి ఉన్నాయి' },
    btn_use_office: { en: 'Book at this office', te: 'ఈ కార్యాలయంలో బుక్ చేయండి' },
    open_today: { en: 'Open today', te: 'ఈరోజు తెరిచి ఉంది' },
    closed_today: { en: 'Closed today', te: 'ఈరోజు మూసి ఉంది' },
    avg_label_short: { en: 'About {m} min per token', te: 'టోకెన్‌కు సుమారు {m} నిమిషాలు' },

    /* ---------------- booking form ---------------- */
    book_eyebrow: { en: 'Reserve a place', te: 'స్థానం రిజర్వ్ చేయండి' },
    book_title: { en: 'Book an appointment', te: 'అపాయింట్‌మెంట్ బుక్ చేయండి' },
    book_sub: { en: 'Takes less than a minute. You get a token instantly.', te: 'నిమిషం కంటే తక్కువ సమయం పడుతుంది. వెంటనే టోకెన్ పొందుతారు.' },
    f_office: { en: 'Office', te: 'కార్యాలయం' },
    f_service: { en: 'Service', te: 'సేవ' },
    f_channel: { en: 'Visit type', te: 'సందర్శన రకం' },
    ch_appt: { en: 'Appointment', te: 'అపాయింట్‌మెంట్' },
    ch_appt_sub: { en: 'Pick a date and time slot', te: 'తేదీ మరియు సమయం ఎంచుకోండి' },
    ch_walkin: { en: 'Walk-in token', te: 'వాక్-ఇన్ టోకెన్' },
    ch_walkin_sub: { en: 'For today, at the counter now', te: 'ఈరోజు, ఇప్పుడు కౌంటర్ వద్ద' },
    f_date: { en: 'Date', te: 'తేదీ' },
    f_time: { en: 'Time slot', te: 'సమయ స్లాట్' },
    choose_slot: { en: 'Choose a slot', te: 'స్లాట్ ఎంచుకోండి' },
    slots_left_n: { en: '{n} places left', te: '{n} స్థానాలు మిగిలి ఉన్నాయి' },
    slot_full: { en: 'Full', te: 'నిండింది' },
    date_range_hint: { en: 'Bookings open from {min} to {max}.', te: 'బుకింగులు {min} నుండి {max} వరకు.' },
    closed_day_note: { en: 'This office is closed on the selected date. Pick another date.', te: 'ఎంచుకున్న తేదీన ఈ కార్యాలయం మూసి ఉంటుంది. మరో తేదీ ఎంచుకోండి.' },
    f_name: { en: 'Display name or alias', te: 'ప్రదర్శన పేరు లేదా మారుపేరు' },
    name_hint: {
      en: 'A first name or nickname is enough. Do NOT enter Aadhaar, phone numbers or ID numbers.',
      te: 'మొదటి పేరు లేదా ముద్దుపేరు చాలు. ఆధార్, ఫోన్ నంబర్లు లేదా ID నంబర్లు నమోదు చేయవద్దు.'
    },
    name_ph: { en: 'e.g. Anitha', te: 'ఉదా. అనిత' },
    f_note: { en: 'Short note (optional)', te: 'చిన్న గమనిక (ఐచ్ఛికం)' },
    note_hint: { en: 'For example “certificate copy”. Never enter sensitive details.', te: 'ఉదాహరణకు “సర్టిఫికెట్ కాపీ”. సున్నితమైన వివరాలు ఎప్పుడూ నమోదు చేయవద్దు.' },
    note_ph: { en: 'e.g. certificate copy', te: 'ఉదా. సర్టిఫికెట్ కాపీ' },
    btn_get_token: { en: 'Get queue token', te: 'క్యూ టోకెన్ పొందండి' },
    btn_sending: { en: 'Creating token...', te: 'టోకెన్ సృష్టిస్తోంది...' },
    btn_clear: { en: 'Clear', te: 'తొలగించండి' },
    form_error_title: { en: 'Please fix the following:', te: 'దయచేసి ఈ క్రింది వాటిని సరిచేయండి:' },

    /* ---------------- confirmation ---------------- */
    conf_title: { en: 'Booking confirmed', te: 'బుకింగ్ నిర్ధారించబడింది' },
    conf_lead: {
      en: 'Show this token at the demo counter. This is not a real government appointment.',
      te: 'డెమో కౌంటర్ వద్ద ఈ టోకెన్ చూపించండి. ఇది నిజమైన ప్రభుత్వ అపాయింట్‌మెంట్ కాదు.'
    },
    c_token: { en: 'Queue token', te: 'క్యూ టోకెన్' },
    c_reference: { en: 'Booking reference', te: 'బుకింగ్ రిఫరెన్స్' },
    c_ref_hint: { en: 'Write this down. You can check your status with it.', te: 'దీన్ని రాసుకోండి. దీంతో మీ స్థితిని తెలుసుకోవచ్చు.' },
    c_office: { en: 'Office', te: 'కార్యాలయం' },
    c_service: { en: 'Service', te: 'సేవ' },
    c_when: { en: 'Date and time', te: 'తేదీ మరియు సమయం' },
    c_name: { en: 'Name', te: 'పేరు' },
    c_status: { en: 'Status', te: 'స్థితి' },
    c_ahead: { en: 'People ahead', te: 'ముందు ఉన్నవారు' },
    c_estwait: { en: 'Estimated wait', te: 'అంచనా వేచి ఉండే సమయం' },
    est_disclaimer: { en: 'Illustrative estimate only - not a guaranteed waiting time.', te: 'కేవలం అంచనా మాత్రమే - ఖచ్చితమైన వేచి ఉండే సమయం కాదు.' },
    btn_new: { en: 'Book another', te: 'మరొకటి బుక్ చేయండి' },
    btn_print: { en: 'Print token', te: 'టోకెన్ ముద్రించండి' },
    btn_track: { en: 'Track status', te: 'స్థితి తెలుసుకోండి' },

    /* ---------------- my tokens ---------------- */
    my_eyebrow: { en: 'Your bookings', te: 'మీ బుకింగులు' },
    my_title: { en: 'My tokens', te: 'నా టోకెన్లు' },
    my_sub: { en: 'Tokens created in this browser. They do not sync to other devices.', te: 'ఈ బ్రౌజర్‌లో సృష్టించిన టోకెన్లు. ఇవి ఇతర పరికరాలకు వెళ్లవు.' },
    empty_tokens_title: { en: 'No tokens yet', te: 'ఇంకా టోకెన్లు లేవు' },
    empty_tokens_body: { en: 'Create a demo appointment above and your token will appear here.', te: 'పైన డెమో అపాయింట్‌మెంట్ సృష్టించండి, మీ టోకెన్ ఇక్కడ కనిపిస్తుంది.' },
    btn_go_book: { en: 'Book an appointment', te: 'అపాయింట్‌మెంట్ బుక్ చేయండి' },
    track_title: { en: 'Track a token', te: 'టోకెన్‌ను ట్రాక్ చేయండి' },
    track_sub: { en: 'Enter a booking reference (like QE-AB12CD) or token (like A-001).', te: 'బుకింగ్ రిఫరెన్స్ (QE-AB12CD వంటిది) లేదా టోకెన్ (A-001 వంటిది) నమోదు చేయండి.' },
    track_label: { en: 'Reference or token', te: 'రిఫరెన్స్ లేదా టోకెన్' },
    track_btn: { en: 'Check status', te: 'స్థితి చూడండి' },
    btn_save_token: { en: 'Save to my tokens', te: 'నా టోకెన్లలో భద్రపరచండి' },
    btn_saved_token: { en: 'Saved to my tokens', te: 'నా టోకెన్లలో భద్రపరచబడింది' },
    track_not_found: { en: 'Nothing found for “{q}” in this browser.', te: 'ఈ బ్రౌజర్‌లో “{q}” కోసం ఏమీ కనబడలేదు.' },
    btn_cancel_booking: { en: 'Cancel this booking', te: 'ఈ బుకింగ్‌ను రద్దు చేయండి' },
    confirm_cancel_own: { en: 'Cancel token {token}?', te: 'టోకెన్ {token} ను రద్దు చేయాలా?' },
    btn_remove: { en: 'Remove', te: 'తొలగించండి' },
    btn_archive: { en: 'Archive completed', te: 'పూర్తయినదాన్ని ఆర్కైవ్ చేయండి' },
    confirm_archive: { en: 'Archive completed token {token}? It will leave active views but remain available to administrators in history.', te: 'పూర్తయిన టోకెన్ {token} ను ఆర్కైవ్ చేయాలా? ఇది యాక్టివ్ వీక్షణల నుండి తొలగి నిర్వాహకుల చరిత్రలో ఉంటుంది.' },
    msg_ARCHIVED: { en: 'Token {token} was archived.', te: 'టోకెన్ {token} ఆర్కైవ్ చేయబడింది.' },

    /* ---------------- how it works ---------------- */
    how_title: { en: 'How the works', te: 'ఎలా పనిచేస్తుంది' },
    how_sub: { en: 'Follow these steps to try the full citizen-to-staff flow.', te: 'పౌరుడి నుండి సిబ్బంది వరకు పూర్తి ప్రవాహాన్ని ప్రయత్నించడానికి ఈ దశలను అనుసరించండి.' },
    step1: { en: 'Open the citizen page and choose an office and service.', te: 'పౌరుల పేజీ తెరిచి కార్యాలయం, సేవను ఎంచుకోండి.' },
    step2: { en: 'Pick a date and an available time slot.', te: 'తేదీ మరియు అందుబాటులో ఉన్న సమయాన్ని ఎంచుకోండి.' },
    step3: { en: 'Receive a unique token and reference.', te: 'ప్రత్యేక టోకెన్ మరియు రిఫరెన్స్ పొందండి.' },
    step4: { en: 'Open the staff page.', te: 'సిబ్బంది పేజీ తెరవండి.' },
    step5: { en: 'Call the token and change its status.', te: 'టోకెన్‌ను పిలిచి దాని స్థితిని మార్చండి.' },
    step6: { en: 'Complete the appointment.', te: 'అపాయింట్‌మెంట్‌ను పూర్తి చేయండి.' },
    step7: { en: 'Watch the dashboard counts update.', te: 'డాష్‌బోర్డ్ గణనలు మారడం చూడండి.' },

    /* ---------------- staff page ---------------- */
    staff_eyebrow: { en: 'Service provider tools', te: 'సేవా ప్రదాత సాధనాలు' },
    staff_title: { en: 'Staff demonstration', te: 'సిబ్బంది ప్రదర్శన' },
    staff_sub: { en: 'Call tokens, update statuses and watch the queue move.', te: 'టోకెన్లను పిలవండి, స్థితులను నవీకరించండి, క్యూ కదలడం చూడండి.' },
    staff_demo_warn: {
      en: 'there is no login. Anyone using this browser can change these demo records. Never use this for real queues.',
      te: 'లాగిన్ లేదు. ఈ బ్రౌజర్ వాడే ఎవరైనా ఈ డెమో రికార్డులను మార్చవచ్చు. నిజమైన క్యూల కోసం దీన్ని ఎప్పుడూ వాడవద్దు.'
    },
    call_next: { en: 'Call next token', te: 'తదుపరి టోకెన్‌ను పిలవండి' },
    call_for: { en: 'Call next for the selected office and date', te: 'ఎంచుకున్న కార్యాలయం, తేదీ కోసం తదుపరిని పిలవండి' },
    filters_title: { en: 'Filters', te: 'వడపోతలు' },
    f_office_f: { en: 'Office', te: 'కార్యాలయం' },
    f_service_f: { en: 'Service', te: 'సేవ' },
    f_status_f: { en: 'Status', te: 'స్థితి' },
    f_date_f: { en: 'Date', te: 'తేదీ' },
    f_search: { en: 'Search', te: 'వెతకండి' },
    search_ph: { en: 'Token, reference or name', te: 'టోకెన్, రిఫరెన్స్ లేదా పేరు' },
    opt_all: { en: 'All', te: 'అన్నీ' },
    btn_clear_filters: { en: 'Clear filters', te: 'వడపోతలు తొలగించండి' },
    list_title: { en: 'Queue entries', te: 'క్యూ నమోదులు' },
    showing_n: { en: 'Showing {a} of {b}', te: '{b} లో {a} చూపిస్తోంది' },
    empty_staff_title: { en: 'No bookings match', te: 'సరిపోలే బుకింగులు లేవు' },
    empty_staff_body: { en: 'Try clearing the filters, or create a walk-in token below.', te: 'వడపోతలను తొలగించి ప్రయత్నించండి లేదా కింద వాక్-ఇన్ టోకెన్ సృష్టించండి.' },
    th_token: { en: 'Token', te: 'టోకెన్' },
    th_name: { en: 'Name', te: 'పేరు' },
    th_details: { en: 'Service and time', te: 'సేవ మరియు సమయం' },
    th_status: { en: 'Status', te: 'స్థితి' },
    th_actions: { en: 'Actions', te: 'చర్యలు' },
    act_start: { en: 'Start serving', te: 'సేవ ప్రారంభించండి' },
    act_complete: { en: 'Complete', te: 'పూర్తి చేయండి' },
    act_cancel: { en: 'Cancel', te: 'రద్దు చేయండి' },
    act_noshow: { en: 'No-show', te: 'హాజరు కాలేదు' },
    act_reopen: { en: 'Back to Waiting', te: 'వేచి ఉండటానికి తిరిగి' },
    set_status_label: { en: 'Set status', te: 'స్థితిని మార్చండి' },
    demo_badge: { en: 'Demo', te: 'డెమో' },
    walkin_badge: { en: 'Walk-in', te: 'వాక్-ఇన్' },
    appt_badge: { en: 'Appointment', te: 'అపాయింట్‌మెంట్' },
    ahead_n: { en: '{n} ahead', te: '{n} ముందు' },
    est_n: { en: 'About {m} min', te: 'సుమారు {m} నిమి' },
    tools_title: { en: 'Tools', te: 'సాధనాలు' },
    btn_walkin_new: { en: 'New walk-in token', te: 'కొత్త వాక్-ఇన్ టోకెన్' },
    walkin_title: { en: 'Create a walk-in token', te: 'వాక్-ఇన్ టోకెన్ సృష్టించండి' },
    walkin_sub: { en: 'Issued for today at the selected office. No date or slot needed.', te: 'ఎంచుకున్న కార్యాలయంలో ఈరోజుకు జారీ చేస్తారు. తేదీ లేదా స్లాట్ అవసరం లేదు.' },
    btn_export_csv: { en: 'Export CSV', te: 'CSV ఎగుమతి' },
    btn_export_json: { en: 'Export JSON', te: 'JSON ఎగుమతి' },
    btn_load_demo: { en: 'Load sample data', te: 'నమూనా డేటా లోడ్ చేయండి' },
    btn_reset: { en: 'Reset data', te: 'డేటా రీసెట్ చేయండి' },
    reset_title: { en: 'Reset data?', te: 'డేటాను రీసెట్ చేయాలా?' },
    reset_body: {
      en: 'This permanently deletes every record in this browser, including tokens you just created. This cannot be undone.',
      te: 'ఇది మీరు ఇప్పుడే సృష్టించిన టోకెన్లతో సహా ఈ బ్రౌజర్‌లోని అన్ని రికార్డులను శాశ్వతంగా తొలగిస్తుంది. దీన్ని రద్దు చేయలేరు.'
    },
    reset_type: { en: 'Type RESET to confirm', te: 'నిర్ధారించడానికి RESET అని టైప్ చేయండి' },
    reset_confirm: { en: 'Delete all demo records', te: 'అన్ని డెమో రికార్డులను తొలగించండి' },
    btn_keep: { en: 'Keep my data', te: 'నా డేటాను ఉంచండి' },
    settings_title: { en: 'Settings', te: 'సెట్టింగులు' },
    settings_sub: {
      en: 'Average service time drives the illustrative wait estimate. Changes apply to new estimates only.',
      te: 'సగటు సేవా సమయం అంచనా వేచి ఉండే సమయాన్ని నిర్ణయిస్తుంది. మార్పులు కొత్త అంచనాలకు మాత్రమే వర్తిస్తాయి.'
    },
    avg_label: { en: 'Average minutes per token', te: 'టోకెన్‌కు సగటు నిమిషాలు' },
    btn_save_settings: { en: 'Save settings', te: 'సెట్టింగులను భద్రపరచండి' },

    /* ---------------- statuses ---------------- */
    st_Booked: { en: 'Booked', te: 'బుక్ చేయబడింది' },
    st_Waiting: { en: 'Waiting', te: 'వేచి ఉంది' },
    st_Serving: { en: 'Serving', te: 'సేవ జరుగుతోంది' },
    st_Completed: { en: 'Completed', te: 'పూర్తయింది' },
    st_Cancelled: { en: 'Cancelled', te: 'రద్దయింది' },
    'st_No-show': { en: 'No-show', te: 'హాజరు కాలేదు' },

    /* ---------------- engine messages ---------------- */
    err_OFFICE_INVALID: { en: 'Choose a office.', te: 'కార్యాలయాన్ని ఎంచుకోండి.' },
    err_SERVICE_INVALID: { en: 'Choose a service.', te: 'సేవను ఎంచుకోండి.' },
    err_SERVICE_OFFICE_MISMATCH: { en: 'That service does not belong to the selected office.', te: 'ఆ సేవ ఎంచుకున్న కార్యాలయానికి చెందినది కాదు.' },
    err_NAME_REQUIRED: { en: 'Enter a display name or alias.', te: 'ప్రదర్శన పేరు లేదా మారుపేరు నమోదు చేయండి.' },
    err_NAME_INVALID: { en: 'Use 2-40 letters, spaces, dots or hyphens. Do not enter ID numbers.', te: '2-40 అక్షరాలు, ఖాళీలు, చుక్కలు లేదా హైఫన్లు వాడండి. ID నంబర్లు నమోదు చేయవద్దు.' },
    err_DATE_INVALID: { en: 'Choose a valid date.', te: 'చెల్లుబాటు అయ్యే తేదీని ఎంచుకోండి.' },
    err_DATE_PAST: { en: 'The chosen date is in the past.', te: 'ఎంచుకున్న తేదీ గతంలో ఉంది.' },
    err_DATE_TOO_FAR: { en: 'Bookings open for the next {days} days only.', te: 'బుకింగులు కేవలం తదుపరి {days} రోజులకు మాత్రమే.' },
    err_OFFICE_CLOSED: { en: 'The selected office is closed on that date.', te: 'ఎంచుకున్న కార్యాలయం ఆ తేదీన మూసి ఉంటుంది.' },
    err_TIME_INVALID: { en: 'Choose a valid time slot.', te: 'చెల్లుబాటు అయ్యే సమయ స్లాట్‌ను ఎంచుకోండి.' },
    err_TIME_PAST: { en: 'That slot has already started today. Choose a later slot.', te: 'ఆ స్లాట్ ఈరోజు ఇప్పటికే ప్రారంభమైంది. తర్వాతి స్లాట్‌ను ఎంచుకోండి.' },
    err_SLOT_FULL: { en: 'That slot is full for this demo office. Choose another slot.', te: 'ఈ డెమో కార్యాలయంలో ఆ స్లాట్ నిండిపోయింది. మరో స్లాట్‌ను ఎంచుకోండి.' },
    err_WALKIN_NOT_TODAY: { en: 'Walk-in tokens are issued for today only.', te: 'వాక్-ఇన్ టోకెన్లు ఈరోజుకు మాత్రమే ఇస్తారు.' },
    err_WALKIN_CLOSED: { en: 'The counter is closed now. Walk-in tokens are unavailable.', te: 'కౌంటర్ ఇప్పుడు మూసి ఉంది. వాక్-ఇన్ టోకెన్లు అందుబాటులో లేవు.' },
    err_WALKIN_LUNCH: { en: 'The counter is on lunch break. Walk-in tokens are unavailable.', te: 'కౌంటర్ భోజన విరామంలో ఉంది. వాక్-ఇన్ టోకెన్లు అందుబాటులో లేవు.' },
    err_WALKIN_DISABLED: { en: 'Walk-in tokens are disabled for this demo office.', te: 'ఈ డెమో కార్యాలయంలో వాక్-ఇన్ టోకెన్లు నిలిపివేయబడ్డాయి.' },
    err_WALKIN_STAFF_ONLY: { en: 'Walk-in tokens are issued by staff. Choose an appointment instead.', te: 'వాక్-ఇన్ టోకెన్లను సిబ్బంది జారీ చేస్తారు. బదులుగా అపాయింట్‌మెంట్ ఎంచుకోండి.' },
    err_ALLOC_FAILED: { en: 'Could not allocate a token. Please retry.', te: 'టోకెన్ కేటాయించలేకపోయింది. దయచేసి మళ్లీ ప్రయత్నించండి.' },
    err_DUPLICATE_BOOKING: { en: 'You already have a booking in this slot.', te: 'మీకు ఈ స్లాట్‌లో ఇప్పటికే బుకింగ్ ఉంది.' },
    err_TOO_MANY_ACTIVE: { en: 'Demo limit: at most {max} active tokens per person per day.', te: 'డెమో పరిమితి: రోజుకు ఒక్కొక్కరికి గరిష్ఠంగా {max} చురుకైన టోకెన్లు.' },
    err_ALREADY_SERVING: {
      en: 'Token {token} is being served. Complete, cancel or mark it No-show before calling the next token.',
      te: 'టోకెన్ {token} కు సేవ జరుగుతోంది. తదుపరి టోకెన్‌ను పిలవడానికి ముందు దాన్ని పూర్తి చేయండి, రద్దు చేయండి లేదా హాజరు కాలేదు అని గుర్తించండి.'
    },
    err_QUEUE_EMPTY: { en: 'No waiting tokens in this queue.', te: 'ఈ వరుసలో వేచి ఉన్న టోకెన్లు లేవు.' },
    err_NOT_FOUND: { en: 'Token not found.', te: 'టోకెన్ కనబడలేదు.' },
    err_STATUS_INVALID: { en: 'Unknown status.', te: 'తెలియని స్థితి.' },
    err_NO_CHANGE: { en: 'Token {token} is already {status}.', te: 'టోకెన్ {token} ఇప్పటికే {status} స్థితిలో ఉంది.' },
    err_TRANSITION_INVALID: { en: 'A {from} token cannot be changed to {to}.', te: '{from} స్థితిలోని టోకెన్‌ను {to} గా మార్చలేరు.' },
    msg_CALLED: { en: 'Now serving token {token}.', te: 'టోకెన్ {token} కు ఇప్పుడు సేవ జరుగుతోంది.' },
    msg_UPDATED: { en: 'Token {token} is now {status}.', te: 'టోకెన్ {token} ఇప్పుడు {status}.' },
    msg_CREATED: { en: 'Token created: {token}. This is not a real appointment.', te: 'టోకెన్ సృష్టించబడింది: {token}. ఇది నిజమైన అపాయింట్‌మెంట్ కాదు.' },
    msg_EXPORTED: { en: 'Downloaded {file} with {n} records.', te: '{n} రికార్డులతో {file} డౌన్‌లోడ్ అయింది.' },
    msg_SETTINGS_SAVED: { en: 'Settings saved.', te: 'సెట్టింగులు భద్రపరచబడ్డాయి.' },
    msg_RESET_DONE: { en: 'Data cleared.', te: 'డేటా తొలగించబడింది.' },
    msg_DEMO_LOADED: { en: 'Sample demo data loaded.', te: 'నమూనా డెమో డేటా లోడ్ అయింది.' },
    msg_REMOVED: { en: 'Record removed from this browser.', te: 'రికార్డు ఈ బ్రౌజర్ నుండి తొలగించబడింది.' },

    /* ---------------- dynamic fragments ---------------- */
    pos_next: { en: 'You are next - no one is ahead of you.', te: 'మీరే తదుపరి - మీ ముందు ఎవరూ లేరు.' },
    pos_booked: { en: 'Booked for {date}. You join the waiting line on the day.', te: '{date} కు బుక్ చేయబడింది. ఆ రోజు మీరు వేచి ఉన్న వరుసలో చేరుతారు.' },
    pos_n: { en: '{n} ahead of you.', te: 'మీ ముందు {n} మంది ఉన్నారు.' },
    pos_not_waiting: { en: 'Not in the waiting line.', te: 'వేచి ఉన్న వరుసలో లేరు.' },
    est_zero: { en: 'Your turn is near.', te: 'మీ వంతు దగ్గరలో ఉంది.' },
    today_label: { en: 'Today', te: 'ఈరోజు' },
    tomorrow_label: { en: 'Tomorrow', te: 'రేపు' },
    min_abbr: { en: 'min', te: 'నిమి' },

    /* ---------------- display board ---------------- */
    display_eyebrow: { en: 'Public display', te: 'పబ్లిక్ ప్రదర్శన' },
    display_title: { en: 'Now serving', te: 'ఇప్పుడు సేవలో' },
    display_sub: { en: 'Live counter display for the demo queues. Refreshes automatically.', te: 'డెమో క్యూల ప్రత్యక్ష కౌంటర్ ప్రదర్శన. స్వయంచాలకంగా నవీకరించబడుతుంది.' },
    display_waiting_title: { en: 'Waiting today', te: 'ఈరోజు వేచి ఉన్నవి' },
    display_none_serving: { en: 'No token is being served right now.', te: 'ప్రస్తుతం ఏ టోకెన్‌కు సేవ జరగడం లేదు.' },
    display_none_waiting: { en: 'No waiting tokens.', te: 'వేచి ఉన్న టోకెన్లు లేవు.' },
    display_updated: { en: 'Updated {time}', te: '{time} కు నవీకరించబడింది' },
    display_auto: { en: 'Auto-refreshes every 10 seconds.', te: 'ప్రతి 10 సెకన్లకు స్వయంచాలకంగా నవీకరిస్తుంది.' },
    display_at_office: { en: 'at {office}', te: '{office} వద్ద' },

    /* ---------------- server mode / auth / admin ---------------- */
    mode_server: { en: 'Connected to demo server', te: 'డెమో సర్వర్‌కు కనెక్ట్ అయింది' },
    mode_local: { en: 'Local demo mode (this browser only)', te: 'స్థానిక డెమో మోడ్ (ఈ బ్రౌజర్ మాత్రమే)' },
    auth_title: { en: 'Staff sign-in', te: 'సిబ్బంది సైన్-ఇన్' },
    auth_sub: { en: 'Sign in to manage the demo queue. Sessions last 12 hours.', te: 'డెమో క్యూను నిర్వహించడానికి సైన్ ఇన్ చేయండి. సెషన్లు 12 గంటలు ఉంటాయి.' },
    auth_user: { en: 'Username', te: 'వినియోగదారు పేరు' },
    auth_pass: { en: 'Password', te: 'పాస్‌వర్డ్' },
    auth_btn: { en: 'Sign in', te: 'సైన్ ఇన్' },
    auth_signing: { en: 'Signing in...', te: 'సైన్ ఇన్ అవుతోంది...' },
    auth_demo_hint: { en: 'Demo accounts (change via .env for real use): staff / staff-demo-123, admin / admin-demo-123.', te: 'డెమో ఖాతాలు (నిజమైన వాడుక కోసం .env ద్వారా మార్చండి): staff / staff-demo-123, admin / admin-demo-123.' },
    auth_signed_in: { en: 'Signed in as {user} ({role}).', te: '{user} ({role}) గా సైన్ ఇన్ అయ్యారు.' },
    auth_logout: { en: 'Sign out', te: 'సైన్ అవుట్' },
    auth_required: { en: 'Sign in to manage the demo queue.', te: 'డెమో క్యూను నిర్వహించడానికి సైన్ ఇన్ చేయండి.' },
    auth_bad: { en: 'Invalid username or password.', te: 'వినియోగదారు పేరు లేదా పాస్‌వర్డ్ తప్పు.' },
    admin_title: { en: 'Administration', te: 'నిర్వహణ' },
    admin_sub: { en: 'Staff accounts and audit log. Administrators only.', te: 'సిబ్బంది ఖాతాలు మరియు ఆడిట్ లాగ్. నిర్వాహకులు మాత్రమే.' },
    admin_users: { en: 'Staff accounts', te: 'సిబ్బంది ఖాతాలు' },
    admin_new: { en: 'New staff account', te: 'కొత్త సిబ్బంది ఖాతా' },
    admin_role: { en: 'Role', te: 'పాత్ర' },
    role_staff: { en: 'Staff', te: 'సిబ్బంది' },
    role_admin: { en: 'Administrator', te: 'నిర్వాహకుడు' },
    admin_create: { en: 'Create account', te: 'ఖాతా సృష్టించండి' },
    admin_deactivate: { en: 'Deactivate', te: 'నిలిపివేయండి' },
    user_active: { en: 'Active', te: 'చురుకుగా ఉంది' },
    user_inactive: { en: 'Inactive', te: 'నిలిపివేయబడింది' },
    admin_activate: { en: 'Reactivate', te: 'తిరిగి ప్రారంభించండి' },
    admin_audit: { en: 'Audit log', te: 'ఆడిట్ లాగ్' },
    col_username: { en: 'Username', te: 'వినియోగదారు పేరు' },
    col_role: { en: 'Role', te: 'పాత్ర' },
    col_created: { en: 'Created', te: 'సృష్టించబడింది' },
    col_when: { en: 'When', te: 'ఎప్పుడు' },
    col_actor: { en: 'Who', te: 'ఎవరు' },
    col_action: { en: 'Action', te: 'చర్య' },
    col_detail: { en: 'Details', te: 'వివరాలు' },
    msg_login: { en: 'Signed in as {user}.', te: '{user} గా సైన్ ఇన్ అయ్యారు.' },
    msg_logout: { en: 'Signed out.', te: 'సైన్ అవుట్ అయ్యారు.' },
    msg_user_created: { en: 'Account {user} created.', te: '{user} ఖాతా సృష్టించబడింది.' },
    msg_user_updated: { en: 'Account updated.', te: 'ఖాతా నవీకరించబడింది.' },
    msg_forbidden: { en: 'Your account is not allowed to do that.', te: 'మీ ఖాతాకు దానికి అనుమతి లేదు.' },

    /* ---------------- footer ---------------- */
    foot_about: {
      en: 'QueueManager is a Community Service Internship (CSI) demonstration for public-service queue management. No real-provider pilot or measured impact is claimed.',
      te: 'క్యూఈజ్ అనేది ప్రజా సేవా క్యూ నిర్వహణ కోసం కమ్యూనיטీ సర్వీస్ ఇంటర్న్‌షిప్ (CSI) ప్రదర్శన. నిజమైన సంస్థ భాగస్వామ్యం లేదా కొలిచిన ప్రభావం గురించి ఎటువంటి వాదన లేదు.'
    },
    foot_storage: {
      en: 'Demo data is stored only in this browser (local storage) and does not sync between users or devices.',
      te: 'డెమో డేటా ఈ బ్రౌజర్‌లో మాత్రమే (లోకల్ స్టోరేజ్) నిల్వ చేయబడుతుంది, వినియోగదారులు లేదా పరికరాల మధ్య సమకాలీకరించబడదు.'
    },
    foot_nogov: {
      en: 'A student prototype. Not affiliated with, endorsed or approved by any government department.',
      te: 'విద్యార్థి నమూనా. ఏ ప్రభుత్వ శాఖతో అనుబంధం, ఆమోదం లేదా మద్దతు లేదు.'
    },
    foot_copyright: {
      en: 'Copyright © 2024, Community Service Internship (CSI) team. All rights reserved.',
      te: 'కాపీరైట్ © 2024, కమ్యూనిటీ సర్వీస్ ఇంటర్న్‌షిప్ (CSI) బృందం. అన్ని హక్కులు రిజర్వ్ చేయబడ్డాయి.'
    }
  };

  var WEEKDAYS = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    te: ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం']
  };
  var MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    te: ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
  };
  var MONTHS_SHORT = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    te: ['జన', 'ఫిబ్ర', 'మార్చి', 'ఏప్రి', 'మే', 'జూన్', 'జులై', 'ఆగ', 'సెప్టెం', 'అక్టో', 'నవం', 'డిసెం']
  };

  function isLang(l) { return l === 'te' ? 'te' : 'en'; }

  function getStoredLang() {
    try {
      var v = (typeof localStorage !== 'undefined') ? localStorage.getItem(LANG_KEY) : null;
      return isLang(v);
    } catch (e) { return 'en'; }
  }

  function setStoredLang(l) {
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(LANG_KEY, isLang(l)); } } catch (e) { /* ignore */ }
  }

  function t(key, lang, vars) {
    var entry = STR[key];
    var s = entry ? (entry[isLang(lang)] || entry.en) : key;
    if (vars && typeof s === 'string') {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  function applyStatic(lang) {
    if (typeof document === 'undefined') { return; }
    var l = isLang(lang);
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'), l);
    }
    var ph = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < ph.length; j++) {
      ph[j].setAttribute('placeholder', t(ph[j].getAttribute('data-i18n-ph'), l));
    }
    var al = document.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < al.length; k++) {
      al[k].setAttribute('aria-label', t(al[k].getAttribute('data-i18n-aria'), l));
    }
    document.documentElement.setAttribute('lang', l === 'te' ? 'te' : 'en');
  }

  function applyTitle(key, lang) {
    if (typeof document !== 'undefined') { document.title = t(key, isLang(lang)); }
  }

  function statusName(status, lang) {
    return t('st_' + status, isLang(lang));
  }

  function fmtDateLong(iso, lang) {
    var l = isLang(lang);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) { return iso; }
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return WEEKDAYS[l][d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[l][d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateShort(iso, lang) {
    var l = isLang(lang);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) { return iso; }
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getDate() + ' ' + MONTHS_SHORT[l][d.getMonth()] + ' ' + d.getFullYear();
  }

  return {
    LANG_KEY: LANG_KEY,
    t: t,
    isLang: isLang,
    getStoredLang: getStoredLang,
    setStoredLang: setStoredLang,
    applyStatic: applyStatic,
    applyTitle: applyTitle,
    statusName: statusName,
    fmtDateLong: fmtDateLong,
    fmtDateShort: fmtDateShort
  };
});
