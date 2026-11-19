import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Logins expire after 12 hours. When the server says the token is no longer valid,
// clear that login and reload so the right sign-in page appears (instead of
// confusing errors such as "AI service unavailable").
axios.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  const url = error.config?.url || '';
  const msg = String(error.response?.data?.error || '');
  const tokenProblem = status === 401 || (status === 403 && /access required/i.test(msg));
  if (tokenProblem && !url.includes('/auth/')) {
    const key = url.includes('/admin/') ? 'admin_token' : url.includes('/doctor/') ? 'doctor_token' : url.includes('/lab/') ? 'lab_token'
      : url.includes('/records/reports/') ? null : 'opd_token';
    if (key && localStorage.getItem(key)) {
      localStorage.removeItem(key);
      sessionStorage.setItem('jancare_session_expired', '1');
      window.location.reload();
    }
  }
  return Promise.reject(error);
});

// Helper to get auth header
const getAuthHeaders = () => {
  const token = localStorage.getItem('opd_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper for admin auth header
const getAdminAuthHeaders = () => {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const registerUser = async (userData) => {
  const res = await axios.post(`${API_URL}/auth/register`, userData);
  return res.data;
};

export const loginUser = async (email, password) => {
  const res = await axios.post(`${API_URL}/auth/login`, { email, password });
  return res.data;
};

export const adminRegister = async (email, password, employeeId) => {
  const res = await axios.post(`${API_URL}/auth/admin/register`, { email, password, employeeId });
  return res.data;
};

export const adminLogin = async (email, password) => {
  const res = await axios.post(`${API_URL}/auth/admin/login`, { email, password });
  return res.data;
};

export const fetchPredictions = async (date, department) => {
  const res = await axios.get(`${API_URL}/predictions`, { 
    params: { date, department },
    headers: getAuthHeaders()
  });
  return res.data;
};

export const bookAppointment = async (date, department, timeSlot, symptoms = '', forMember = null) => {
  const res = await axios.post(`${API_URL}/appointments`, 
    { date, department, timeSlot, symptoms, forMember },
    { headers: getAuthHeaders() }
  );
  return res.data;
};

export const fetchUserAppointments = async () => {
  const res = await axios.get(`${API_URL}/appointments`, { headers: getAuthHeaders() });
  return res.data;
};

export const cancelAppointment = async (id) => {
  const res = await axios.delete(`${API_URL}/appointments/${id}`, { headers: getAuthHeaders() });
  return res.data;
};

// Patient-side: check doctor availability
export const fetchDoctorStatus = async () => {
  const res = await axios.get(`${API_URL}/doctor-status`, { headers: getAuthHeaders() });
  return res.data;
};

// --- Admin APIs ---

export const fetchAllAppointments = async () => {
  const res = await axios.get(`${API_URL}/admin/appointments`, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const updateAppointmentStatus = async (id, status) => {
  const res = await axios.put(`${API_URL}/admin/appointments/${id}/status`, 
    { status }, 
    { headers: getAdminAuthHeaders() }
  );
  return res.data;
};

export const fetchAdminDoctorStatus = async () => {
  const res = await axios.get(`${API_URL}/admin/doctor-status`, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const toggleDoctorAvailability = async (department, available) => {
  const res = await axios.put(`${API_URL}/admin/doctor-status/${encodeURIComponent(department)}`, 
    { available }, 
    { headers: getAdminAuthHeaders() }
  );
  return res.data;
};

export const transferAppointment = async (id, newDepartment) => {
  const res = await axios.put(`${API_URL}/admin/appointments/${id}/transfer`, 
    { newDepartment }, 
    { headers: getAdminAuthHeaders() }
  );
  return res.data;
};

export const runNoShowCheck = async () => {
  const res = await axios.post(`${API_URL}/admin/no-show-check`, {}, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const fetchNotifications = async () => {
  const res = await axios.get(`${API_URL}/notifications`, { headers: getAuthHeaders() });
  return res.data;
};

export const verifyTicket = async (ticketId) => {
  const res = await axios.get(`${API_URL}/admin/tickets/${encodeURIComponent(ticketId)}`, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const triageSymptoms = async (text, pain) => {
  const res = await axios.post(`${API_URL}/triage`, { text, pain }, { headers: getAuthHeaders() });
  return res.data;
};

// --- AI (staff) ---
export const fetchAiMetrics = async () => {
  const res = await axios.get(`${API_URL}/admin/ai/metrics`, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const sendReminder = async (id) => {
  const res = await axios.post(`${API_URL}/admin/appointments/${id}/remind`, {}, { headers: getAdminAuthHeaders() });
  return res.data;
};

export const downloadAiExport = async (kind) => {
  const res = await axios.get(`${API_URL}/admin/ai/export/${kind}`, { headers: getAdminAuthHeaders(), responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url; link.download = `live_${kind}.csv`; link.click();
  URL.revokeObjectURL(url);
};

export const askAssistant = async (text, language) => {
  const res = await axios.post(`${API_URL}/assistant`, { text, language }, { headers: getAuthHeaders() });
  return res.data;
};

export const fetchAiAlerts = async () => {
  const res = await axios.get(`${API_URL}/admin/ai/alerts`, { headers: getAdminAuthHeaders() });
  return res.data;
};

// --- Doctors ---
const getDoctorAuthHeaders = () => {
  const token = localStorage.getItem('doctor_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchDoctors = async (department) => {
  const res = await axios.get(`${API_URL}/doctors`, { params: department ? { department } : {}, headers: getAuthHeaders() });
  return res.data;
};

export const doctorLogin = async (email, password) => {
  const res = await axios.post(`${API_URL}/auth/doctor/login`, { email, password });
  return res.data;
};

export const fetchDoctorMe = async () => (await axios.get(`${API_URL}/doctor/me`, { headers: getDoctorAuthHeaders() })).data;
export const fetchDoctorQueue = async (date) => (await axios.get(`${API_URL}/doctor/queue`, { params: date ? { date } : {}, headers: getDoctorAuthHeaders() })).data;
export const doctorUpdateStatus = async (id, status, extra = {}) =>
  (await axios.put(`${API_URL}/doctor/appointments/${id}/status`, { status, ...extra }, { headers: getDoctorAuthHeaders() })).data;
export const doctorSaveNotes = async (id, notes, advice, prescription) =>
  (await axios.put(`${API_URL}/doctor/appointments/${id}/notes`, { notes, advice, prescription }, { headers: getDoctorAuthHeaders() })).data;
export const doctorSetBreak = async (available) => (await axios.put(`${API_URL}/doctor/break`, { available }, { headers: getDoctorAuthHeaders() })).data;

// Staff: manage doctors
export const adminFetchDoctors = async () => (await axios.get(`${API_URL}/admin/doctors`, { headers: getAdminAuthHeaders() })).data;
export const adminCreateDoctor = async (doctor) => (await axios.post(`${API_URL}/admin/doctors`, doctor, { headers: getAdminAuthHeaders() })).data;
export const adminUpdateDoctor = async (id, doctor) => (await axios.put(`${API_URL}/admin/doctors/${id}`, doctor, { headers: getAdminAuthHeaders() })).data;

// --- Medical records: prescriptions & lab reports ---
export const fetchRecords = async () => (await axios.get(`${API_URL}/records`, { headers: getAuthHeaders() })).data;

// Opens a report file (auth needed, so fetch as blob). who: 'patient' | 'doctor'
export const openReportFile = async (reportId, who = 'patient', download = false, fileName = 'report') => {
  const token = localStorage.getItem(who === 'doctor' ? 'doctor_token' : who === 'lab' ? 'lab_token' : who === 'admin' ? 'admin_token' : 'opd_token');
  const res = await axios.get(`${API_URL}/records/reports/${reportId}/file`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  if (download) {
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const doctorFetchReports = async (apptId) =>
  (await axios.get(`${API_URL}/doctor/appointments/${apptId}/reports`, { headers: getDoctorAuthHeaders() })).data;
export const doctorUploadReport = async (apptId, payload) =>
  (await axios.post(`${API_URL}/doctor/appointments/${apptId}/reports`, payload, { headers: getDoctorAuthHeaders() })).data;
export const doctorDeleteReport = async (reportId) =>
  (await axios.delete(`${API_URL}/doctor/reports/${reportId}`, { headers: getDoctorAuthHeaders() })).data;

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// --- Patient profile, family, feedback ---
export const fetchMyProfile = async () => (await axios.get(`${API_URL}/me/profile`, { headers: getAuthHeaders() })).data;
export const updateMyProfile = async (data) => (await axios.put(`${API_URL}/me/profile`, data, { headers: getAuthHeaders() })).data;
export const addFamilyMember = async (m) => (await axios.post(`${API_URL}/me/family`, m, { headers: getAuthHeaders() })).data;
export const updateFamilyMember = async (id, m) => (await axios.put(`${API_URL}/me/family/${id}`, m, { headers: getAuthHeaders() })).data;
export const removeFamilyMember = async (id) => (await axios.delete(`${API_URL}/me/family/${id}`, { headers: getAuthHeaders() })).data;
export const sendFeedback = async (id, rating, comment) => (await axios.post(`${API_URL}/appointments/${id}/feedback`, { rating, comment }, { headers: getAuthHeaders() })).data;

// --- Doctor extras ---
export const doctorRxCheck = async (apptId, medicines) =>
  (await axios.post(`${API_URL}/doctor/appointments/${apptId}/rx-check`, { medicines }, { headers: getDoctorAuthHeaders() })).data;
export const doctorFetchRatings = async () => (await axios.get(`${API_URL}/doctor/ratings`, { headers: getDoctorAuthHeaders() })).data;

// --- Staff extras ---
export const fetchCapacity = async (date) => (await axios.get(`${API_URL}/admin/ai/capacity`, { params: date ? { date } : {}, headers: getAdminAuthHeaders() })).data;
export const registerWalkIn = async (data) => (await axios.post(`${API_URL}/admin/walk-in`, data, { headers: getAdminAuthHeaders() })).data;
export const fetchAnalytics = async (days = 30) => (await axios.get(`${API_URL}/admin/analytics`, { params: { days }, headers: getAdminAuthHeaders() })).data;
export const fetchDemoStatus = async () => (await axios.get(`${API_URL}/admin/demo`, { headers: getAdminAuthHeaders() })).data;
export const loadDemoData = async () => (await axios.post(`${API_URL}/admin/demo/load`, {}, { headers: getAdminAuthHeaders(), timeout: 300000 })).data;
export const clearDemoData = async () => (await axios.delete(`${API_URL}/admin/demo`, { headers: getAdminAuthHeaders() })).data;
export const fetchLabStaff = async () => (await axios.get(`${API_URL}/admin/lab-staff`, { headers: getAdminAuthHeaders() })).data;
export const createLabStaff = async (data) => (await axios.post(`${API_URL}/admin/lab-staff`, data, { headers: getAdminAuthHeaders() })).data;

// --- Waiting-hall display (public) ---
export const fetchDisplayQueue = async () => (await axios.get(`${API_URL}/display/queue`)).data;

// --- Lab portal ---
const getLabAuthHeaders = () => {
  const token = localStorage.getItem('lab_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
export const labLogin = async (email, password) => (await axios.post(`${API_URL}/auth/lab/login`, { email, password })).data;
export const fetchLabMe = async () => (await axios.get(`${API_URL}/lab/me`, { headers: getLabAuthHeaders() })).data;
export const fetchLabOrders = async (status, q) => (await axios.get(`${API_URL}/lab/orders`, { params: { status, q }, headers: getLabAuthHeaders() })).data;
export const labCollectSample = async (id) => (await axios.put(`${API_URL}/lab/orders/${id}/collect`, {}, { headers: getLabAuthHeaders() })).data;
export const labUploadReport = async (id, payload) => (await axios.post(`${API_URL}/lab/orders/${id}/report`, payload, { headers: getLabAuthHeaders(), timeout: 120000 })).data;
