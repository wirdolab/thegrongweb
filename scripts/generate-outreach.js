#!/usr/bin/env node
/**
 * generate-outreach.js
 *
 * Toma un CSV de negocios (salidos de Google Maps, sin sitio web) y:
 *   1. Genera para cada uno: link de demo (#d=...), link de WhatsApp y mailto de correo.
 *   2. Hace MERGE (no overwrite) hacia leads.json en la raíz del repo:
 *      - Si el lead ya existe (mismo id), actualiza sus datos de contacto y links,
 *        pero NUNCA pisa status/attempts/notes que ya hayas registrado en el dashboard.
 *      - Si es nuevo, lo agrega con status "no_contactado".
 *   3. Opcionalmente geocodifica (lat/lng) con Nominatim (OpenStreetMap, gratis)
 *      si el CSV no trae columnas lat/lon.
 *
 * Uso:
 *   node scripts/generate-outreach.js data/negocios.csv
 *   node scripts/generate-outreach.js data/negocios.csv --geocode
 *   node scripts/generate-outreach.js data/negocios.csv --out leads.json
 *
 * Variables opcionales de entorno (para rellenar {{mi_nombre}} y {{calendly_link}}
 * en los mensajes generados):
 *   OUTREACH_MI_NOMBRE="Ferdossi" OUTREACH_CALENDLY="https://calendly.com/..." \
 *     node scripts/generate-outreach.js data/negocios.csv
 *
 * CSV esperado (encabezados, orden libre):
 *   name,category,city,state,phone,email,rating,reviews,lat,lon
 *
 *   category debe ser uno de:
 *   rest, cafe, salud, belleza, barber, taller, hogar, prof, fit, tienda, vet, inmo, foto, edu
 *   (si no reconoce la categoría, usa "prof" y avisa por consola)
 *
 * IMPORTANTE — sobre el link de demo (#d=...):
 *   La función `encodeDemoConfig` de abajo es una implementación base64/JSON estándar,
 *   pensada para ser compatible con el decodificador `decCfg` de index.html. Antes de
 *   mandar campañas reales, genera UN link de prueba, ábrelo y confirma que el demo
 *   carga con los datos correctos. Si el sitio no lo reconoce, abre index.html, busca
 *   la función `encCfg` (o como se llame el encoder real) y pega su cuerpo exacto en
 *   el lugar marcado como "ENCODER REAL AQUÍ" más abajo — así garantizas 1:1 compatibilidad
 *   byte a byte con el decodificador del sitio.
 */

const fs = require('fs');
const path = require('path');

const SITE_BASE = 'https://wirdolab.github.io/thegrongweb/';
const LEADS_PATH = path.join(__dirname, '..', 'leads.json');
const TEMPLATES_PATH = path.join(__dirname, '..', 'dashboard', 'templates.json');

const VALID_CATEGORIES = new Set(['rest','cafe','salud','belleza','barber','taller','hogar','prof','fit','tienda','vet','inmo','foto','edu']);

// ---------------- CLI args ----------------
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const doGeocode = args.includes('--geocode');
const outPath = args.includes('--out') ? args[args.length - 1] : LEADS_PATH;

if (!csvPath) {
  console.error('Uso: node scripts/generate-outreach.js <archivo.csv> [--geocode] [--out leads.json]');
  process.exit(1);
}

// ---------------- CSV parser (RFC4180 mínimo, sin dependencias) ----------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(h => h.trim().toLowerCase());
  return rows.filter(r => r.length && r.some(x => x.trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] ?? '').trim());
    return obj;
  });
}

