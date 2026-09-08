# Sysefen · Publicar y mantener

## Cómo se publica hoy

El repositorio está conectado a **Netlify**: cada `git push` a `main` despliega solo.

    git add -A
    git commit -m "lo que sea"
    git push

En 1-2 minutos está en <https://peppy-sopapillas-6a412c.netlify.app>.

**En cada publicación hay que subir dos números**, o los móviles siguen viendo la
versión vieja:

- `APP_VERSION` en `index.html` (se ve al final de Ajustes).
- `CACHE` en `sw.js` (`ch-v7-7` → `ch-v7-8`…). Es lo que obliga al service
  worker a tirar el caché anterior.

Si alguien dice que no ve un cambio: que cierre la app instalada **del todo**
(no minimizada) y la vuelva a abrir.

## Instalar en los móviles del equipo

- **iPhone:** abrir el enlace **en Safari** (si llega por WhatsApp, "Abrir en
  Safari") → **Compartir** → **Añadir a pantalla de inicio**.
- **Android:** abrir en Chrome → **⋮** → **Instalar aplicación**.

## Base de datos (Supabase)

Los `.sql` de `sql/` son migraciones idempotentes: se pegan en
*Supabase → SQL Editor → Run*, en orden, y se pueden volver a ejecutar sin
romper nada.

| Archivo | Para qué |
|---|---|
| `etapa2_seguridad.sql` | RLS y funciones `es_admin()` / `es_jefe()` |
| `etapa4_obras_fichaje.sql` | quién puede fichar en qué obra |
| `etapa5_fichaje_libre.sql` | corrección de fichajes por jefe/admin |
| `etapa6_presencia_cerrada.sql` | vista de presencia diaria |
| `etapa7_empleados_planilla.sql` | alta/baja de empleados |
| `etapa8_redondeo_15.sql` | imputaciones en tramos de 15 min |
| `etapa9_importar_historico.sql` | **alta de fichajes con hora real (importación del histórico)** |
| `etapa10_pin_admin.sql` | **Administración cambia el PIN de otra persona sin saber el anterior** |
| `etapa11_nombre_completo_alta.sql` | **nombre completo y fecha de alta real en las planillas** |
| `etapa12_adjuntos.sql` | **las fotos de los partes se guardan (bucket privado + tabla)** |

`etapa9` hace falta para el botón *Ajustes → Importar CSV*. Sin ella la app se
niega a importar y no escribe nada, porque el servidor pisaría todas las horas
con la fecha de hoy.

## Cambiar el PIN de otra persona

Cada uno se cambia el suyo desde *Ajustes → Cambiar mi PIN*, pero eso pide el
PIN anterior. Para el caso de "se me ha olvidado", Administración tiene que
poder ponerlo de nuevo sin conocer el viejo, y eso necesita algo en el servidor.
Hay dos vías y la app las prueba en este orden:

1. **`sql/etapa10_pin_admin.sql`** — se pega en el SQL Editor y funciona al
   momento. Es la vía corta. Solo cambia PINes de gente que ya tiene acceso.
2. **La Edge Function `admin-usuarios`** (abajo) — además crea accesos nuevos.

Con cualquiera de las dos, *Empleados → una persona → PIN de acceso* pasa a
cambiar el PIN de verdad. Sin ninguna, la app enseña los pasos manuales.

## Función de servidor `admin-usuarios`

Permite además **crear el acceso de un empleado nuevo** desde la propia app
(y también cambia PINes, si prefieres una sola vía en vez del SQL de arriba).

La clave maestra (`service_role`) **nunca sale de Supabase**: la función la lee
de una variable de entorno que Supabase inyecta sola. No hay que copiarla ni
pegarla en ningún sitio, y no está dentro de la app.

### Desplegarla desde el panel (sin instalar nada)

1. Supabase → **Edge Functions** → **Deploy a new function** → *Via Editor*.
2. Nombre: **`admin-usuarios`** (exactamente así).
3. Pega el contenido de `supabase/functions/admin-usuarios/index.ts`.
4. **Deploy**.

### O con la CLI

    npx supabase login
    npx supabase link --project-ref <ref-del-proyecto>
    npx supabase functions deploy admin-usuarios

Para comprobar que va: en la app, *Empleados → una persona → PIN de acceso*.
Si sale el formulario y el PIN cambia, está desplegada; si sale "Hazlo desde el
panel", todavía no.

## Importar el registro de jornada anterior a la app

*Ajustes → Registro anterior a la app*.

1. **Plantilla CSV** descarga `plantilla-registro-jornada.csv` con la cabecera
   `empleado;fecha;entrada;salida` y las instrucciones comentadas con `#`.
2. Se rellena una fila **por tramo**: si ese día se paró a comer, son dos filas
   del mismo día. Los días no trabajados no se ponen — quedan como *Sin
   fichaje*, que es lo correcto para festivos, vacaciones o bajas.
3. **Importar CSV** enseña primero qué entraría, agrupado por persona, y qué
   filas se descartan y por qué (nombre desconocido, fecha futura, solapes,
   duplicados). No escribe nada hasta confirmar.

El índice único `(empleado_id, entrada)` de `etapa9` impide duplicar el
histórico si se importa dos veces el mismo archivo.
