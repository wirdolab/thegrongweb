# VM gratuita para WhatsApp automático (Oracle Cloud Free Tier)

Esta guía levanta una VM que se queda prendida 24/7 gratis para siempre (no es
trial de 30 días — es el "Always Free tier" de Oracle) y ahí corre
`whatsapp-sender.js` con PM2, manteniendo la sesión de WhatsApp logueada.

## 0. Antes de empezar
- Consigue un **número de WhatsApp dedicado a esto** (no tu número personal).
  Un SIM prepago barato o un número virtual sirve. Es tu principal mitigación
  de riesgo — si Meta banea el número, no pierdes tu WhatsApp personal.
- Ten a la mano un **token de GitHub** fine-grained con permiso `Contents:
  Read and write` sobre el repo `thegrongweb` (el mismo tipo que usa el
  dashboard).

## 1. Crear la cuenta y la VM
1. Crea cuenta en https://www.oracle.com/cloud/free/ (pide tarjeta para
   verificar identidad, pero el Always Free tier no cobra si no te sales de
   sus límites gratuitos).
2. En el panel: **Compute → Instances → Create instance**.
3. Shape: elige **VM.Standard.A1.Flex** (ARM, Always Free) con 1 OCPU / 6GB RAM
   — de sobra para esto.
4. Imagen: **Ubuntu 22.04**.
5. Genera y descarga el par de llaves SSH (o sube tu llave pública si ya
   tienes una).
6. Crea la instancia. Anota la IP pública.

## 2. Conectarte y preparar el servidor
```bash
ssh -i tu-llave.pem ubuntu@IP_DE_TU_VM

sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Dependencias del sistema que necesita Chromium (lo usa whatsapp-web.js)
sudo apt install -y chromium-browser libnss3 libatk-bridge2.0-0 libgtk-3-0 \
  libgbm-dev libasound2

sudo npm install -g pm2
```

## 3. Clonar el repo y configurar
```bash
git clone https://github.com/wirdolab/thegrongweb.git
cd thegrongweb

# Guarda tu token para que git pueda hacer push sin pedir contraseña cada vez
git remote set-url origin https://TU_USUARIO:TU_TOKEN@github.com/wirdolab/thegrongweb.git

cd vm
npm install
cp .env.example .env
nano .env   # llena REPO_PATH (la ruta real, ej. /home/ubuntu/thegrongweb), GITHUB_TOKEN, etc.
```

## 4. Primera corrida y escaneo de QR
```bash
pm2 start ecosystem.config.js
pm2 logs whatsapp-sender
```
Vas a ver un código QR dibujado con texto en la terminal. Abre WhatsApp en el
**número dedicado** → Ajustes → Dispositivos vinculados → Vincular un
dispositivo → escanea. Una vez vinculado, la sesión queda guardada en
`vm/wa-session/` y sobrevive reinicios de la VM (no vuelves a escanear salvo
que cierres sesión manualmente desde el teléfono).

```bash
pm2 save                  # para que sobreviva si la VM se reinicia
pm2 startup                # sigue las instrucciones que imprime, una sola vez
```

## 5. Verificar que corre solo
El proceso queda escuchando y dispara la corrida diaria automáticamente a la
hora que pusiste en `RUN_HOUR_LOCAL`. Para forzar una corrida de prueba ahora
mismo sin esperar:
```bash
cd ~/thegrongweb/vm
RUN_ON_START=1 pm2 restart whatsapp-sender
pm2 logs whatsapp-sender
```

## 6. Mantenimiento
- `pm2 status` — ver si sigue vivo.
- `pm2 logs whatsapp-sender --lines 100` — ver actividad reciente.
- `pm2 restart whatsapp-sender` — reiniciar si algo se traba.
- Si WhatsApp se desconecta solo (Meta cierra sesiones raras veces), vas a
  necesitar volver a escanear el QR — revisa los logs de vez en cuando.

## Recordatorio de riesgo
Esto sigue violando los términos de servicio de WhatsApp. Empieza con pocos
mensajes por día (`MAX_WHATSAPP_PER_DAY=15-20`), variedad en el texto, y
acepta que el número dedicado puede terminar baneado — por eso no debe ser tu
WhatsApp personal.
