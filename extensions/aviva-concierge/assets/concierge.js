(() => {
  const root = document.getElementById('AvivaConcierge');
  if (!root) return;
  const launcher = root.querySelector('.aviva-concierge__launcher');
  const dialog = root.querySelector('.aviva-concierge__dialog');
  const close = root.querySelector('[data-concierge-close]');
  const form = root.querySelector('form');
  const input = root.querySelector('textarea');
  const messages = root.querySelector('.aviva-concierge__messages');
  const whatsapp = root.dataset.whatsapp || 'https://wa.me/919810127038';
  const whatsappLabel = root.dataset.whatsappLabel || '+91 9810127038';
  const sessionKey = 'aviva_concierge_session';
  const sessionId = sessionStorage.getItem(sessionKey) || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  sessionStorage.setItem(sessionKey, sessionId);
  const add = (text, kind = 'assistant', asHtml = false) => {
    const p = document.createElement('p');
    p.className = kind;
    if (asHtml) p.innerHTML = text;
    else p.textContent = text;
    messages.append(p);
    messages.scrollTop = messages.scrollHeight;
    return p;
  };
  const whatsappHtml = () =>
    `I don’t have a confident answer for that. Please connect with us on <a href="${whatsapp}" target="_blank" rel="noopener">WhatsApp ${whatsappLabel}</a> for resolving your queries.`;
  const open = () => { dialog.hidden = false; launcher.setAttribute('aria-expanded', 'true'); input.focus(); };
  const shut = () => { dialog.hidden = true; launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); };
  launcher.addEventListener('click', () => (dialog.hidden ? open() : shut()));
  close.addEventListener('click', shut);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !dialog.hidden) shut(); });
  async function send(message) {
    const text = String(message || '').trim();
    if (!text) return;
    add(text, 'visitor');
    input.value = '';
    const pending = add('Consulting the Aviva archive…', 'assistant');
    const endpoint = (root.dataset.endpoint || '').replace(/\/$/, '');
    if (!endpoint || endpoint.includes('YOUR-PROXY')) {
      pending.remove();
      add(whatsappHtml(), 'assistant', true);
      return;
    }
    try {
      const response = await fetch(`${endpoint}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          pageContext: {
            productTitle: root.dataset.productTitle,
            productUrl: root.dataset.productUrl,
            productDescription: root.dataset.productDescription
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      pending.remove();
      if (!response.ok || data.escalate || data.fallbackWhatsapp || !data.answer) {
        add(whatsappHtml(), 'assistant', true);
        return;
      }
      add(data.answer, 'assistant');
    } catch (error) {
      pending.remove();
      add(whatsappHtml(), 'error', true);
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
  root.querySelectorAll('[data-concierge-prompt]').forEach((button) => button.addEventListener('click', () => send(button.textContent)));
})();
