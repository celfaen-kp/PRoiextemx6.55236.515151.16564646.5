# Legalizaciones fotovoltaicas — apartado apagado

**Estado (11-11-2026, V32.0):** el apartado está fuera de la app por decisión de Enzo
(«saquemos el apartado de legalizaciones por ahora»). No se ha borrado nada: el código,
la tabla, la función y la plantilla siguen en su sitio; solo se han escondido las entradas.

## Volver a encenderlo

En `index.html`, junto a `esComercial`:

```js
const LEGALIZACIONES = false;   // ← poner true
```

Subir la versión (`APP_VERSION` en `index.html` y `CACHE` en `sw.js`) y publicar. Con eso vuelven:

- la pestaña **Legaliz.** en la barra de abajo de presupuestos;
- la tarjeta **Legalizaciones fotovoltaicas** en Ajustes / Perfil (jefes y Administración);
- el bloque **Legalizaciones · datos fijos** en Ajustes (solo Administración);
- el botón **Legalización fotovoltaica** en la ficha de cada obra.

Al encenderlo hay que devolver al manual (`manual/index.html`) lo que se quitó; está al final de este archivo.

## Qué hace

Una legalización por obra. Se recogen los datos del Modelo 034 de la CAIB y, si se tienen, las
medidas del «Annex de proves de verificació» (RD 1699/2011 · UNE 50160). Al enviar, el móvil genera
dos PDF (el certificado oficial rellenado y una hoja con los datos del 034), se suben a Drive
(`08-Legalizaciones / <obra>`) y van por correo a quien legaliza en la oficina.

## Dónde está cada pieza

| Pieza | Sitio |
|---|---|
| Pantallas, formulario y PDF | `index.html`, bloque «LEGALIZACIÓN FOTOVOLTAICA (sql/etapa55)»: `LEGAL_SECCIONES`, `vLegalizaciones`, `vLegalizacion`, `A.leg*` |
| Hojas para elegir obra y cliente | `index.html`, hojas `legObra` y `legCliente` |
| Lectura y guardado | `visitas-db.js`: `listarLegalizaciones`, `guardarLegalizacion`, `borrarLegalizacion`, `enviarLegalizacion` |
| Plantilla oficial del certificado | `legalizacion/annex-verificacio-caib.pdf` |
| Tabla `legalizaciones` y datos fijos en `empresa` | `sql/etapa55_legalizaciones.sql` |
| Subida a Drive y correo | función `supabase/functions/legalizacion-enviar` (sigue desplegada) |
| Captura del manual | `manual/img/pres-legalizaciones.png` |

## Lo que queda por configurar antes de usarlo

Comprobado en la base el 11-11-2026:

- **Datos fijos del instalador: sin poner.** Razón social, nº de instalador autorizado, nombre,
  NIF, dirección, CP y localidad, teléfono y aparato verificador. Salen en cada certificado; se
  rellenan en Ajustes → «Legalizaciones · datos fijos» (Administración).
- **Correo de legalizaciones: puesto.** Conviene comprobar que sigue siendo el bueno.
- Hay **1 legalización en borrador** y ninguna enviada. Se conserva.
- Los campos del 034 están en `LEGAL_SECCIONES`: para añadir, quitar o renombrar uno basta tocar esa lista.
- El envío completo (Drive y correo) no se ha vuelto a probar desde que se apagó.

## Texto que se quitó del manual

Índice: `<a href="#pres-legalizaciones">Legalizaciones</a>`

Tabla de quién ve qué:
`Legalizaciones fotovoltaicas | Operarios: — | Jefes: Desde la obra | Presupuestos: Pestaña propia | Administración: Sí, y los datos fijos`

Ficha de la obra: botón «Legalización fotovoltaica» junto a «Nuevo parte» y «Editar».

Sección de presupuestos:

> **Legalizaciones fotovoltaicas · Modelo 034 y certificado.** Tu pestaña **Legaliz.** (los jefes la
> tienen en Perfil y en cada obra). Una legalización por obra: eliges la obra y el cliente (del CRM,
> de la lista o nuevo), rellenas los datos del Modelo 034 y, si las tienes, las medidas de la
> verificación. La app genera el **certificado oficial rellenado** y la **hoja de datos del 034**,
> los dos en PDF, los sube a Drive (08-Legalizaciones / la obra) y se los manda por correo a quien
> legaliza en la oficina. Se guarda sola mientras escribes; **Enviar** cuando esté completa. Los
> datos fijos del instalador los pone Administración en Ajustes.

Ajustes de Administración: «Legalizaciones · datos fijos (razón social, nº de instalador, aparato
verificador y el correo a donde van los PDF)».
