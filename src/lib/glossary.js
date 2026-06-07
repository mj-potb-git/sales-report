// Plain-language definitions for the metric jargon used across the dashboard.
// Surfaced via <InfoTip> so a new team member isn't staring at gibberish.

export const GLOSSARY = {
  roas:   'Return on Ad Spend = Revenue ÷ Ad Spend. 3.54x means every ₱1 spent returned ₱3.54.',
  ar:     'Ads-to-Revenue = Ad Spend ÷ Revenue. Lower is better (less ad cost per peso earned).',
  cpl:    'Cost Per Lead = Ad Spend ÷ Leads (bookings made). How much it costs to get one booking.',
  cac:    'Customer Acquisition Cost = Ad Spend ÷ Sales. How much ad spend per closed sale.',
  sur:    'Show-Up Rate = people who showed up ÷ those whose status is marked (showed + no-show).',
  cvr:    'Conversion Rate = Sales ÷ Show-Ups. Of those who attended, how many bought.',
  closingRate: 'Closing Rate = Sales ÷ Show-Ups. How well the team closes people who actually attended (no-shows excluded — not the closer’s fault).',
  leads:  'Leads = appointments BOOKED on this day (when the lead signed up).',
  scheduled: 'Scheduled = appointments that are SET to happen on this day (by appointment date).',
  showUp: 'Showed up to their appointment (from YCBM’s own No-Show marking).',
  noShow: 'Did not show up — flagged as No-Show in YCBM.',
  unmarked: 'Appointment not yet decided (still upcoming, or attendance not marked in YCBM).',
  profit: 'Profit = Gross Revenue − Ad Spend.',
  revenue: 'Gross Revenue = total paid sales (by payment date) from LakbayHub.',
}
