import axios from 'axios';

export const getCrowdPredictions = async (date, department) => {
  try {
    const baseUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${baseUrl}/predict`, { date, department }, { timeout: 5000 });
    if (!Array.isArray(response.data?.predictions)) throw new Error('ML service returned an invalid prediction response');
    return response.data.predictions;
  } catch (error) {
    const detail = error.response?.data?.detail || error.message;
    const wrapped = new Error(`Crowd prediction service unavailable: ${detail}`);
    wrapped.status = error.response?.status || 503;
    throw wrapped;
  }
};

export const getTriage = async (text, pain) => {
  const baseUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
  try {
    const response = await axios.post(`${baseUrl}/triage`, { text, pain }, { timeout: 5000 });
    return response.data;
  } catch (error) {
    const wrapped = new Error('Triage service unavailable');
    wrapped.status = error.response?.status || 503;
    throw wrapped;
  }
};

const ML_URL = () => process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// No-show risk for a batch of appointments. Returns {} on failure so the
// staff dashboard keeps working even if the AI service is down.
export const getNoShowRisk = async (items) => {
  if (!items.length) return {};
  try {
    const response = await axios.post(`${ML_URL()}/no-show`, { appointments: items.slice(0, 500) }, { timeout: 5000 });
    return Object.fromEntries((response.data?.predictions || []).map(p => [p.id, p]));
  } catch (error) {
    console.error('No-show service unavailable:', error.message);
    return {};
  }
};

export const getAiMetrics = async () => {
  const response = await axios.get(`${ML_URL()}/ai/metrics`, { timeout: 5000 });
  return response.data;
};

// Generic helper for the newer AI endpoints
export const mlPost = async (path, body, timeout = 5000) => {
  const response = await axios.post(`${ML_URL()}${path}`, body, { timeout });
  return response.data;
};
