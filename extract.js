import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const IGV_TOLERANCE = 0.02; // soles; invoices round each line to 2 decimals

const SCHEMA = {
  type: 'object',
  properties: {
    fechaEmision: { type: 'string', description: 'Issue date as DD/MM/YYYY' },
    tipoDocumento: {
      type: 'string',
      enum: ['Factura', 'Boleta de Venta', 'Nota de Crédito', 'Nota de Débito', 'Recibo por Honorarios', 'Otro'],
    },
    serie: { type: 'string', description: 'Series prefix, e.g. F001, B002, E001' },
    numero: { type: 'string', description: 'Correlative number after the dash, digits only' },
    ruc: { type: 'string', description: 'RUC (tax id) of the ISSUER / seller, 11 digits. Not the customer RUC.' },
    proveedor: { type: 'string', description: 'Legal name (razón social) of the issuer / seller' },
    pais: { type: 'string', description: 'Issuer country in Spanish, e.g. Perú' },
    ciudad: { type: 'string', description: 'Issuer city, e.g. Tacna, Lima' },
    importeTotal: { type: 'number', description: 'Grand total to pay (importe total)' },
    tasaIgv: { type: 'number', description: 'IGV rate as percentage: 18, 10.5, or 0 if exonerated/inafecto' },
    igv: { type: 'number', description: 'IGV tax amount' },
    otrosServicios: { type: 'number', description: 'Other charges not subject to IGV (e.g. recargo al consumo). 0 if none' },
    moneda: { type: 'string', enum: ['PEN', 'USD', 'EUR'] },
  },
  required: ['fechaEmision', 'tipoDocumento', 'serie', 'numero', 'ruc', 'proveedor', 'pais', 'ciudad',
    'importeTotal', 'tasaIgv', 'igv', 'otrosServicios', 'moneda'],
};

const PROMPT = `You are an accounts-payable clerk in Peru. Extract the fields from this invoice (comprobante de pago).
The document number looks like "F001-00000712": serie = "F001", numero = "00000712".
Use the ISSUER's data (the company that emits the invoice), never the customer's.
If a value is truly absent, use "" for text and 0 for numbers. Do not invent values.`;

// ponytail: single-provider seam — swap this function to use Claude/OpenAI, nothing else changes
export async function callLlm(pdf) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
      { text: PROMPT },
    ],
    config: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, temperature: 0 },
  });
  return JSON.parse(res.text);
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Normalizes fields and attaches human-readable warnings; never throws on bad data. */
export function validate(raw) {
  const inv = {
    ...raw,
    serie: raw.serie.trim().toUpperCase(),
    numero: raw.numero.replace(/\D/g, '').padStart(8, '0'),
    ruc: raw.ruc.replace(/\D/g, ''),
  };
  const warnings = [];

  if (!/^\d{11}$/.test(inv.ruc)) warnings.push(`RUC "${inv.ruc}" should have 11 digits`);
  if (!/^[FBE][A-Z0-9]{3}$/.test(inv.serie)) warnings.push(`Serie "${inv.serie}" is not a SUNAT series (F###/B###/E###)`);
  if (!isValidDate(inv.fechaEmision)) warnings.push(`Fecha "${inv.fechaEmision}" is not a valid DD/MM/YYYY date`);

  const base = (inv.importeTotal - inv.otrosServicios) / (1 + inv.tasaIgv / 100);
  const expectedIgv = round2(inv.importeTotal - inv.otrosServicios - base);
  if (Math.abs(expectedIgv - inv.igv) > IGV_TOLERANCE) {
    warnings.push(`IGV ${inv.igv} does not match ${inv.tasaIgv}% of total (expected ${expectedIgv})`);
  }
  return { ...inv, warnings };
}

function isValidDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1;
}

export async function extractInvoice(pdf) {
  return validate(await callLlm(pdf));
}
