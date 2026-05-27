// Realistic 30-day mock sales seed for Lakbay Hub signups.
// Shape matches spec exactly so a real API can be swapped in 1:1.

const agents = [
  { name: 'Juan Dela Cruz',      team: 'Team Alpha' },
  { name: 'Maria Santos',        team: 'Team Alpha' },
  { name: 'Joshua Reyes',        team: 'Team Alpha' },
  { name: 'Andrea Lim',          team: 'Team Bravo' },
  { name: 'Carlo Mendoza',       team: 'Team Bravo' },
  { name: 'Patricia Garcia',     team: 'Team Bravo' },
  { name: 'Miguel Torres',       team: 'Team Charlie' },
  { name: 'Sophia Aquino',       team: 'Team Charlie' },
  { name: 'Daniel Cruz',         team: 'Team Charlie' },
  { name: 'Bianca Velasco',      team: 'Team Delta' },
  { name: 'Renz Fajardo',        team: 'Team Delta' },
  { name: 'Camille Pascual',     team: 'Team Delta' },
]

const customerPool = [
  'Aileen R.', 'Rommel B.', 'Jasmine V.', 'Edgardo T.', 'Marichu L.',
  'Norman F.', 'Vivian H.', 'Reggie M.', 'Catherine O.', 'Bryan P.',
  'Lalaine S.', 'Marlon C.', 'Glenda N.', 'Junjun D.', 'Cherryl A.',
  'Ariel G.', 'Trisha K.', 'Domingo E.', 'Karylle U.', 'Eric J.',
]

// Deterministic PRNG so the dashboard is stable across reloads
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min
}

function generate() {
  const rand = mulberry32(42)
  const records = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let txn = 1000

  // Generate 30 days of records
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = new Date(today.getTime() - dayOffset * 86400000)
    const dow  = date.getDay() // 0 = Sun, 6 = Sat — weekends slightly slower

    // Each agent makes 0–4 sales per day, weekend = 0–2
    for (const agent of agents) {
      const maxSales = dow === 0 || dow === 6 ? 2 : 4
      const salesCount = seededInt(rand, 0, maxSales)

      for (let i = 0; i < salesCount; i++) {
        const amount = 1000 * seededInt(rand, 5, 35) // ₱5k – ₱35k
        const signups = seededInt(rand, 1, 4)
        const customer = customerPool[seededInt(rand, 0, customerPool.length - 1)]

        records.push({
          sales_agent: agent.name,
          team:        agent.team,
          date:        date.toISOString().slice(0, 10), // YYYY-MM-DD
          sales_amount: amount,
          signup_count: signups,
          transaction_id: `TXN${String(txn++).padStart(5, '0')}`,
          customer_name: customer,
        })
      }
    }
  }

  return records
}

export const mockSalesRecords = generate()
export const mockAgents = agents
export const mockTeams = [...new Set(agents.map(a => a.team))]
