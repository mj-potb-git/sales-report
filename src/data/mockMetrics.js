export const metrics = [
  { id: 'total-bookings',    label: 'Total Bookings',       value: '9',              trend: '+12%', up: true,  icon: 'Calendar' },
  { id: 'conversion-rate',  label: 'Conversion Rate',      value: '68%',            trend: '+5%',  up: true,  icon: 'TrendingUp' },
  { id: 'sms-optout',       label: 'SMS Opt-Out Rate',     value: '33%',            trend: '+2%',  up: false, icon: 'BellOff' },
  { id: 'revenue',          label: 'Revenue This Month',   value: '₱124,500',       trend: '+18%', up: true,  icon: 'DollarSign' },
  { id: 'new-leads',        label: 'New Leads This Week',  value: '24',             trend: '+8%',  up: true,  icon: 'Users' },
  { id: 'avg-duration',     label: 'Avg. Booking Duration',value: '52 min',         trend: '-3%',  up: false, icon: 'Clock' },
  { id: 'top-appt',         label: 'Top Appointment Type', value: 'FREE 45-MIN',    trend: null,   up: null,  icon: 'Star' },
  { id: 'today',            label: 'Bookings Today',       value: '9',              trend: '+9',   up: true,  icon: 'CalendarCheck' },
]

export const bookingsOverTime = [
  { day: 'Mon', bookings: 3 },
  { day: 'Tue', bookings: 7 },
  { day: 'Wed', bookings: 5 },
  { day: 'Thu', bookings: 9 },
  { day: 'Fri', bookings: 6 },
  { day: 'Sat', bookings: 11 },
  { day: 'Sun', bookings: 4 },
]

export const appointmentTypes = [
  { name: 'FREE 45-MIN TRAVELPRENEUR', value: 9, color: '#1B4F4F' },
  { name: 'Paid Consultation', value: 3, color: '#F5A623' },
  { name: 'Follow-up', value: 2, color: '#4ECDC4' },
]

export const hourlyDistribution = [
  { hour: '8AM',  bookings: 1 },
  { hour: '9AM',  bookings: 2 },
  { hour: '10AM', bookings: 3 },
  { hour: '11AM', bookings: 2 },
  { hour: '12PM', bookings: 1 },
  { hour: '1PM',  bookings: 2 },
  { hour: '2PM',  bookings: 4 },
  { hour: '3PM',  bookings: 3 },
  { hour: '4PM',  bookings: 5 },
  { hour: '5PM',  bookings: 6 },
  { hour: '6PM',  bookings: 4 },
  { hour: '7PM',  bookings: 7 },
  { hour: '8PM',  bookings: 9 },
  { hour: '9PM',  bookings: 3 },
  { hour: '10PM', bookings: 1 },
]

export const smsOptOutTrend = [
  { week: 'W1', rate: 20 },
  { week: 'W2', rate: 25 },
  { week: 'W3', rate: 22 },
  { week: 'W4', rate: 30 },
  { week: 'W5', rate: 28 },
  { week: 'W6', rate: 33 },
]