// ---------------- slug / id ----------------
function slugify(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function makeId(row) {
  return slugify(`${row.name}-${row.city}-${row.state || ''}`);
}

// ---------------- Demo config encoder ----------------
// Config que entiende genSiteHTML(o) / decCfg en index.html. Ajusta claves si tu
// index.html usa nombres distintos (revisa el objeto que arma el formulario antes
// de llamar a encCfg).
function buildDemoConfigObject(row) {
  return {
    ind: row.category,          // industria
    lang: 'es',
    style: 'min',                // min | dark | eleg | vib
    name: row.name,
    city: row.city,
    state: row.state || '',
    phone: row.phone || '',
    email: row.email || '',
    rating: row.rating || '',
    reviews: row.reviews || ''
    // Nota: fotos/logo NO viajan en el link (se suben client-side en el demo real).
  };
}

function base64url(str) {
  return Buffer.from(str, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeDemoConfig(o) {
  // ====== ENCODER REAL AQUÍ ======
  // Implementación de respaldo (JSON + base64url). Reemplázala por la función
  // encCfg exacta de index.html si necesitas compatibilidad 1:1 garantizada.
  return base64url(JSON.stringify(o));
  // ====== FIN ENCODER ======
}

function demoLink(row) {
  const cfg = buildDemoConfigObject(row);
  return `${SITE_BASE}#d=${encodeDemoConfig(cfg)}`;
}

// ---------------- Links de contacto ----------------
function loadTemplates() {
  try { return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8')); }
  catch { return { email: [], whatsapp: [] }; }
}

function fillTemplate(str, vars) {
  return str.replace(/{{\s*(\w+)\s*}}/g, (m, k) => (vars[k] ?? m));
}

function buildLinks(row, link, templates) {
  const vars = {
    nombre: row.name, ciudad: row.city, categoria: row.category, demo_link: link,
    mi_nombre: process.env.OUTREACH_MI_NOMBRE || '',
    calendly_link: process.env.OUTREACH_CALENDLY || ''
  };
  const emailTpl = templates.email?.find(t => t.intento === 1);
  const waTpl = templates.whatsapp?.find(t => t.intento === 1);

  const phoneDigits = (row.phone || '').replace(/[^\d]/g, '');
  const whatsapp_link = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waTpl ? fillTemplate(waTpl.body, vars) : `Hola, les comparto una demo: ${link}`)}`
    : '';

  const subject = emailTpl ? fillTemplate(emailTpl.subject, vars) : `Idea de página para ${row.name}`;
  const body = emailTpl ? fillTemplate(emailTpl.body, vars) : `Hola, les comparto una demo: ${link}`;
  const mailto_link = row.email
    ? `mailto:${row.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : '';

  return { whatsapp_link, mailto_link };
}

// ---------------- Geocoding (Nominatim, opcional) ----------------
async function geocode(row) {
  const q = encodeURIComponent(`${row.name}, ${row.city}, ${row.state || ''}, USA`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TheGrongWeb-outreach-script/1.0 (hey@wirdolab.com)' } });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) { console.warn(`  geocode falló para ${row.name}:`, e.message); }
  return { lat: null, lng: null };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- Main ----------------
async function main() {
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const templates = loadTemplates();

  let existing = [];
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, 'utf-8')); }
    catch { console.warn('leads.json existente no es JSON válido, se empezará vacío.'); }
  }
  const byId = new Map(existing.map(l => [l.id, l]));

  let added = 0, updated = 0, skippedInvalidCat = 0;

  for (const row of rows) {
    if (!row.name || !row.city) { console.warn('Fila sin name/city, se omite:', row); continue; }
    if (!VALID_CATEGORIES.has(row.category)) {
      console.warn(`Categoría desconocida "${row.category}" para "${row.name}" — usando "prof".`);
      row.category = 'prof';
      skippedInvalidCat++;
    }

    let lat = row.lat ? parseFloat(row.lat) : null;
    let lng = row.lon ? parseFloat(row.lon) : (row.lng ? parseFloat(row.lng) : null);
    if (doGeocode && (lat == null || lng == null)) {
      const g = await geocode(row);
      lat = g.lat; lng = g.lng;
      await sleep(1100); // política de uso justo de Nominatim: max 1 req/seg
    }

    const link = demoLink(row);
    const { whatsapp_link, mailto_link } = buildLinks(row, link, templates);
    const id = makeId(row);
    const today = new Date().toISOString().slice(0, 10);

    const base = {
      id, name: row.name, category: row.category, city: row.city, state: row.state || '',
      lat: lat ?? null, lng: lng ?? null,
      phone: row.phone || '', email: row.email || '',
      rating: row.rating ? parseFloat(row.rating) : null,
      reviews: row.reviews ? parseInt(row.reviews, 10) : null,
      demo_link: link, whatsapp_link, mailto_link,
      updated_at: today
    };

    if (byId.has(id)) {
      const prev = byId.get(id);
      byId.set(id, { ...prev, ...base, status: prev.status, attempts: prev.attempts, notes: prev.notes, created_at: prev.created_at });
      updated++;
    } else {
      byId.set(id, { ...base, status: 'no_contactado', attempts: [], opted_out: false, notes: '', created_at: today });
      added++;
    }
  }

  const merged = [...byId.values()].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');

  console.log(`\nListo → ${outPath}`);
  console.log(`  Nuevos: ${added} · Actualizados: ${updated} · Categorías corregidas a "prof": ${skippedInvalidCat}`);
  console.log(`  Total en leads.json: ${merged.length}`);
  if (!doGeocode) console.log('  Tip: usa --geocode si tu CSV no trae lat/lon y quieres verlos en el mapa.');
}

main().catch(e => { console.error(e); process.exit(1); });
