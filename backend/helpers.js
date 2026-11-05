//This cleans plates and phone numbers so the same vehicle always matches

function cleanPlate(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cleanPhone(input) {
  let p = String(input || '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+254')) return p;
  if (p.startsWith('254')) return '+' + p;
  if (p.startsWith('0')) return '+254' + p.slice(1);
  if (p.length === 9) return '+254' + p; // e.g. 712345678
  return p;
}

function isValidPlate(p) { return p.length >= 5 && p.length <= 10; }
function isValidPhone(p) { return /^\+254[17]\d{8}$/.test(p); }

module.exports = { cleanPlate, cleanPhone, isValidPlate, isValidPhone };