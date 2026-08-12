/**
 * lib-funnel.js — lógica compartida del funnel de seguimiento (máx. 3 intentos).
 * La usan tanto scripts/send-daily-outreach.js (correo, GitHub Actions) como
 * vm/whatsapp-sender.js (WhatsApp, tu VM). Cada lead se procesa SIEMPRE por el
 * mismo canal (preferred_channel) para que los dos procesos nunca compitan por
 * el mismo lead ni lo dupliquen.
 */

const DUE_DAYS = { 2: 3, 3: 7 }; // intento -> días desde el intento anterior

function preferredChannel(lead) {
  if (lead.phone && lead.phone.replace(/[^\d]/g, '').length >= 8) return 'whatsapp';
  if (lead.email) return 'email';
  return null;
}

function daysSince(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - d) / 86400000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Devuelve los leads que hoy tienen un intento vencido para el canal indicado.
 * Cada item: { lead, nextN } donde nextN es 1, 2 o 3.
 */
function dueLeadsForChannel(leads, channel) {
  const out = [];
  for (const lead of leads) {
    if (lead.opted_out) continue;
    if (['respondio', 'agendo'].includes(lead.status)) continue;
    if (preferredChannel(lead) !== channel) continue;

    const attempts = lead.attempts || [];
    if (attempts.length >= 3) continue;

    if (attempts.length === 0) {
      out.push({ lead, nextN: 1 });
      continue;
    }
    const last = attempts[attempts.length - 1];
    const nextN = attempts.length + 1;
    const due = DUE_DAYS[nextN];
    if (daysSince(last.date) >= due) out.push({ lead, nextN });
  }
  return out;
}

function fillTemplate(str, vars) {
  return str.replace(/{{\s*(\w+)\s*}}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function templateVars(lead, extra = {}) {
  return {
    nombre: lead.name || '',
    ciudad: lead.city || '',
    categoria: lead.category || '',
    demo_link: lead.demo_link || '',
    mi_nombre: process.env.OUTREACH_MI_NOMBRE || '',
    calendly_link: process.env.OUTREACH_CALENDLY || '',
    ...extra
  };
}

function tplFor(templates, channel, intento) {
  const list = (templates && templates[channel]) || [];
  return list.find(t => t.intento === intento) || list[0];
}

module.exports = { DUE_DAYS, preferredChannel, daysSince, todayStr, dueLeadsForChannel, fillTemplate, templateVars, tplFor };
