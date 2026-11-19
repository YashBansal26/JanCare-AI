// Doctor capacity planning: turns the AI crowd forecast into a staffing decision.
//   doctors needed = ceil(expected patients x minutes per consultation / usable minutes per doctor)

// Typical consultation minutes per department (used until enough real visits exist)
export const DEFAULT_CONSULT_MIN = { 'General Medicine': 6, Pediatrics: 8, Orthopedics: 9, Cardiology: 12, Dermatology: 6, Neurology: 13 };
export const OPD_MINUTES = 8 * 60;      // 8 AM - 5 PM with a 1-hour lunch
export const UTILISATION = 0.85;        // time a doctor actually spends with patients

export function computeCapacity({ departments, forecast, booked, doctors, consultMinutes }) {
  return departments.map(dept => {
    const expected = Math.max(forecast[dept] ?? 0, booked[dept] ?? 0);
    const minutes = consultMinutes[dept] ?? DEFAULT_CONSULT_MIN[dept] ?? 8;
    const perDoctor = Math.floor((OPD_MINUTES * UTILISATION) / minutes);
    const needed = expected > 0 ? Math.max(1, Math.ceil(expected / perDoctor)) : 0;
    const available = doctors[dept] ?? 0;
    const gap = needed - available;
    return {
      department: dept, expectedPatients: expected, forecastPatients: forecast[dept] ?? null, bookedPatients: booked[dept] ?? 0,
      consultMinutes: minutes, patientsPerDoctor: perDoctor, doctorsNeeded: needed, doctorsAvailable: available, gap,
      status: gap > 0 ? 'Short' : gap < -1 ? 'Surplus' : 'OK',
    };
  });
}
