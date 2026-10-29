const crypto = require('node:crypto');
const windows = new Map();
function same(a, b) {
  const hash = value => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}
function configured() {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL &&
    process.env.DEMO_ACCESS_CODE?.length >= 12 && process.env.SESSION_SECRET?.length >= 32);
}
function sign(value) { return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('base64url'); }
function issue() {
  const value = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 3600000, id: crypto.randomUUID() })).toString('base64url');
  return value + '.' + sign(value);
}
function session(req) {
  try {
    if (!configured()) return null;
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('bq_session='))?.slice(11);
    if (!token || token.length > 1024) return null;
    const [value, signature, extra] = token.split('.');
    if (extra || !signature || !same(signature, sign(value))) return null;
    const data = JSON.parse(Buffer.from(value, 'base64url').toString());
    return data.exp > Date.now() && typeof data.id === 'string' ? data : null;
  } catch { return null; }
}
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
function originOK(req) {
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol);
  } catch { return false; }
}
function body(req) {
  let value = req.body;
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('content-type');
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 2048) throw new Error('size'); value = JSON.parse(value); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > 2048) throw new Error('body');
  return value;
}
// Best-effort instance-local protection, not a distributed spending limit.
function limit(key, maximum, ms = 60000) {
  const now = Date.now();
  for (const [k, value] of windows) if (value.until <= now) windows.delete(k);
  if (windows.size > 5000) return false;
  const current = windows.get(key) || { count: 0, until: now + ms };
  if (current.count >= maximum) return false;
  current.count++; windows.set(key, current); return true;
}
module.exports = { same, configured, issue, session, headers, originOK, body, limit };
