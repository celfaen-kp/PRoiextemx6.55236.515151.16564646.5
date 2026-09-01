# Sysefen · Publicar la app — 15 minutos

## 1. Descarga la carpeta `app/`
Contiene: `index.html`, `manifest.webmanifest`, `sw.js`, los iconos (`icon-*.png`) y los logos (`logo-trans.png`, `logo-blanco.png`).
**No cambies los nombres ni la estructura.**

## 2. Súbela a internet (elige una)

### Opción A — Netlify Drop (la más rápida, gratis)
1. Entra en **app.netlify.com/drop**
2. Arrastra la carpeta `app` a la ventana.
3. En 20 segundos te da una dirección tipo `https://algo-random.netlify.app`.
4. En *Site configuration → Change site name* ponle algo tuyo: `sysefen-partes` → `https://sysefen-partes.netlify.app`.

Para actualizar la app más adelante: vuelves a arrastrar la carpeta.

### Opción B — GitHub Pages (gratis, si ya usas GitHub)
1. Crea un repositorio nuevo, sube los archivos de `app/` en la raíz.
2. *Settings → Pages → Source: Deploy from a branch → main / (root)*.
3. Queda en `https://tuusuario.github.io/turepo/`.

### Opción C — tu propio dominio
Sube los 6 archivos por FTP a una carpeta del hosting. **Requisito: tiene que ir por HTTPS**, si no, no funciona el modo offline ni la instalación.

## 3. Instalar en los móviles del equipo
Manda el enlace por WhatsApp a Bayron, Jaime, David y Ale.

- **iPhone:** abrir el enlace **en Safari** (no en el navegador de dentro de WhatsApp: dale a "Abrir en Safari") → botón **Compartir** → **Añadir a pantalla de inicio**.
- **Android:** abrir en Chrome → menú **⋮** → **Instalar aplicación**.

Queda un icono como cualquier otra app, a pantalla completa, y funciona sin cobertura.

## 4. Primer arranque (hazlo tú, 5 minutos)
1. Entra como **Administración**, PIN `9999`.
2. En **Ajustes** comprueba el nombre (Sysefen), pon el CIF y el email de copia de la gestoría. El logo ya va puesto y sale en el PDF de cada parte.
3. Cambia los 5 PIN (botón **PIN** en cada empleado). Dilos en persona.
4. Ve a **Obras → + Nueva** y da de alta las obras en curso, con el email del cliente.
5. Marca una como obra de hoy (**Fichar aquí**) para que el equipo pueda fichar.

PIN de fábrica: Bayron `1111` · Jaime `2222` · David `3333` · Ale `4444` · Administración `9999`.

## Cómo se manda el informe al cliente
En el paso 3 del parte, **Firmar y enviar informe** abre el correo del móvil con todo el parte escrito y el cliente en el destinatario. Para adjuntar el PDF: botón **Ver / guardar PDF** → en la ventana de impresión elige *Guardar en Archivos / PDF* → vuelve al correo y adjúntalo.

Desde **Partes** puedes volver a sacar el PDF o reenviar cualquier parte antiguo.

## Lo que hay que saber de la v1.0
- **Cada móvil guarda sus propios datos.** El móvil de Bayron no ve los partes del de Jaime. Recomendación para esta semana: los partes se hacen desde un solo móvil (el del jefe de la obra), y cada operario ficha en el suyo.
- **Haz copia una vez a la semana.** Ajustes → *Descargar copia*. Guarda el archivo en Drive o en el correo. Es lo único que protege los datos si se pierde el móvil.
- **Registro de jornada:** la ley obliga a conservarlo 4 años y a poder mostrarlo a Inspección. Exporta el CSV cada mes (Ajustes → Exportar CSV) y guárdalo. Comenta con tu gestoría que el registro lo lleváis así.
- Las fotos se guardan reducidas para que quepan. Aun así, no metas 20 fotos por parte.

## v1.1 — sincronización entre móviles
Cuando quieras que todos vean lo mismo hace falta una base de datos en la nube. Abre una cuenta gratuita en **supabase.com**, pásame la URL del proyecto y la clave pública (*anon key*), y conecto la app: mismo diseño, mismos PIN, pero los datos compartidos, con envío automático del PDF por email y sin depender de un solo móvil.
