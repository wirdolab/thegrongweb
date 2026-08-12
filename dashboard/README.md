# Dashboard de prospección — TheGrongWeb

Panel estático (sin backend) para monitorear y operar la campaña de venta de páginas web.
Vive en `wirdolab.github.io/thegrongweb/dashboard/` y lee/escribe `leads.json` (raíz del
repo) y `dashboard/templates.json` como fuente de verdad.

## Qué incluye
- **Mapa** (Leaflet + OpenStreetMap, gratis): un punto por lead, coloreado por estatus.
- **Contadores**: totales, por estatus, por industria y por ciudad.
- **Leads**: tabla filtrable/buscable con links de un clic a demo, WhatsApp y correo.
- **Seguimiento**: funnel de máx. 3 intentos — intento 2 sugerido a los ~3 días del
  intento 1, intento 3 a los ~7 días del intento 2. Muestra el mensaje ya redactado.
- **Plantillas**: editor de los textos de correo/WhatsApp usados en los links.
- **Ajustes**: tus datos (nombre, Calendly) y la conexión opcional a GitHub para guardar.

## Cómo se guardan los cambios
El dashboard es 100% estático (GitHub Pages no puede ejecutar backend). Para que los
cambios que haces en el navegador (marcar contactado, registrar intento, editar
plantillas) persistan en el repo, hay dos caminos:

1. **Con token de GitHub (recomendado si vas a usarlo seguido)**: en *Ajustes* pegas
   un token *fine-grained* con permiso `Contents: Read and write` limitado al repo
   `thegrongweb`. El token se guarda solo en `localStorage` de tu navegador y se usa
   para llamar directo a `api.github.com` — nunca queda escrito en el código ni se
   sube al repo. Si usas otra computadora o borras el localStorage, tienes que
   volver a pegarlo.
2. **Sin token (descarga manual)**: en *Ajustes* → "Descargar leads.json /
   templates.json" y subes el archivo tú mismo con un commit normal.

## Flujo diario sugerido
1. Corres `node scripts/generate-outreach.js tu_csv.csv` con el CSV del día
   (salido de Google Maps, negocios sin sitio) → agrega leads nuevos a `leads.json`
   sin pisar los que ya traías en seguimiento.
2. Subes ese `leads.json` actualizado (commit normal, o pídele el push a Claude).
3. Abres el dashboard → pestaña **Seguimiento** → ahí ves a quién le toca contactar
   hoy (nuevos + recontactos de intento 2/3) con el mensaje listo.
4. Haces clic en "Abrir WhatsApp/Correo y registrar" → se abre el mensaje y se
   registra el intento automáticamente (o lo guardas manualmente si no hay token).
5. Cuando alguien responde o agenda en Calendly, entras a su ficha y cambias el
   estatus a "Respondió" o "Agendó" — sale del funnel de recontacto.

## Notas técnicas
- No hay build ni dependencias — un solo `index.html` con Leaflet vía CDN.
- Los links `#d=` de demo los genera `scripts/generate-outreach.js` con la misma
  lógica de codificación (ver comentarios en ese archivo sobre cómo verificar/ajustar
  la compatibilidad exacta con el decodificador de `index.html`).
- Todo el motor de envío sigue siendo semi-automático: tú das clic en enviar. Un
  cron 24/7 (GitHub Actions) o herramientas de pago (Instantly/Outscraper) para
  hands-off real quedan como siguiente fase, después de validar respuestas.
