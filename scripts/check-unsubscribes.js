#!/usr/bin/env node
/**
 * check-unsubscribes.js
 *
 * Corre antes de send-daily-outreach.js en el mismo workflow diario. Revisa la
 * bandeja de entrada de Gmail (IMAP) buscando correos no leídos cuyo asunto o
 * cuerpo contenga "BAJA" o "UNSUBSCRIBE", encuentra el lead por email del
 * remitente y lo marca opted_out:true — a partir de ahí ningún script
 * automático (correo ni WhatsApp) vuelve a contactarlo.
 *
 * Variables de entorno requeridas (mismas que send-daily-outreach.js):
 *   GMAIL_USER, GMAIL_APP_PASSWORD
 */

const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');

const LEADS_PATH = path.join(__dirname, '..', 'leads.json');
const KEYWORDS = ['baja', 'unsubscribe', 'no me contacten', 'no me escriban'];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Falta la variable de entorno ${name}.`); process.exit(1); }
  return v;
}

async function main() {
  const user = requireEnv('GMAIL_USER');
  const pass = requireEnv('GMAIL_APP_PASSWORD');

  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf-8'));
  const byEmail = new Map(leads.filter(l => l.email).map(l => [l.email.toLowerCase(), l]));

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let optedOut = 0;

  try {
    const uids = await client.search({ seen: false });
    for (const uid of uids || []) {
      const msg = await client.fetchOne(uid, { envelope: true, source: true });
      const fromAddr = (msg.envelope.from && msg.envelope.from[0] && msg.envelope.from[0].address || '').toLowerCase();
      const subject = (msg.envelope.subject || '').toLowerCase();
      const bodyText = msg.source ? msg.source.toString('utf-8').toLowerCase() : '';
      const isUnsub = KEYWORDS.some(k => subject.includes(k) || bodyText.includes(k));
      if (isUnsub && byEmail.has(fromAddr)) {
        const lead = byEmail.get(fromAddr);
        lead.opted_out = true;
        lead.updated_at = new Date().toISOString().slice(0, 10);
        optedOut++;
        console.log(`Baja registrada: ${lead.name} <${fromAddr}>`);
      }
      await client.messageFlagsAdd(uid, ['\\Seen']);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (optedOut) fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2) + '\n');
  console.log(`Listo. Bajas nuevas: ${optedOut}`);
}

main().catch(e => { console.error(e); process.exit(1); });
