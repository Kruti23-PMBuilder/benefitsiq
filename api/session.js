const security = require('../lib/security.cjs');
module.exports = async function handler(req, res) {
  security.headers(res);
  if (req.method === 'GET') return res.status(200).json({ configured: security.configured(), connected: Boolean(security.session(req)) });
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  if (!security.originOK(req)) return res.status(403).json({ error: 'Please open BenefitsIQ directly and try again.' });
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'bq_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure);
    return res.status(200).json({ connected: false });
  }
  if (!security.configured()) return res.status(503).json({ error: 'The owner has not finished configuring the AI service.' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  if (!security.limit('login:' + ip, 10, 15 * 60000)) return res.status(429).json({ error: 'Too many sign-in attempts. Please try later.' });
  let input;
  try { input = security.body(req); } catch { return res.status(400).json({ error: 'Enter your demo access code.' }); }
  if (!security.same(input.code || '', process.env.DEMO_ACCESS_CODE)) return res.status(401).json({ error: 'That demo access code was not accepted.' });
  res.setHeader('Set-Cookie', 'bq_session=' + security.issue() + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800' + secure);
  return res.status(200).json({ connected: true });
};
