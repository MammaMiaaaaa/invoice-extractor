// WhatsApp Cloud API (Meta) — the three calls we need, over plain fetch.
import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v23.0';
const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
const auth = () => ({ Authorization: `Bearer ${WHATSAPP_TOKEN}` });

// Meta signs each webhook body with the App Secret: X-Hub-Signature-256: sha256=<hex hmac>
export function isValidSignature(rawBody, header, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string') return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Media is two hops: media id -> short-lived URL -> bytes (both need the bearer token)
export async function downloadMedia(mediaId, maxBytes) {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth() });
  if (!meta.ok) throw new Error(`Media lookup failed: HTTP ${meta.status} ${await meta.text()}`);
  const { url, file_size } = await meta.json();
  if (file_size > maxBytes) throw new Error('PDF too large');
  const res = await fetch(url, { headers: auth() });
  if (!res.ok) throw new Error(`Media download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function sendText(to, body) {
  const res = await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`Send failed: HTTP ${res.status} ${await res.text()}`);
}
