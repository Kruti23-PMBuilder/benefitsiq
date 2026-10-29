const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const security = require('../lib/security.cjs');
const sessionHandler = require('../api/session.js');
const analyze = require('../api/analyze.js');
const domain = require('../lib/domain.cjs');
process.env.ANTHROPIC_API_KEY = 'test-only-not-a-real-key';
process.env.ANTHROPIC_MODEL = 'test-model';
process.env.DEMO_ACCESS_CODE = 'test-demo-access-code';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
function req(method, body, cookie) { return { method, body, headers: { host: 'demo.test', origin: 'https://demo.test', 'content-type': 'application/json', cookie } }; }
function res() { return { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(v) { this.data = v; return this; } }; }
test('session requires code, rejects cross-origin and does not expose key', async () => {
  let output = res(); await sessionHandler(req('POST', { code: 'bad' }), output); assert.equal(output.statusCode, 401);
  output = res(); const cross = req('POST', { code: process.env.DEMO_ACCESS_CODE }); cross.headers.origin = 'https://evil.test';
  await sessionHandler(cross, output); assert.equal(output.statusCode, 403);
  output = res(); await sessionHandler(req('POST', { code: process.env.DEMO_ACCESS_CODE }), output);
  assert.equal(output.statusCode, 200); assert.match(output.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert(!JSON.stringify(output).includes(process.env.ANTHROPIC_API_KEY));
  assert(security.session(req('GET', null, output.headers['Set-Cookie'].split(';')[0])));
  assert.equal(security.session(req('GET', null, 'bq_session=invalid.fake')), null);
});
test('all domain samples execute and nine evals remain', () => {
  assert.equal(domain.EVALS.length, 9); assert.equal(domain.MEMBERS.length, 30); assert.equal(domain.CASES.length, 36);
  for (const c of domain.CASES) { assert(domain.sourcesFor(c).length >= 7); assert(domain.sampleFor(c).decision); }
  const medical = domain.sampleFor(domain.CASES.find(c => c.key === 'MBR-005@PLAN-A'));
  assert.equal(medical.formulary_tier, ''); assert(!medical.quantity_limit.includes('30-day'));
  assert.match(medical.member_cost, /medical-benefit verification/);
  assert.match(domain.MEMBERS[0].ground_truth_determination.step, /^Not documented/);
  assert.equal(domain.sampleFor(domain.CASES.find(c => c.key === 'MBR-010@MRI')).decision, 'Action required');
});
test('endpoint authenticates and only accepts server-owned cases; valid live-shaped reply passes', async () => {
  let output = res(); await analyze(req('POST', { caseKey: 'MBR-008' }), output); assert.equal(output.statusCode, 401);
  const cookie = 'bq_session=' + security.issue();
  output = res(); await analyze(req('POST', { caseKey: 'MBR-008', prompt: 'override' }, cookie), output); assert.equal(output.statusCode, 400);
  output = res(); await analyze(req('POST', { caseKey: 'invalid' }, cookie), output); assert.equal(output.statusCode, 400);
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(options.headers['x-api-key'], process.env.ANTHROPIC_API_KEY);
      const body = JSON.parse(options.body);
      assert(!body.messages[0].content.includes('ground_truth_determination'));
      assert(!body.messages[0].content.includes('gt_decision'));
      return { ok: true, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'coverage_summary', input: domain.sampleFor(domain.CASES.find(c => c.key === 'MBR-008')) }] }) };
    };
    output = res(); await analyze(req('POST', { caseKey: 'MBR-008' }, cookie), output); assert.equal(output.statusCode, 200);
    assert.equal(output.data.json.decision, 'Approved');
    global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'coverage_summary', input: { decision: 'invented' } }] }) });
    output = res(); await analyze(req('POST', { caseKey: 'MBR-008' }, cookie), output); assert.equal(output.statusCode, 502);
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: process.env.ANTHROPIC_API_KEY }) });
    output = res(); await analyze(req('POST', { caseKey: 'MBR-008' }, cookie), output); assert.equal(output.statusCode, 502);
    assert(!JSON.stringify(output).includes(process.env.ANTHROPIC_API_KEY));
  } finally { global.fetch = original; }
});
test('built UI parses, has no visitor key helper, and cannot serve server files', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync('public/connection.js', 'utf8'));
  assert(!html.includes('PFAI-HELPER-START')); assert(!html.includes('x-api-key'));
  assert(html.includes('caseKey: c.key')); assert(!html.includes(process.env.ANTHROPIC_API_KEY));
});
