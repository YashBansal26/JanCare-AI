// Bilingual (English / Hindi) patient messages. Each patient chooses a language
// and a channel (SMS or WhatsApp) in their profile. Delivery is SIMULATED:
// messages are printed in the backend window and stored as notification history.

const DEPT_HI = {
  Orthopedics: 'हड्डी रोग', Pediatrics: 'बाल रोग', Cardiology: 'हृदय रोग',
  Dermatology: 'त्वचा रोग', Neurology: 'न्यूरोलॉजी', 'General Medicine': 'जनरल मेडिसिन',
};
const STATUS_HI = { Scheduled: 'निर्धारित', 'Checked In': 'चेक-इन हो गया', 'In Progress': 'जांच चल रही है', Completed: 'पूरा हुआ', Cancelled: 'रद्द', 'No-Show': 'नहीं आए' };

export const TEMPLATES = {
  booking: {
    en: p => `JanCare booking confirmed for ${p.name}. Ticket ${p.ticket}; ${p.dept}; ${p.date}; ${p.slot}. Show your QR pass at check-in.`,
    hi: p => `JanCare: ${p.name} की बुकिंग पक्की। टिकट ${p.ticket}; ${p.deptHi}; ${p.date}; ${p.slot}। चेक-इन पर QR पास दिखाएं।`,
  },
  cancel: {
    en: p => `JanCare: appointment cancelled - ${p.dept}, ${p.date}, ${p.slot}.`,
    hi: p => `JanCare: अपॉइंटमेंट रद्द - ${p.deptHi}, ${p.date}, ${p.slot}।`,
  },
  reminder: {
    en: p => `Reminder from JanCare: your ${p.dept} appointment is on ${p.date}, ${p.slot}. If you cannot come, please cancel in the app so another patient can use the slot.`,
    hi: p => `JanCare रिमाइंडर: आपकी ${p.deptHi} अपॉइंटमेंट ${p.date}, ${p.slot} पर है। न आ सकें तो ऐप में रद्द करें ताकि दूसरा मरीज़ स्लॉट ले सके।`,
  },
  checkin: {
    en: p => `JanCare: checked in. Your token is ${p.token} for ${p.dept}. Watch the screen in the waiting hall.`,
    hi: p => `JanCare: चेक-इन हो गया। ${p.deptHi} के लिए आपका टोकन ${p.token} है। वेटिंग हॉल की स्क्रीन देखें।`,
  },
  turn: {
    en: p => `JanCare: it is your turn now${p.token ? ` (token ${p.token})` : ''}. Please go to ${p.doctor || 'the doctor'}${p.room ? `, room ${p.room}` : ''}.`,
    hi: p => `JanCare: अब आपकी बारी है${p.token ? ` (टोकन ${p.token})` : ''}। कृपया ${p.doctor || 'डॉक्टर'}${p.room ? `, कमरा ${p.room}` : ''} में जाएं।`,
  },
  status: {
    en: p => `JanCare appointment status: ${p.status}. ${p.dept}, ${p.date}, ${p.slot}.`,
    hi: p => `JanCare अपॉइंटमेंट स्थिति: ${STATUS_HI[p.status] || p.status}। ${p.deptHi}, ${p.date}, ${p.slot}।`,
  },
  report: {
    en: p => `JanCare: your ${p.test} report is ready.${p.summary ? ` ${p.summary}` : ''} Open Medical Records in the app to view it.`,
    hi: p => `JanCare: आपकी ${p.test} रिपोर्ट तैयार है।${p.summaryHi ? ` ${p.summaryHi}` : ''} देखने के लिए ऐप में मेडिकल रिकॉर्ड खोलें।`,
  },
  sample: {
    en: p => `JanCare lab: sample collected for ${p.test}. We will message you when the report is ready.`,
    hi: p => `JanCare लैब: ${p.test} के लिए सैंपल ले लिया गया है। रिपोर्ट तैयार होने पर हम आपको संदेश भेजेंगे।`,
  },
  walkin: {
    en: p => `JanCare: registered at the front desk for ${p.dept}. Your token is ${p.token}.`,
    hi: p => `JanCare: ${p.deptHi} के लिए रजिस्ट्रेशन हो गया। आपका टोकन ${p.token} है।`,
  },
};

export function compose(key, lang, params) {
  const t = TEMPLATES[key];
  const p = { ...params, deptHi: DEPT_HI[params.dept] || params.dept };
  return (lang === 'hi' ? t.hi : t.en)(p);
}

const NOTIFICATION_TYPE = { booking: 'booking_confirmation', cancel: 'cancellation', reminder: 'reminder', checkin: 'check_in' };

// Returns notify(patient, appointment, key, params) bound to the Notification model.
export function makeNotifier(Notification) {
  return async function notify(patient, appointment, key, params = {}) {
    const lang = patient?.preferredLanguage === 'hi' ? 'hi' : 'en';
    const channel = patient?.notifyChannel === 'WhatsApp' ? 'WhatsApp' : 'SMS';
    const message = compose(key, lang, {
      name: appointment?.patientName, ticket: String(appointment?.ticketId || '').slice(0, 8).toUpperCase(),
      dept: appointment?.department, date: appointment?.date, slot: appointment?.timeSlot, token: appointment?.tokenNumber,
      ...params,
    });
    console.log(`\n========== JANCARE SIMULATED ${channel.toUpperCase()} (${lang}) ==========`);
    console.log(`To: ${patient?.phone || 'not provided'}`);
    console.log(message);
    console.log('Status: SIMULATED (no SMS/WhatsApp API call made)\n');
    if (!appointment?.patientEmail && !patient?.email) return message;
    await Notification.create({
      patientEmail: appointment?.patientEmail || patient.email, phone: patient?.phone || '',
      appointmentId: appointment?._id || null, type: NOTIFICATION_TYPE[key] || 'status_update',
      message, channel: `${channel} (simulated)`,
    });
    return message;
  };
}
