/*
 * QueueEase - demo configuration (offices, services, scheduling rules).
 * Environment agnostic: safe to load in the browser (window.QE_CONFIG)
 * and in Node (module.exports) so the same rules drive the UI and tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.QE_CONFIG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'queueease.state.v1';
  var STORAGE_KEY_LEGACY = 'qe_bookings'; // pre-rewrite prototype key (migrated once)

  var STATUSES = ['Booked', 'Waiting', 'Serving', 'Completed', 'Cancelled', 'No-show'];

  /* Which statuses each status may move to (staff correction paths included). */
  var TRANSITIONS = {
    Booked: ['Waiting', 'Serving', 'Cancelled', 'No-show'],
    Waiting: ['Serving', 'Cancelled', 'No-show'],
    Serving: ['Completed', 'Cancelled', 'No-show', 'Waiting'],
    Completed: ['Waiting'],
    Cancelled: ['Waiting'],
    'No-show': ['Waiting']
  };

  var CHANNELS = ['appointment', 'walkin'];

  /* Weekday numbers: 0 = Sunday ... 6 = Saturday */
  var OFFICES = [
    {
      id: 'meeseva',
      prefix: 'A',
      name: { en: 'MeeSeva Centre', te: 'మీసేవా కేంద్రం' },
      typeLabel: { en: 'MeeSeva Centre', te: 'మీసేవా కేంద్రం' },
      emoji: '🏢',
      blurb: {
        en: 'Citizen service centre counter handling certificates, records and bill payments.',
        te: 'సర్టిఫికెట్లు, రికార్డులు, బిల్లు చెల్లింపులు వంటి పౌర సేవల కౌంటర్‌.'
      },
      avgServiceMinutes: 8,
      walkInEnabled: true,
      openDays: [1, 2, 3, 4, 5, 6],
      openTime: '10:00',
      closeTime: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00'
    },
    {
      id: 'panchayat',
      prefix: 'B',
      name: { en: 'Gram Panchayat Office', te: 'గ్రామ పంచాయతీ కార్యాలయం' },
      typeLabel: { en: 'Gram Panchayat Office', te: 'గ్రామ పంచాయతీ కార్యాలయం' },
      emoji: '🌾',
      blurb: {
        en: 'Village level office for house tax, water connections and local grievances.',
        te: 'గృహ పన్ను, నీటి కనెక్షన్లు, స్థానిక సమస్యల కోసం గ్రామ స్థాయి కార్యాలయం.'
      },
      avgServiceMinutes: 10,
      walkInEnabled: true,
      openDays: [1, 2, 3, 4, 5, 6],
      openTime: '10:00',
      closeTime: '16:00',
      lunchStart: null,
      lunchEnd: null
    },
    {
      id: 'municipal',
      prefix: 'C',
      name: { en: 'Municipal Office', te: 'మున్సిపల్ కార్యాలయం' },
      typeLabel: { en: 'Municipal Office', te: 'మున్సిపల్ కార్యాలయం' },
      emoji: '🏛️',
      blurb: {
        en: 'Town office for property tax, trade licence and registrations.',
        te: 'ఆస్తి పన్ను, వ్యాపార లైసెన్స్, నమోదు కోసం పట్టణ కార్యాలయం.'
      },
      avgServiceMinutes: 12,
      walkInEnabled: true,
      openDays: [1, 2, 3, 4, 5],
      openTime: '10:00',
      closeTime: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00'
    },
    {
      id: 'other',
      prefix: 'D',
      name: { en: 'Other Government Service Office', te: 'ఇతర ప్రభుత్వ సేవా కార్యాలయం' },
      typeLabel: { en: 'Other Government Service Office', te: 'ఇతర ప్రభుత్వ సేవా కార్యాలయం' },
      emoji: '📄',
      blurb: {
        en: 'Any other public counter: pensions, scholarships, electricity or revenue records.',
        te: 'ఇతర ఏ పబ్లిక్ కౌంటర్: పెన్షన్లు, స్కాలర్షిప్లు, విద్యుత్ లేదా రెవెన్యూ రికార్డులు.'
      },
      avgServiceMinutes: 10,
      walkInEnabled: true,
      openDays: [1, 2, 3, 4, 5, 6],
      openTime: '10:00',
      closeTime: '16:00',
      lunchStart: '13:00',
      lunchEnd: '13:30'
    }
  ];

  var SERVICES = [
    { id: 'meeseva-cert', officeId: 'meeseva', name: { en: 'Birth / death certificate copy', te: 'జనన / మరణ సర్టిఫికెట్ కాపీ' }, minutes: 6, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'meeseva-income', officeId: 'meeseva', name: { en: 'Income / community certificate application', te: 'ఆదాయ / సమాజ సర్టిఫికెట్ దరఖాస్తు' }, minutes: 10, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'meeseva-adangal', officeId: 'meeseva', name: { en: 'Land record (1B / adangal) copy', te: 'భూ రికార్డు (1B / అడాంగల్) కాపీ' }, minutes: 8, fee: { en: 'Demo fee: nominal', te: 'డెమో రుసుము: తక్కువ' } },
    { id: 'meeseva-ration', officeId: 'meeseva', name: { en: 'Ration card correction application', te: 'రేషన్ కార్డు సవరణ దరఖాస్తు' }, minutes: 12, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'meeseva-pension', officeId: 'meeseva', name: { en: 'Pension status enquiry', te: 'పెన్షన్ స్థితి విచారణ' }, minutes: 5, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'meeseva-bill', officeId: 'meeseva', name: { en: 'Utility bill payment', te: 'యుటిలిటీ బిల్లు చెల్లింపు' }, minutes: 4, fee: { en: 'Demo only - no real payment', te: 'డెమో మాత్రం - నిజమైన చెల్లింపు లేదు' } },

    { id: 'pan-house-tax', officeId: 'panchayat', name: { en: 'House tax receipt / payment', te: 'గృహ పన్ను రసీదు / చెల్లింపు' }, minutes: 8, fee: { en: 'Demo only - no real payment', te: 'డెమో మాత్రం - నిజమైన చెల్లింపు లేదు' } },
    { id: 'pan-water', officeId: 'panchayat', name: { en: 'Water connection application', te: 'నీటి కనెక్షన్ దరఖాస్తు' }, minutes: 15, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'pan-streetlight', officeId: 'panchayat', name: { en: 'Street light complaint', te: 'వీధి దీప ఫిర్యాదు' }, minutes: 6, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'pan-sanitation', officeId: 'panchayat', name: { en: 'Sanitation / soak pit request', te: 'పారిశుధ్య / సోక్ పిట్ అభ్యర్థన' }, minutes: 10, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'pan-nrega', officeId: 'panchayat', name: { en: 'MGNREGS job card status', te: 'మనరేగా జాబ్ కార్డ్ స్థితి' }, minutes: 9, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },

    { id: 'mun-property-tax', officeId: 'municipal', name: { en: 'Property tax payment', te: 'ఆస్తి పన్ను చెల్లింపు' }, minutes: 12, fee: { en: 'Demo only - no real payment', te: 'డెమో మాత్రం - నిజమైన చెల్లింపు లేదు' } },
    { id: 'mun-trade', officeId: 'municipal', name: { en: 'Trade licence application', te: 'వ్యాపార లైసెన్స్ దరఖాస్తు' }, minutes: 15, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'mun-birth-reg', officeId: 'municipal', name: { en: 'Birth / death registration', te: 'జనన / మరణ నమోదు' }, minutes: 14, fee: { en: 'Demo fee: nominal', te: 'డెమో రుసుము: తక్కువ' } },
    { id: 'mun-waste', officeId: 'municipal', name: { en: 'Garbage collection complaint', te: 'చెత్త సేకరణ ఫిర్యాదు' }, minutes: 5, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'mun-water-tanker', officeId: 'municipal', name: { en: 'Water tanker request', te: 'నీటి ట్యాంకర్ అభ్యర్థన' }, minutes: 7, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },

    { id: 'oth-pension', officeId: 'other', name: { en: 'Old age pension application', te: 'వృద్ధాప్య పెన్షన్ దరఖాస్తు' }, minutes: 14, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'oth-scholarship', officeId: 'other', name: { en: 'Scholarship application help', te: 'స్కాలర్షిప్ దరఖాస్తు సహాయం' }, minutes: 12, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'oth-voter', officeId: 'other', name: { en: 'Voter ID correction enquiry', te: 'ఓటర్ ID సవరణ విచారణ' }, minutes: 8, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'oth-land-dispute', officeId: 'other', name: { en: 'Survey number dispute query', te: 'సర్వే నంబర్ వివాద విచారణ' }, minutes: 18, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } },
    { id: 'oth-electricity', officeId: 'other', name: { en: 'Electricity service connection query', te: 'విద్యుత్ సర్వీస్ కనెక్షన్ విచారణ' }, minutes: 10, fee: { en: 'Demo fee: free', te: 'డెమో రుసుము: ఉచితం' } }
  ];

  var RULES = {
    slotMinutes: 30,
    slotsPerService: 4,        // max appointments per office + date + slot
    bookingHorizonDays: 14,    // how far ahead a citizen may book
    maxActivePerPersonPerDay: 3, // demo safeguard against spam bookings
    sameDayCutoff: true        // past slots on today's date are unavailable
  };

  return {
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_KEY_LEGACY: STORAGE_KEY_LEGACY,
    STATUSES: STATUSES,
    TRANSITIONS: TRANSITIONS,
    CHANNELS: CHANNELS,
    OFFICES: OFFICES,
    SERVICES: SERVICES,
    RULES: RULES
  };
});
