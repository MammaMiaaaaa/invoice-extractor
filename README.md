# WhatsApp Invoice Extractor (prototype)

Send a PDF invoice to a WhatsApp number. An LLM reads it, and the data lands in a **Google Sheet** and a
**web form** that copies the "Detalle Documento de Sustento" screen.

```
WhatsApp ──► Meta Cloud API ──► POST /whatsapp (Express)
                                   │  download PDF
                                   ▼
                          Gemini 2.5 Flash (PDF in, strict JSON schema out)
                                   │  validate: RUC 11 digits, SUNAT series, date, IGV vs. total
                     ┌─────────────┼──────────────────┐
                     ▼             ▼                  ▼
              Google Sheet    Web form (/)      WhatsApp reply
              (1 row/invoice) (live, auto-fill)  with summary + warnings
```

Extracted fields: Fecha de Emisión, Tipo de Documento, Serie, Número, RUC, Proveedor, País, Ciudad,
Importe Total, Tasa IGV (18% / 10.5% / 0), IGV, Otros Servicios, Moneda.

## Files

| File | What it does |
|---|---|
| `server.js` | Express app with the WhatsApp webhook, PDF upload fallback, and the form API |
| `whatsapp.js` | WhatsApp Cloud API: signature check, media download, send text |
| `extract.js` | LLM call + schema + validation. **The only file to change to switch to Claude or GPT** |
| `sheets.js` | Appends a row and writes the header row on first use |
| `public/index.html` | Test form, auto-filled and highlighted, updates live |
| `samples/` | Two fake SUNAT invoices (10.5% hotel, 18% restaurant) plus their generator |
| `extract.test.js` | Validation unit tests and live extraction tests |

## Run it (about 10 minutes)

```bash
npm install
cp .env.example .env         # add GEMINI_API_KEY at minimum
npm test                     # live tests run when GEMINI_API_KEY is set
npm start                    # http://localhost:3000, drag a PDF from samples/ onto the page
```

### WhatsApp (Meta Cloud API)
1. developers.facebook.com → **Create App** → use case **Connect with customers through WhatsApp** → link a business portfolio.
2. **WhatsApp → API Setup**: copy the **temporary access token** and **Phone number ID**. Under **To**, add and verify your own phone number.
3. **App settings → Basic**: copy the **App secret**.
4. Fill `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` in `.env`. Run `ngrok http 3000`, put the https URL in `PUBLIC_URL`, then `npm start`.
5. **WhatsApp → Configuration → Webhook**: callback `https://<ngrok>/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, **Verify and save**, then subscribe to the **messages** field.
6. Send a PDF from your phone to the test number.

Webhooks without a valid `X-Hub-Signature-256` are rejected. The temporary token expires after 24h; for a permanent one, create a **System user** in Business Settings and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`.

### Google Sheets
1. In Google Cloud, enable the **Google Sheets API**. Create a **service account** and download its JSON key as `service-account.json`.
2. Create a Sheet and share it (Editor) with the service account's email.
3. Set `SHEET_ID` (from the Sheet URL) in `.env`. Rows go to the first tab unless `SHEET_TAB` is set.

## Prototype limits (and the production path)
- Records are kept in memory, so the form resets on restart. The Sheet is the durable copy. For production, use a database.
- The Meta test number only talks to up to 5 verified recipients. For production, add your own number, complete Business Verification and set the app to Live.
- One invoice per message; only the first attachment is read.
- Fields the LLM can't be sure about are flagged as warnings for a person to review, not silently accepted.
- Next steps: filling the real SAP/Fiori form through its API or RPA, checking the RUC against SUNAT, and detecting duplicate invoices.
