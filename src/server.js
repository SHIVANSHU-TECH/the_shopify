import crypto from 'node:crypto';
import express from 'express';
import { relevantKnowledge } from './knowledge.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const recentRequests = new Map();
const limit = Number(process.env.MAX_REQUESTS_PER_HOUR || 40);
const whatsapp = process.env.WHATSAPP_NUMBER || '+91 9810127038';
const whatsappDigits = whatsapp.replace(/\D/g, '');
const whatsappLink = `https://wa.me/${whatsappDigits}`;
const escalateCopy = `I don’t have enough approved information to answer that confidently. Please connect with us on WhatsApp at ${whatsapp} for resolving your queries. ${whatsappLink}`;

app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function proxyIsValid(query) {
  if (!process.env.SHOPIFY_API_SECRET) return true;
  const { signature, ...unsigned } = query;
  if (!signature) return process.env.NODE_ENV !== 'production';
  const message = Object.keys(unsigned).sort().map((key) => `${key}=${unsigned[key]}`).join('');
  const expected = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function rateLimit(key) {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const hits = (recentRequests.get(key) || []).filter((hit) => hit > windowStart);
  if (hits.length >= limit) return false;
  hits.push(now);
  recentRequests.set(key, hits);
  return true;
}

function safeText(value, max = 1000) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
}

function safetyReply(message) {
  return /(pregnan|medical condition|adverse reaction|rash|burning|swelling|diagnos|treat|cure)/i.test(message)
    ? `I can share approved product information, but I can’t diagnose or treat a skin concern. If you are pregnant, have a medical condition, or are experiencing an adverse reaction, please stop use as appropriate and consult a qualified dermatologist. For store support, WhatsApp us at ${whatsapp}.`
    : null;
}

function shouldEscalate(answer, sources) {
  if (!answer) return true;
  if (!sources.length) return true;
  return /(don.?t know|do not know|not sure|no information|can.?t (find|answer)|unable to|beyond my|contact (support|us)|whatsapp)/i.test(answer);
}

function policyPrompt(sources) {
  return `You are Aviva Concierge for a luxury Indian skincare brand. Answer only from the APPROVED SOURCES below.
Rules:
- Never invent ingredient claims, prices, stock, delivery times, medical advice, or order status.
- Be concise, warm, and luxury-editorial in tone.
- If sources do not answer the question, reply exactly that you cannot answer confidently and tell the customer to connect on WhatsApp at ${whatsapp} for resolving their queries.
- Do not diagnose, treat, cure, or promise results.
- Prefer product and ritual guidance grounded in the sources.

APPROVED SOURCES:
${sources.map((s) => `TITLE: ${s.title}\nURL: ${s.url}\nTEXT: ${s.content}`).join('\n\n')}`;
}

app.get('/health', (_req, res) => res.json({ ok: true, provider: 'groq' }));

app.post(['/chat', '/apps/aviva-concierge/chat'], async (req, res) => {
  if (process.env.SHOPIFY_API_SECRET && !proxyIsValid(req.query)) {
    return res.status(401).json({ error: 'Invalid storefront proxy signature.', escalate: true, fallbackWhatsapp: true });
  }

  const message = safeText(req.body?.message);
  const sessionId = safeText(req.body?.sessionId, 120);
  const pageContext = req.body?.pageContext || {};

  if (!message || !sessionId) {
    return res.status(400).json({ error: 'A session and message are required.', escalate: true });
  }
  if (!rateLimit(`${req.ip}:${sessionId}`)) {
    return res.status(429).json({ error: 'Please wait before sending another message.', escalate: true });
  }

  const safeResponse = safetyReply(message);
  if (safeResponse) return res.json({ answer: safeResponse, sources: [], escalateSuggested: false });

  try {
    const sources = await relevantKnowledge(message, {
      productTitle: safeText(pageContext.productTitle, 160),
      productDescription: safeText(pageContext.productDescription, 800),
      productUrl: safeText(pageContext.productUrl, 240)
    });

    if (!process.env.GROQ_API_KEY) {
      return res.json({ answer: escalateCopy, escalate: true, fallbackWhatsapp: true, sources: [] });
    }

    const groq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          { role: 'system', content: policyPrompt(sources) },
          { role: 'user', content: message }
        ]
      })
    });

    if (!groq.ok) {
      const errText = await groq.text();
      console.error('Groq error', groq.status, errText);
      return res.status(503).json({ answer: escalateCopy, escalate: true, fallbackWhatsapp: true });
    }

    const data = await groq.json();
    const answer = safeText(data.choices?.[0]?.message?.content || '', 1800);
    const escalate = shouldEscalate(answer, sources);

    res.json({
      answer: escalate ? escalateCopy : answer,
      sources: sources.map(({ title, url }) => ({ title, url })),
      escalate,
      fallbackWhatsapp: escalate,
      conversationId: data.id || null
    });
  } catch (error) {
    console.error(error.message);
    res.status(503).json({ answer: escalateCopy, escalate: true, fallbackWhatsapp: true });
  }
});

app.listen(port, () => console.log(`Aviva Groq Concierge listening on ${port}`));
