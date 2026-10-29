(function () {
  'use strict';
  let connected = false;
  let verified = false;
  const listeners = [];
  function announce() { listeners.forEach(fn => fn({ connected, verified })); }
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'demo-login-title');
  dialog.style.cssText = 'max-width:420px;width:90%;border:1px solid #ccc;border-radius:14px;padding:24px;font-family:system-ui';
  dialog.innerHTML = '<form id="demo-login"><h2 id="demo-login-title">Open the BenefitsIQ demo</h2><p>Enter the access code shared by the owner. You do not need a Claude API key.</p><label for="demo-code">Demo access code</label><input id="demo-code" type="password" autocomplete="current-password" required style="display:block;width:100%;margin:12px 0;padding:8px;box-sizing:border-box"><p id="demo-login-message" role="status"></p><button type="submit">Continue</button> <button type="button" id="demo-cancel">Use samples instead</button></form>';
  document.body.appendChild(dialog);
  document.getElementById('demo-cancel').onclick = () => dialog.close();
  async function jsonFetch(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    let data;
    try { data = await response.json(); } catch { throw new Error('The service could not be reached. Please try again.'); }
    if (!response.ok) {
      if (response.status === 401) { connected = false; verified = false; announce(); }
      throw new Error(data.error || 'The service could not finish your request.');
    }
    return data;
  }
  document.getElementById('demo-login').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    const field = document.getElementById('demo-code');
    button.disabled = true;
    try {
      await jsonFetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: field.value }) });
      field.value = ''; connected = true; announce(); dialog.close();
      document.getElementById('demo-login-message').textContent = '';
    } catch (error) { document.getElementById('demo-login-message').textContent = error.message; }
    finally { button.disabled = false; }
  };
  const ready = jsonFetch('/api/session').then(state => { connected = state.connected; announce(); }).catch(() => { connected = false; verified = false; announce(); });
  window.PFAI = {
    ready, connected: () => connected,
    onChange: fn => { listeners.push(fn); fn({ connected, verified }); },
    connect: () => { dialog.showModal(); document.getElementById('demo-code').focus(); },
    generate: input => jsonFetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseKey: input.caseKey }), signal: AbortSignal.timeout(115000) }).then(result => { verified = true; announce(); return result; }).catch(error => { verified = false; announce(); throw error; })
  };
})();
