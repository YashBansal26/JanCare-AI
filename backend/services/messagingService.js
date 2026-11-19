/** Demo notification transport: deliberately does not call an SMS provider. */
export const sendBookingConfirmation = async (user, appointment) => {
  const phone = user?.phone || 'not provided';
  const message = `JanCare booking confirmed. Ticket ${String(appointment.ticketId || appointment._id).slice(0, 8).toUpperCase()}; ${appointment.department}; ${appointment.date}; ${appointment.timeSlot}. Please show your QR pass at check-in.`;
  console.log('\n========== JANCARE SIMULATED SMS ==========');
  console.log(`To: ${phone}`);
  console.log(message);
  console.log('Status: SIMULATED (no SMS API call made)');
  console.log('===========================================\n');
  return { status: 'Simulated', message };
};

export const logDemoNotification = (phone, message) => {
  console.log('\n========== JANCARE SIMULATED SMS ==========');
  console.log(`To: ${phone || 'not provided'}`);
  console.log(message);
  console.log('Status: SIMULATED (no SMS API call made)');
  console.log('===========================================\n');
};
