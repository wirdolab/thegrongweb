# TheGrongWeb — Handoff del proyecto

> Para retomar en cualquier chat de Claude Cowork: "Lee HANDOFF.md del repo wirdolab/thegrongweb y continúa donde quedamos."

## Qué es
Plataforma de venta de páginas web: landing bilingüe (ES/EN) con generador de demos en vivo. Marca: **TheGrongWeb** ("imagined by TheGrongProtocol", en footer). Dueño: ferdossi / wirdolab (hey@wirdolab.com). Precios: $149 Esencial / $499 Pro / $1,249 Premium (pago único). Estética: blanco ultra-minimal, Space Grotesk + IBM Plex Mono, acento índigo #3b2bff.

## Archivos (los 4 HTML son el sitio completo, sin build ni backend, costo $0)
- **index.html** — landing + generador de demos. Todo el motor JS vive aquí:
  - `IND` — 14 industrias (rest, cafe, salud, belleza, barber, taller, hogar, prof, fit, tienda, vet, inmo, foto, edu) con copy ES/EN: headline, servicios, stats, testimonio, CTA + fotos Unsplash (`ph`).
  - `SIG`/`SPH` — módulo firma por industria: menu (rest/cafe con fotos de platillos; belleza/barber/vet/edu solo precios), prods (tienda/inmo), steps (salud/taller/hogar/prof), sched (fit), port (foto).
  - `KW` — detector de keywords en la caja de descripción → chips en el demo.
  - `genSiteHTML(o)` — genera el sitio demo standalone (nav, hero ken-burns, ticker, servicios, módulo firma, stats, galería, testimonio, contacto con WhatsApp/tel reales, footer). 4 estilos: min / dark(futurista) / eleg / vib. Se renderiza en iframe srcdoc + "Abrir completo" via Blob URL.
  - Links compartibles: config codificada en `#d=base64` (encCfg/decCfg); al abrir el link se autogenera. Las imágenes subidas NO viajan en el link.
  - Subida de logo + hasta 4 fotos (FileReader + canvas re-escalado client-side; logo→nav, foto1→hero, resto→galería).
  - Captura de leads: email + datos del demo → Formspree.
- **formulario.html** — brief detallado post-compra (4 secciones) → Formspree. Los Stripe Payment Links deben redirigir aquí tras el pago.
- **privacidad.html** — LFPDPPP + derechos ARCO + transparencia de prospección.
- **terminos.html** — alcance por plan, reembolso 100% en 14 días, propiedad intelectual.

## Placeholders PENDIENTES (buscar en el código)
1. `https://calendly.com/TU-USUARIO/llamada-15-min` (Calendly real)
2. `PLACEHOLDER_ESENCIAL/_PRO/_PREMIUM` (Stripe Payment Links)
3. `TU_ID_FORMSPREE` (en index.html y formulario.html)
4. `[Tu calle y número...]` dirección física (CAN-SPAM), `[Tu nombre o razón social]`, `[FECHA DE PUBLICACIÓN]`

## Deploy
GitHub Pages de este repo: Settings → Pages → Deploy from branch → main → / (root). URL: wirdolab.github.io/thegrongweb. Verificar en el navegador que las fotos Unsplash cargan (IDs no verificados desde sandbox; hay fallback onerror).

## SIGUIENTE TAREA (pedida, no iniciada)
**Diferenciar el diseño del demo por industria** — hoy todas comparten el mismo layout base y "se ve igual para todos". Objetivo: que cada industria (o grupos) tenga estructura/layout distinto, no solo contenido: p.ej. restaurante con hero tipo carta y menú protagonista; inmobiliaria orientada a fichas; gym oscuro por defecto con horarios arriba; creativo portfolio-first con hero mínimo. Mantener: 4 estilos combinables, colores, uploads, links compartibles. **Requisito explícito del usuario: verificar que cada opción elegida realmente se refleja en el demo** — probar programáticamente (Node) todas las combinaciones industria × idioma × estilo × toggles y validar que el output cambia según lo elegido.

## Backlog
- 3 demos de ejemplo clicables en la landing (links #d= pregenerados)
- Meta tags OG + favicon
- Cloudflare Web Analytics (sin cookies)
- Sugerencia de plan ya existe; afinar reglas

## Contexto de negocio (resumen)
Blueprint completo vive local (outputs del chat original): pipeline de prospección diaria con Outscraper → generación → outreach con Instantly/Smartlead (dominios secundarios, warmup, CAN-SPAM: dirección física + baja 1 clic; multa $51,744/correo). Los links `#d=` sirven como previews personalizados para prospección manual Fase 1.
