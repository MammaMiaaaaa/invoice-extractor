import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validate, extractInvoice } from './extract.js';

// Values from the client's reference screenshot
const SCREENSHOT = {
  fechaEmision: '28/08/2026', tipoDocumento: 'Factura', serie: 'F001', numero: '712',
  ruc: '20601730066', proveedor: 'DIBORTEL SAC', pais: 'Perú', ciudad: 'Tacna',
  importeTotal: 240, tasaIgv: 10.5, igv: 22.81, otrosServicios: 0, moneda: 'PEN',
};

test('valid invoice has no warnings and pads numero', () => {
  const inv = validate(SCREENSHOT);
  assert.deepEqual(inv.warnings, []);
  assert.equal(inv.numero, '00000712');
});

test('flags bad RUC, series, date and IGV mismatch', () => {
  const inv = validate({ ...SCREENSHOT, ruc: '2060173', serie: '0001', fechaEmision: '31/02/2026', igv: 36.61 });
  assert.equal(inv.warnings.length, 4, inv.warnings.join('\n'));
});

test('IGV check excludes otros servicios', () => {
  // 100 taxable at 18% = 118, plus 10 recargo al consumo (not taxed)
  assert.deepEqual(validate({ ...SCREENSHOT, importeTotal: 128, tasaIgv: 18, igv: 18, otrosServicios: 10 }).warnings, []);
});

const live = { skip: !process.env.GEMINI_API_KEY && 'set GEMINI_API_KEY to run live extraction' };

test('live: extracts the screenshot invoice', live, async () => {
  const inv = await extractInvoice(await readFile(new URL('samples/factura-F001-00000712.pdf', import.meta.url)));
  assert.deepEqual({ ...inv, warnings: undefined, pais: inv.pais.normalize() },
    { ...SCREENSHOT, numero: '00000712', warnings: undefined, pais: 'Perú'.normalize() });
});

test('live: picks issuer RUC, not customer RUC', live, async () => {
  const inv = await extractInvoice(await readFile(new URL('samples/factura-E001-00004521.pdf', import.meta.url)));
  assert.equal(inv.ruc, '20456789012');
  assert.equal(inv.serie, 'E001');
  assert.equal(inv.importeTotal, 116.82);
  assert.equal(inv.tasaIgv, 18);
  assert.deepEqual(inv.warnings, []);
});
