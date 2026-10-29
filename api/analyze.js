const { CASES, SCHEMA, SYSTEM_PROMPT, sourcesFor } = require('../lib/domain.cjs');
const security = require('../lib/security.cjs');
function validate(value, schema) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (schema.required.some(key => !(key in value))) return false;
    return Object.keys(value).every(key => schema.properties[key] && validate(value[key], schema.properties[key]));
  }
  if (schema.type === 'array') return Array.isArray(value) && value.length <= 50 && value.every(item => validate(item, schema.items));
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  return typeof value === 'string' && value.length <= 10000 && (!schema.enum || schema.enum.includes(value));
}
async function handler(req, res) {
  security.headers(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!security.originOK(req)) return res.status(403).json({ error: 'Open BenefitsIQ directly and try again.' });
  if (!security.configured()) return res.status(503).json({ error: 'The AI service is not configured yet.' });
  const session = security.session(req);
  if (!session) return res.status(401).json({ error: 'Your demo session has expired. Sign in again.' });
  let input;
  try { input = security.body(req); } catch { return res.status(400).json({ error: 'Invalid case request.' }); }
  if (Object.keys(input).some(key => key !== 'caseKey')) return res.status(400).json({ error: 'Only the built-in synthetic cases are supported.' });
  const c = CASES.find(item => item.key === input.caseKey);
  if (!c) return res.status(400).json({ error: 'Choose a built-in synthetic case.' });
  if (!security.limit('session:' + session.id, 12) || !security.limit('total', 60)) {
    res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Demo usage limit reached. Please wait a minute.' });
  }
  const sources = sourcesFor(c);
  const prompt = ['CASE ' + c.key + ' on ' + c.plan + '. Prepare the Coverage Truth Summary.'].concat(sources.map(s =>
    s.ids ? 'SOURCE GROUP ' + s.title + ' (' + s.sys + '):\n' + s.text : 'SOURCE [' + s.id + '] ' + s.title + ' (' + s.sys + '):\n' + s.text)).join('\n\n');
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(105000),
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL, max_tokens: 3000, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }], tools: [{ name: 'coverage_summary', description: 'Return the proposed Coverage Truth Summary for human review.', input_schema: SCHEMA }],
        tool_choice: { type: 'tool', name: 'coverage_summary' } })
    });
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return res.status(status).json({ error: upstream.status === 429 ? 'The AI service is busy. Please try later.' : 'The AI request failed. The owner should check model access, credits and server settings.' });
    }
    const data = await upstream.json();
    if (data.stop_reason === 'max_tokens') return res.status(502).json({ error: 'The AI reply was incomplete. Please try again.' });
    const result = data.content?.find(block => block.type === 'tool_use' && block.name === 'coverage_summary')?.input;
    if (!validate(result, SCHEMA)) return res.status(502).json({ error: 'The AI reply did not match the required summary. Please try again.' });
    const known = sources.flatMap(source => source.ids || [source.id]);
    if (!result.citations.length || result.citations.some(id => !known.includes(id))) return res.status(502).json({ error: 'The AI cited unsupported evidence. Please rerun and review.' });
    return res.status(200).json({ json: result });
  } catch (error) {
    return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: 'The AI service could not finish the request. Please retry.' });
  }
}
module.exports = handler;
module.exports.validate = validate;
