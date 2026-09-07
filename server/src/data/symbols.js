// Static catalog of tradable symbols used across the simulation.
// Deliberately small & curated so the demo is legible, not a random dump.

const SYMBOLS = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy", basePrice: 2945.5 },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", basePrice: 4102.1 },
  { symbol: "INFY", name: "Infosys Ltd", sector: "IT", basePrice: 1832.4 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking", basePrice: 1678.9 },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking", basePrice: 1214.3 },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", basePrice: 812.6 },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Auto", basePrice: 984.2 },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Auto", basePrice: 12480.0 },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", sector: "Pharma", basePrice: 1789.5 },
  { symbol: "DRREDDY", name: "Dr Reddy's Laboratories", sector: "Pharma", basePrice: 6845.0 },
  { symbol: "ITC", name: "ITC Ltd", sector: "FMCG", basePrice: 468.3 },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG", basePrice: 2534.7 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom", basePrice: 1698.2 },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Diversified", basePrice: 3124.8 },
  { symbol: "NTPC", name: "NTPC Ltd", sector: "Energy", basePrice: 398.6 },
];

const SECTORS = [...new Set(SYMBOLS.map((s) => s.sector))];

const SYMBOL_MAP = Object.fromEntries(SYMBOLS.map((s) => [s.symbol, s]));

module.exports = { SYMBOLS, SECTORS, SYMBOL_MAP };
