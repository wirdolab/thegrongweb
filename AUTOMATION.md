# Automatización diaria — TheGrongWeb

Dos motores independientes, cada lead se lo lleva SOLO uno de los dos (según
tenga teléfono o no — ver `scripts/lib-funnel.js` → `preferredChannel`), así
que nunca compiten por el mismo lead ni lo duplican.

| Motor | Dónde corre | Qué hace | Sesión persistente necesaria |
|---|---|---|---|
| Correo | GitHub Actions (gratis, cron) | Envía intento 1/2/3 por Gmail SMTP a leads sin teléfono | No — corre en máquina efímera |
| WhatsApp | Tu VM (Oracle Cloud Free Tier) | Envía intento 1/2/3 por WhatsApp a leads con teléfono | Sí — sesión de WhatsApp Web logueada |

No incluye scraping automático de Google Maps — decidí no construir esa
pieza porque requeriría evadir la detección de bots de Google, algo que no
hago. Para leads nuevos en automático de verdad, la vía legítima es la
Places API de Google (de pago por llamada, con crédito gratis mensual) o un
servicio como Outscraper. Mientras tanto, sigues exportando el CSV de Maps
tú mismo y corriendo `node scripts/generate-outreach.js` — eso sí lo puedes
meter también en un cron de GitHub Actions si subes el CSV al repo.

## 1. Configurar el correo automático (GitHub Actions)

En GitHub → repo `thegrongweb` → **Settings → Secrets and variables →
Actions → New repository secret**, crea:

| Secret | Valor |
|---|---|
| `GMAIL_USER` | tu correo de Gmail que envía (ej. hey@wirdolab.com si usas Gmail/Workspace) |
| `GMAIL_APP_PASSWORD` | contraseña de aplicación — Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones. **No** tu contraseña normal. |
| `OUTREACH_MI_NOMBRE` | tu nombre, para firmar los correos |
| `OUTREACH_CALENDLY` | tu link de Calendly |
| `PHYSICAL_ADDRESS` | tu dirección física real — obligatoria por ley (CAN-SPAM) en todo correo comercial |
| `MAX_EMAILS_PER_DAY` | opcional, por defecto 25. Empieza bajo (20-30) para cuidar la reputación del Gmail. |

El workflow `.github/workflows/daily-outreach.yml` corre solo todos los días
a las 14:00 UTC (~9am hora de Texas). También lo puedes disparar a mano desde
la pestaña **Actions** del repo → "Daily outreach" → "Run workflow".

Cada corrida: revisa bajas (respuestas con la palabra BAJA), manda los
correos que tocan hoy, y sube el `leads.json` actualizado con un commit
automático.

## 2. Configurar WhatsApp automático (tu VM)

Ver `vm/README.md` — paso a paso completo para levantar la VM gratuita en
Oracle Cloud, instalar todo, y escanear el QR una sola vez.

## 3. Riesgos que aceptaste (recordatorio)

- **Gmail** puede marcar tus correos como spam o suspender la cuenta si el
  patrón se ve a envío masivo. El tope diario y la pausa entre envíos
  ayudan, pero no lo eliminan. Vigila la carpeta de spam de algunas cuentas
  de prueba de vez en cuando.
- **WhatsApp** puede banear el número dedicado en cualquier momento — es una
  librería no oficial y Meta activamente detecta y bloquea este patrón. Por
  eso el número debe ser dedicado, no tu WhatsApp personal.
- **CAN-SPAM**: cada correo automático ya incluye tu dirección física y un
  mecanismo de baja (responder "BAJA"), que el script revisa y respeta
  automáticamente marcando `opted_out: true` en el lead.

## 4. Cómo parar todo si algo sale mal

- Correo: en GitHub → Actions → deshabilita el workflow, o borra/renombra
  `.github/workflows/daily-outreach.yml`.
- WhatsApp: en la VM, `pm2 stop whatsapp-sender`.
