import express from 'express';
import multer from 'multer';
import { extractInvoice } from './extract.js';
import { appendRow, sheetsEnabled } from './sheets.js';
import { isValidSignature, downloadMedia, sendText } from './whatsapp.js';

const PORT = process.env.PORT || 3000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const CURRENCY = { PEN: 'S/', USD: 'US$', EUR: '€' };
const { GEMINI_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, PUBLIC_URL } =
  process.env;

if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set (see .env.example)');

// ponytail: in-memory store, lost on restart — the Google Sheet is the durable copy
const records = [];
let nextId = 1;

const isPdf = (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-';
const withoutPdf = ({ pdf, ...rest }) => rest;

async function processInvoice(pdf, source) {
  const id = nextId++;
  const invoice = await extractInvoice(pdf);
  const record = { id, receivedAt: new Date().toISOString(), source, ...invoice };

  let sheet = 'disabled';
  if (sheetsEnabled()) {
    try {
      await appendRow(record);
      sheet = 'ok';
    } catch (err) {
      console.error(`Sheets append failed for #${id}:`, err.message);
      sheet = 'error';
    }
  }
  const saved = { ...record, sheet };
  records.push({ ...saved, pdf });
  return saved;
}

const app = express();
app.use(express.static('public'));

app.get('/api/latest', (_req, res) => {
  const last = records.at(-1);
  res.json(last ? withoutPdf(last) : null);
});

app.get('/api/records/:id/pdf', (req, res) => {
  const rec = records.find((r) => r.id === Number(req.params.id));
  if (!rec) return res.status(404).send('Not found');
  res.type('application/pdf').send(rec.pdf);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES } });
app.post('/api/upload', upload.single('invoice'), async (req, res) => {
  if (!req.file || !isPdf(req.file.buffer)) return res.status(400).json({ error: 'Please upload a PDF file' });
  try {
    res.json(await processInvoice(req.file.buffer, 'upload'));
  } catch (err) {
    console.error('Upload extraction failed:', err);
    res.status(502).json({ error: 'Could not extract the invoice. Check the server log.' });
  }
});

// ---------- WhatsApp (Meta Cloud API) ----------

function summary(r) {
  const lines = [
    `✅ ${r.tipoDocumento} ${r.serie}-${r.numero}`,
    `${r.proveedor} (RUC ${r.ruc})`,
    `Fecha: ${r.fechaEmision} · ${r.ciudad}, ${r.pais}`,
    `Total: ${CURRENCY[r.moneda] ?? r.moneda} ${r.importeTotal.toFixed(2)} · IGV ${r.tasaIgv}%: ${r.igv.toFixed(2)}`,
    `📊 Google Sheet: ${{ ok: 'actualizado', error: 'error al guardar', disabled: 'no configurado' }[r.sheet]}`,
  ];
  if (PUBLIC_URL) lines.push(`📝 Formulario: ${PUBLIC_URL}/`);
  if (r.warnings.length) lines.push('', '⚠️ Revisar:', ...r.warnings.map((w) => `• ${w}`));
  return lines.join('\n');
}

// ponytail: unbounded, fine for a prototype; Meta retries webhooks, so skip message ids we've seen
const seenMessages = new Set();

async function handleWhatsappMessage({ id, from, type, document }) {
  if (seenMessages.has(id)) return;
  seenMessages.add(id);
  try {
    if (type !== 'document' || document.mime_type !== 'application/pdf') {
      return await sendText(from, '📄 Envíame la factura en PDF y la registro.');
    }
    await sendText(from, '📥 Factura recibida, procesando…');
    const pdf = await downloadMedia(document.id, MAX_PDF_BYTES);
    if (!isPdf(pdf)) return await sendText(from, '❌ El archivo no es un PDF válido.');
    await sendText(from, summary(await processInvoice(pdf, `whatsapp +${from}`)));
  } catch (err) {
    console.error('WhatsApp processing failed:', err);
    await sendText(from, '❌ No pude leer la factura. Inténtalo de nuevo o envía otro PDF.').catch(() => {});
  }
}

if (WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_VERIFY_TOKEN && META_APP_SECRET) {
  // One-time handshake when you click "Verify and save" in the Meta dashboard
  app.get('/whatsapp', (req, res) => {
    const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN;
    if (!ok) return res.sendStatus(403);
    res.type('text/plain').send(req.query['hub.challenge']);
  });

  // Raw body: the signature is computed over the exact bytes Meta sent
  app.post('/whatsapp', express.raw({ type: 'application/json' }), (req, res) => {
    if (!isValidSignature(req.body, req.get('X-Hub-Signature-256'), META_APP_SECRET)) return res.sendStatus(401);
    res.sendStatus(200); // ack right away; results go out as separate messages
    try {
      const { entry = [] } = JSON.parse(req.body);
      const values = entry.flatMap((e) => e.changes ?? []).map((c) => c.value ?? {});
      values.flatMap((v) => v.messages ?? []).forEach(handleWhatsappMessage);
      // Meta accepts a send and reports delivery failures later, only here
      for (const s of values.flatMap((v) => v.statuses ?? [])) {
        if (s.status === 'failed') console.error(`WhatsApp reply to +${s.recipient_id} failed:`, s.errors?.[0]?.title);
      }
    } catch (err) {
      console.error('Bad WhatsApp webhook payload:', err);
    }
  });
} else {
  console.warn('WHATSAPP_* / META_APP_SECRET not set: WhatsApp webhook disabled, web upload still works.');
}

app.listen(PORT, () => {
  console.log(`Invoice extractor on http://localhost:${PORT}`);
  console.log(`Google Sheets: ${sheetsEnabled() ? 'enabled' : 'disabled (SHEET_ID not set)'}`);
});
