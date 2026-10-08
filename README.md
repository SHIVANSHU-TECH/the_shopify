# Aviva Groq Concierge

Server-side chat API for the Aviva Shopify theme. The theme chatbot (bottom-right) calls this service; your **Groq API key stays on the server**, never in the theme zip.

## Quick start

1. Create a free key at [console.groq.com](https://console.groq.com/).
2. `cd grok-concierge` (folder name kept for compatibility)
3. `npm install`
4. Copy `.env.example` → `.env` and set `GROQ_API_KEY` and `WHATSAPP_NUMBER=+91 9810127038`
5. `npm start` (local) or deploy to Railway / Render / Fly / any Node host with HTTPS
6. In Shopify Admin → Online Store → Themes → Customize → Theme settings → **Aviva Concierge (Groq)**, paste your public HTTPS URL (no trailing slash), e.g. `https://aviva-concierge.onrender.com`

Default model is **`openai/gpt-oss-120b`** (Llama models were decommissioned on Groq). Override with `GROQ_MODEL` if needed (`openai/gpt-oss-20b` or `qwen/qwen3.6-27b`).

The theme posts to `{endpoint}/chat`.

## Behaviour

- Answers from `src/faq.json` plus optional live Shopify products (`SHOPIFY_*` env vars).
- If it cannot answer, or Groq/API fails, it tells the customer to connect on WhatsApp at **+91 9810127038**.
- Refuses medical diagnosis; redirects pregnancy / adverse reaction queries to a dermatologist + WhatsApp.

## Optional Shopify app proxy

If you also use the theme app extension under `extensions/`, configure an app proxy to this server. For a plain theme zip upload, the HTTPS endpoint URL in theme settings is enough (CORS is enabled via `ALLOWED_ORIGIN`).
