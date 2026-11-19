// Hindi translations for text that comes from the server / AI service
// (crowd labels, AI reasons, statuses, error messages). Unknown text is shown as-is.
const HI = {
  // crowd / slot labels
  'Lower crowd': 'कम भीड़', 'Moderate crowd': 'मध्यम भीड़', 'High predicted crowd': 'अधिक भीड़ अनुमानित',
  'Filling Fast': 'जल्दी भर रहा है', 'Waitlist Only': 'केवल प्रतीक्षा सूची', 'Full': 'भरा हुआ',
  // AI forecast reasons
  'holiday / Sunday - reduced OPD': 'छुट्टी / रविवार - सीमित ओपीडी',
  'day after a public holiday - pent-up demand': 'छुट्टी के अगले दिन - ज़्यादा मरीज़',
  'monsoon season: fever cases rise': 'मानसून: बुखार के मामले बढ़ते हैं',
  'winter season: higher load': 'सर्दी का मौसम: ज़्यादा मरीज़',
  'this slot was busier than usual last week': 'पिछले हफ्ते यह स्लॉट ज़्यादा व्यस्त था',
  'Mondays are usually the busiest': 'सोमवार सबसे व्यस्त होता है',
  'peak morning hour': 'सुबह का व्यस्त समय',
  'afternoons are usually quieter': 'दोपहर में आमतौर पर कम भीड़',
  // appointment statuses
  'Scheduled': 'निर्धारित', 'Checked In': 'चेक-इन हो गया', 'In Progress': 'जांच चल रही है',
  'Completed': 'पूरा हुआ', 'Cancelled': 'रद्द', 'No-Show': 'नहीं आए',
  // common server errors
  'This slot is full. Please choose another available slot.': 'यह स्लॉट भर गया है। कृपया दूसरा स्लॉट चुनें।',
  'This time slot has already started. Please select a future slot.': 'यह स्लॉट शुरू हो चुका है। कृपया आगे का स्लॉट चुनें।',
  'Appointments cannot be booked for a past date.': 'पिछली तारीख के लिए बुकिंग नहीं हो सकती।',
  'Choose a valid department, date and time slot.': 'सही विभाग, तारीख और समय चुनें।',
  'Prediction for this slot is unavailable. Please try again.': 'इस स्लॉट का अनुमान उपलब्ध नहीं है। फिर से प्रयास करें।',
  'Failed to book appointment. Please try again.': 'बुकिंग नहीं हो सकी। कृपया फिर से प्रयास करें।',
  'Failed to book appointment': 'बुकिंग नहीं हो सकी',
  'Triage service unavailable': 'AI लक्षण सहायक अभी उपलब्ध नहीं है',
  'AI helper unavailable': 'AI सहायक अभी उपलब्ध नहीं है',
  'Invalid email or password': 'ईमेल या पासवर्ड गलत है',
  'User already exists': 'यह उपयोगकर्ता पहले से मौजूद है',
};

const PATTERNS = [
  [/^You already have an appointment in (.+) on this date \((.+)\)\.$/, (m) => `इस तारीख को ${m[1]} में आपकी अपॉइंटमेंट पहले से है (${m[2]})।`],
  [/^Crowd prediction service unavailable/, () => 'भीड़ अनुमान सेवा अभी उपलब्ध नहीं है।'],
];

export function tr(text, language) {
  if (language !== 'hi' || typeof text !== 'string') return text;
  if (HI[text]) return HI[text];
  for (const [re, fn] of PATTERNS) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return text;
}
