// Generates fake SUNAT-style invoices for testing: node samples/make-invoice.js
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SAMPLES = [
  {
    file: 'factura-F001-00000712.pdf',
    issuer: { name: 'DIBORTEL SAC', ruc: '20601730066', address: 'Av. Bolognesi 1250, Tacna - Tacna - Perú' },
    customer: { name: 'MINERA ANDINA DEL SUR S.A.', ruc: '20512345678' },
    serie: 'F001', numero: '00000712', fecha: '28/08/2026', moneda: 'SOLES',
    items: [{ desc: 'Servicio de alojamiento - 2 noches hab. simple', qty: 2, unit: 108.595 }],
    rate: 10.5, total: 240.0, igv: 22.81,
  },
  {
    file: 'factura-E001-00004521.pdf',
    issuer: { name: 'RESTAURANTE EL CHALAN E.I.R.L.', ruc: '20456789012', address: 'Jr. de la Unión 455, Cercado de Lima - Lima - Perú' },
    customer: { name: 'MINERA ANDINA DEL SUR S.A.', ruc: '20512345678' },
    serie: 'E001', numero: '00004521', fecha: '03/09/2026', moneda: 'SOLES',
    items: [
      { desc: 'Menú ejecutivo', qty: 3, unit: 25.0 },
      { desc: 'Bebidas', qty: 3, unit: 8.0 },
    ],
    rate: 18, total: 116.82, igv: 17.82,
  },
];

function draw(inv) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(createWriteStream(new URL(inv.file, import.meta.url)));

  doc.font('Helvetica-Bold').fontSize(16).text(inv.issuer.name, 40, 50, { width: 300 });
  doc.font('Helvetica').fontSize(9).text(inv.issuer.address, { width: 300 });

  doc.rect(360, 45, 195, 80).stroke();
  doc.font('Helvetica-Bold').fontSize(11)
    .text(`R.U.C. ${inv.issuer.ruc}`, 360, 55, { width: 195, align: 'center' })
    .text('FACTURA ELECTRÓNICA', { width: 195, align: 'center' })
    .text(`${inv.serie} - N° ${inv.numero}`, { width: 195, align: 'center' });

  doc.font('Helvetica').fontSize(10)
    .text(`Fecha de Emisión: ${inv.fecha}`, 40, 150)
    .text(`Señor(es): ${inv.customer.name}`)
    .text(`RUC: ${inv.customer.ruc}`)
    .text(`Moneda: ${inv.moneda}`);

  let y = 230;
  doc.font('Helvetica-Bold').text('Cant.', 40, y).text('Descripción', 90, y).text('P. Unit.', 400, y).text('Importe', 480, y);
  doc.font('Helvetica');
  for (const it of inv.items) {
    y += 18;
    doc.text(String(it.qty), 40, y).text(it.desc, 90, y)
      .text(it.unit.toFixed(2), 400, y).text((it.qty * it.unit).toFixed(2), 480, y);
  }

  const gravada = (inv.total - inv.igv).toFixed(2);
  y += 40;
  for (const [label, value] of [
    ['Op. Gravada', gravada],
    [`IGV (${inv.rate}%)`, inv.igv.toFixed(2)],
    ['IMPORTE TOTAL S/', inv.total.toFixed(2)],
  ]) {
    doc.text(label, 360, y).text(value, 480, y);
    y += 16;
  }
  doc.fontSize(8).text('Representación impresa de la Factura Electrónica. Consulte en www.sunat.gob.pe', 40, 760);
  doc.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) SAMPLES.forEach(draw);
