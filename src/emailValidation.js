/**
 * Basic email format validation. Rejects addresses that SMTP will reject
 * (e.g. domain like ".com" with no label, or missing @).
 */

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const s = email.trim();
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return false;
  // Domain must have at least one dot and must not start with a dot (e.g. reject "user@.com")
  if (domain.startsWith('.') || !domain.includes('.')) return false;
  const lastDot = domain.lastIndexOf('.');
  const tld = domain.slice(lastDot + 1);
  if (!tld || tld.length < 2) return false;
  return true;
}

module.exports = { isValidEmail };
