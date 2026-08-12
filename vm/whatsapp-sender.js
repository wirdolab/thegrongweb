#!/usr/bin/env node
/**
 * vm/whatsapp-sender.js
 *
 * Proceso PERSISTENTE (no un script de un solo uso) pensado para correr con PM2
 * en una VM que se queda prendida 24/7 (ver vm/README.md — guía de Oracle Cloud
 * Free Tier). Mantiene la sesión de WhatsApp Web logueada (se guarda en
 * vm/wa-session/) y, una vez al día, revisa leads.json del repo y manda
 * WhatsApp a los leads cuyo canal preferido es "whatsapp" (los que tienen
 * teléfono) y a quienes hoy les toca contacto según el funnel.
 *
 * ADVERTENCIA — léela de verdad:
 * whatsapp-web.js es una librería NO OFICIAL. Usarla para envíos automatizados
 * viola los términos de servicio de WhatsApp y META puede banear el número
 * permanentemente si detecta patrón de bot (mensajes idénticos a muchos
 * destinos, ritmo constante, cero respuestas humanas). Mitiga el riesgo:
 *   - Usa un número de WhatsApp dedicado a esto, NO tu número personal/principal.
 *   - Manda pocos mensajes por día (MAX_PER_RUN abajo, empieza en 15-20).
 *   - Deja pausas variables entre mensajes (ya incluido).
 *   - Personaliza el texto lo más posible (las plantillas ya usan variables).
 * Si te banean el número, no hay apelación garantizada — es un riesgo real,
 * no hipotético.
 *
 * Primer uso:
 *   1. En la VM: npm install (dentro de vm/)
 *   2. pm2 start ecosystem.config.js  (o: node whatsapp-sender.js)
 *   3. pm2 logs whatsapp-sender   → vas a ver un código QR en texto
 *   4. Abre WhatsApp en el teléfono dedicado → Dispositivos vinculados → escanea
 *   5. Listo, la sesión queda guardada en wa-session/ y sobrevive reinicios.
 *
 * Variables de entorno (crea vm/.env, ver vm/.env.example):
 *   REPO_PATH             ruta absoluta al repo clonado en la VM
 *   GITHUB_TOKEN           PAT con permiso Contents:Read/write, para hacer push
 *   RUN_HOUR_LOCAL         hora del día (0-23) en que corre el envío diario, ej. 15
 *   MAX_WHATSAPP_PER_DAY   tope diario, por defecto 20
 *   OUTREACH_MI_NOMBRE, OUTREACH_CALENDLY  igual que en el resto del proyecto
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { execSync } = require('child_process');

const REPO_PATH = process.env.REPO_PATH || path.join(__dirname, '..');
const LEADS_PATH = path.join(REPO_PATH, 'leads.json');
const TEMPLATES_PATH = path.join(REPO_PATH, 'dashboard', 'templates.json');
const MAX_PER_DAY = parseInt(process.env.MAX_WHATSAPP_PER_DAY || '20', 10);
const RUN_HOUR = parseInt(process.env.RUN_HOUR_LOCAL || '15', 10);

const { dueLeadsForChannel, fillTemplate, templateVars, tplFor, todayStr } = require(path.join(REPO_PATH, 'scripts', 'lib-funnel.js'));

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'wa-session') }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  console.log('Escanea este QR desde WhatsApp del número dedicado (Dispositivos vinculados):');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('Sesión de WhatsApp autenticada y guardada.'));
client.on('auth_failure', msg => console.error('Falló la autenticación:', msg));
client.on('disconnected', reason => console.error('WhatsApp se desconectó:', reason, '— reinicia el proceso (pm2 restart).'));

client.on('ready', () => {
  console.log('WhatsApp listo. Programado para correr diario a las', RUN_HOUR + ':00 hora local.');
  cron.schedule(`0 ${RUN_HOUR} * * *`, () => runDaily().catch(e => console.error('Error en corrida diaria:', e)));

  // permite forzar una corrida inmediata al arrancar con RUN_ON_START=1
  if (process.env.RUN_ON_START === '1') runDaily().catch(e => console.error(e));
});

function gitPull() {
  execSync('git pull --rebase --autostash', { cwd: REPO_PATH, stdio: 'inherit' });
}
function gitCommitPush() {
  execSync('git config user.name "thegrongweb-bot"', { cwd: REPO_PATH });
  execSync('git config user.email "actions@users.noreply.github.com"', { cwd: REPO_PATH });
  try {
    execSync('git diff --quiet -- leads.json', { cwd: REPO_PATH });
    console.log('Sin cambios en leads.json, no hay nada que subir.');
    return;
  } catch { /* hay cambios, seguimos */ }
  execSync('git add leads.json', { cwd: REPO_PATH });
  execSync(`git commit -m "outreach: WhatsApp automático del ${todayStr()}"`, { cwd: REPO_PATH });
  execSync('git push', { cwd: REPO_PATH });
}

async function runDaily() {
  console.log(`\n[${new Date().toISOString()}] Iniciando corrida diaria de WhatsApp...`);
  gitPull();

  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf-8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'));
  const due = dueLeadsForChannel(leads, 'whatsapp').slice(0, MAX_PER_DAY);

  if (!due.length) { console.log('Sin WhatsApp pendientes hoy.'); return; }

  let sent = 0, failed = 0;
  for (const { lead, nextN } of due) {
    const tpl = tplFor(templates, 'whatsapp', nextN);
    if (!tpl) { console.warn(`Sin plantilla de WhatsApp para intento ${nextN}, se omite ${lead.name}`); continue; }
    const text = fillTemplate(tpl.body, templateVars(lead));
    const phoneDigits = lead.phone.replace(/[^\d]/g, '');
    const chatId = `${phoneDigits}@c.us`;

    try {
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) { console.warn(`${lead.name}: número no tiene WhatsApp, se omite.`); continue; }
      await client.sendMessage(chatId, text);
      lead.attempts = lead.attempts || [];
      lead.attempts.push({ n: nextN, channel: 'whatsapp', date: todayStr(), template_id: tpl.id, auto: true });
      if (lead.status === 'no_contactado') lead.status = 'contactado';
      lead.updated_at = todayStr();
      sent++;
      console.log(`Enviado WhatsApp intento ${nextN} a ${lead.name}`);
    } catch (e) {
      failed++;
      console.error(`Error enviando WhatsApp a ${lead.name}:`, e.message);
    }
    // pausa variable (15-40s) entre mensajes — reduce (no elimina) el riesgo de detección
    await new Promise(r => setTimeout(r, 15000 + Math.random() * 25000));
  }

  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2) + '\n');
  gitCommitPush();
  console.log(`Corrida terminada. Enviados: ${sent} · Fallidos: ${failed} · Pendientes hoy (tope ${MAX_PER_DAY}): ${due.length}`);
}

client.initialize();
