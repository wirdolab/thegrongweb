#!/usr/bin/env node
/**
 * send-daily-outreach.js
 *
 * Corre diario vía GitHub Actions (.github/workflows/daily-outreach.yml).
 * Envía correo (intento 1, 2 o 3, según el funnel) a todos los leads cuyo
 * canal preferido es "email" (los que no tienen teléfono válido) y que
 * hoy les toca contacto. Registra el intento en leads.json.
 *
 * Variables de entorno requeridas (configúralas como Secrets del repo en
 * GitHub → Settings → Secrets and variables → Actions):
 *   GMAIL_USER            correo de Gmail que envía (ej. hey@wirdolab.com si usas Gmail/Workspace)
 *   GMAIL_APP_PASSWORD    contraseña de aplicación de Gmail (NO tu contraseña normal)
 *   OUTREACH_MI_NOMBRE    tu nombre, para firmar
 *   OUTREACH_CALENDLY     tu link de Calendly
 *   PHYSICAL_ADDRESS      dirección física real (obligatoria por ley CAN-SPAM)
 *   MAX_EMAILS_PER_DAY    tope diario, por defecto 25 (cuida la reputación de tu Gmail)
 *
 * Importante: Gmail normal (no Workspace) tiene un límite de ~500 correos/día y
 * penaliza patrones de envío masivo repetitivo. Empieza con un tope bajo
 * (20-30/día) y ve subiendo solo si no ves quejas de spam ni caídas de entregabilidad.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { dueLeadsForChannel, fillTemplate, templateVars, tplFor, todayStr } = require('./lib-funnel');

const LEADS_PATH = path.join(__dirname, '..', 'leads.json');
const TEMPLATES_PATH = path.join(__dirname, '..', 'dashboard', 'templates.json');
const MAX_PER_DAY = parseInt(process.env.MAX_EMAILS_PER_DAY || '25', 10);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Falta la variable de entorno ${name}. Configúrala como Secret en GitHub Actions.`); process.exit(1); }
  return v;
}

function canSpamFooter() {
  const addr = process.env.PHYSICAL_ADDRESS || '[FALTA CONFIGURAR PHYSICAL_ADDRESS]';
  return `\n\n---\nEste correo es de prospección comercial de TheGrongWeb.\n${addr}\nPara no recibir más correos, responde con la palabra BAJA.`;
}

async function main() {
  const gmailUser = requireEnv('GMAIL_USER');
  const gmailPass = requireEnv('GMAIL_APP_PASSWORD');

  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf-8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'));

  const due = dueLeadsForChannel(leads, 'email').slice(0, MAX_PER_DAY);
  if (!due.length) { console.log('Sin correos pendientes hoy.'); return; }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });

  let sent = 0, failed = 0;
  for (const { lead, nextN } of due) {
    const tpl = tplFor(templates, 'email', nextN);
    if (!tpl) { console.warn(`Sin plantilla de correo para intento ${nextN}, se omite ${lead.name}`); continue; }
    const vars = templateVars(lead);
    const subject = fillTemplate(tpl.subject, vars);
    const body = fillTemplate(tpl.body, vars) + canSpamFooter();

    try {
      await transporter.sendMail({
        from: `"TheGrongWeb" <${gmailUser}>`,
        to: lead.email,
        subject,
        text: body,
        headers: { 'List-Unsubscribe': `<mailto:${gmailUser}?subject=BAJA>` }
      });
      lead.attempts = lead.attempts || [];
      lead.attempts.push({ n: nextN, channel: 'email', date: todayStr(), template_id: tpl.id, auto: true });
      if (lead.status === 'no_contactado') lead.status = 'contactado';
      lead.updated_at = todayStr();
      sent++;
      console.log(`Enviado intento ${nextN} a ${lead.name} <${lead.email}>`);
    } catch (e) {
      failed++;
      console.error(`Error enviando a ${lead.name} <${lead.email}>:`, e.message);
    }
    // pequeña pausa entre envíos para no verse como ráfaga automatizada
    await new Promise(r => setTimeout(r, 4000));
  }

  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2) + '\n');
  console.log(`\nListo. Enviados: ${sent} · Fallidos: ${failed} · Pendientes hoy (tope ${MAX_PER_DAY}): ${due.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
