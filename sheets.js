import { google } from 'googleapis';

export const HEADERS = ['Recibido', 'Origen', 'Fecha de Emisión', 'Tipo de Documento', 'Serie', 'Número',
  'RUC', 'Proveedor', 'País', 'Ciudad', 'Importe Total', 'Tasa IGV %', 'IGV', 'Otros Servicios', 'Moneda', 'Advertencias'];

export const sheetsEnabled = () => Boolean(process.env.SHEET_ID);

const sheetsApi = () => google.sheets({
  version: 'v4',
  // reads the service-account JSON from GOOGLE_APPLICATION_CREDENTIALS
  auth: new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] }),
});

export const toRow = (r) => [r.receivedAt, r.source, r.fechaEmision, r.tipoDocumento, r.serie, r.numero,
  r.ruc, r.proveedor, r.pais, r.ciudad, r.importeTotal, r.tasaIgv, r.igv, r.otrosServicios, r.moneda,
  r.warnings.join('; ')];

export async function appendRow(record) {
  const api = sheetsApi();
  const spreadsheetId = process.env.SHEET_ID;
  // no tab name = first tab, whatever its locale-specific name ("Sheet1", "Hoja 1")
  const prefix = process.env.SHEET_TAB ? `${process.env.SHEET_TAB}!` : '';

  const { data } = await api.spreadsheets.values.get({ spreadsheetId, range: `${prefix}A1:A1` });
  const values = data.values ? [toRow(record)] : [HEADERS, toRow(record)];

  await api.spreadsheets.values.append({
    spreadsheetId,
    range: `${prefix}A1`,
    // RAW keeps "00000712" and the RUC as text instead of numbers
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}
