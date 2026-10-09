# Tarea · Fotovoltaica: montaje agrupado por cubierta, arranque por kWp y carga de precios

Contexto: motor de presupuestos Sysefen (Supabase + Edge Function `presupuestar` 1.3).
Lee antes `MOTOR-PRESUPUESTOS.md` (sección 0b), `herramientas/reglas-fotovoltaica.py`
y el SQL que genera (`subir-a-supabase/etapa72_fotovoltaica_capitulos.sql`).

Reglas de la casa que no se negocian:
- Las reglas son datos. **No se edita el SQL a mano**: se cambia el generador
  (`reglas-fotovoltaica.py`) o el CSV (`fotovoltaica-partidas-2026.csv`, en
  `SYSEFEN DATA/07-Tarifas para app` o `SYSEFEN_TARIFAS`) y se regenera.
- No se inventa ningún precio. Lo que no está confirmado va a 0 € o con
  «POR CONFIRMAR» en `notas`.
- Los precios del CSV de partidas son **coste sin IVA**; el motor aplica
  `recargo_sobre_coste` 1,30 y `costes_complementarios_pct` 10 % al material.
  Los trámites (FV-13-…) llevan `sin_recargo` y van como precio de venta.
- Nada de tocar `motor.js`, `formulas.js` ni `cadena.js` salvo que una tarea lo
  pida explícitamente. Todo esto se resuelve con datos.

---

## 1 · Arranque por kWp

**Variable `n_paneles`** (`variables_derivadas`, categoría `solar`): añadir el
camino `kwp_objetivo` entre el manual y el consumo.

```
si(max(modulos_estimados, paneles_manual) > 0, max(modulos_estimados, paneles_manual),
  si(kwp_objetivo > 0, techo(kwp_objetivo * 1000 / wp_panel),
    si(consumo_anual_kwh > 0,
       techo(consumo_anual_kwh * lookup('cobertura_objetivo','defecto') / lookup('produccion_especifica','defecto') * 1000 / wp_panel),
       0)))
```

`descripcion`: «Los de la ficha o a mano; si no, los kWp pedidos; si no, el consumo anual.»

Comprobación: `kwp_objetivo = 5`, `wp_panel = 540` → `n_paneles = 10`, `kwp = 5.40`.

## 2 · Estructura agrupada por tipo de cubierta

Patrón idéntico a `ESTR_TEJA` (bloque 5b del SQL): partida `agrupada = true`,
regla `cantidad` → `partida_id` con `formula_cantidad = n_paneles`. El cliente
ve una línea por panel; el desglose queda en `origen_inputs.desglose`.

### 2a · Partidas nuevas

| codigo | nombre | detalle_tecnico |
|---|---|---|
| `ESTR_CHAPA` | Estructura soporte para módulo fotovoltaico sobre cubierta de chapa / sándwich | Estructura coplanar de aluminio: perfil, uniones, soportes de chapa con sellado, presores centrales y laterales y tornillería inoxidable |
| `ESTR_PLANA` | Estructura inclinada para módulo fotovoltaico sobre cubierta plana | Estructura de aluminio con triángulos de inclinación, perfil, uniones, presores, lastre o anclaje químico según cálculo de viento, y tornillería inoxidable |

### 2b · Renglones (`partidas_items`)

**ESTR_CHAPA** (sistema: espárrago/soporte de chapa + raíl largo; ver §6 si cambia a MiniRail)

| orden | producto_ref | formula_cantidad | unidad |
|---|---|---|---|
| 1 | FV-02-001 | `m_rail` | m |
| 2 | FV-02-002 | `n_uniones` | ud |
| 3 | FV-02-004 | `n_paneles * lookup('soportes_chapa_por_panel','defecto')` | ud |
| 4 | FV-02-010 | `n_paneles * lookup('soportes_chapa_por_panel','defecto')` | ud |
| 5 | FV-02-011 | `techo(n_paneles * lookup('soportes_chapa_por_panel','defecto') / lookup('anclajes_por_cartucho','defecto'))` | ud |
| 6 | FV-02-005 | `2 * (n_paneles - n_filas)` | ud |
| 7 | FV-02-006 | `4 * n_filas` | ud |
| 8 | FV-02-013 | `n_filas + n_uniones` | ud |
| 9 | FV-02-014 | `techo(n_paneles / lookup('paneles_por_bolsa_clips','defecto'))` | bolsa |

**ESTR_PLANA** (panel vertical, triángulos n+1 por fila; lastre o anclaje según `plana_anclaje`)

| orden | producto_ref | formula_cantidad | unidad |
|---|---|---|---|
| 1 | FV-02-001 | `m_rail` | m |
| 2 | FV-02-002 | `n_uniones` | ud |
| 3 | FV-02-007 | `n_triangulos` | ud |
| 4 | FV-02-008 | `con_lastre * n_triangulos * lookup('lastres_por_triangulo','defecto')` | ud |
| 5 | FV-02-009 | `n_anclajes` | ud |
| 6 | FV-02-010 | `n_anclajes` | ud |
| 7 | FV-02-011 | `techo(n_anclajes / lookup('anclajes_por_cartucho','defecto'))` | ud |
| 8 | FV-02-005 | `2 * (n_paneles - n_filas)` | ud |
| 9 | FV-02-006 | `4 * n_filas` | ud |
| 10 | FV-02-013 | `n_filas + n_uniones` | ud |
| 11 | FV-02-014 | `techo(n_paneles / lookup('paneles_por_bolsa_clips','defecto'))` | bolsa |

Un renglón con cantidad 0 no sale (el motor ya lo hace). Un renglón a 0 € deja
la línea entera «sin confirmar»: es lo deseado.

### 2c · Reglas del capítulo 02

Sustituir las reglas sueltas de producto con condición `tipo_estructura` en
`chapa` / `plana` (hoy: FV-02-001, 002, 004, 005, 006, 007, 008, 009, 010, 011,
013, 014) por dos reglas de partida:

```
('cantidad', null, null, null, '{"tipo_estructura": "chapa"}', null, 'ESTR_CHAPA', 'n_paneles',
 '02 · Estructura y fijaciones', 189, 'Una por panel; dentro, perfil, soportes, sellado, presores y fijaciones por filas.'),
('cantidad', null, null, null, '{"tipo_estructura": "plana"}', null, 'ESTR_PLANA', 'n_paneles',
 '02 · Estructura y fijaciones', 189, 'Una por panel; dentro, triángulos, perfil, lastre o anclaje, presores y fijaciones por filas.'),
```

Se quedan como están: `ESTR_TEJA`, FV-02-012 (tejas de reposición), FV-02-015
(estructura especial) y los dos avisos (especial, lastre).

El bloque 7 del SQL ya desactiva (no borra) las reglas usadas por presupuestos
guardados; asegúrate de que el filtro de borrado/desactivación siga cubriendo
las reglas de producto FV-02-… que desaparecen.

## 3 · Enphase: fuera FV-06-004

El tramo de los microinversores al cuadro va con manguera AC normal; el Q Cable
ya se cuenta por micro en el catálogo del distribuidor.

- Eliminar la partida FV-06-004 del CSV y su regla.
- La regla de FV-06-003 («Manguera AC inversor → cuadro») pasa a tener dos
  variantes:
  - condición `{"marca_inversor": "fronius"}` → `techo(dist_ac * 1.10)`
  - condición `{"marca_inversor": "enphase"}` → `techo((dist_dc + dist_ac) * 1.10)`

## 4 · Precios a cargar en `fotovoltaica-partidas-2026.csv`

Coste sin IVA. Origen: hoja «Sysefen_precios_web_partidas_FV_2026-10-09.xlsx»
(tiendas web, 09/10/2026; **no** tarifa de proveedor habitual). Poner en `notas`
de cada una: «Precio web 09/10/2026 (fuente). Contrastar con proveedor habitual.»

| Código | Coste | Fuente | Nota |
|---|---:|---|---|
| FV-02-011 | 5,95 | Obramat | Sikaflex 11FC 300 ml, por cartucho |
| FV-02-012 | 0,91 | Obramat | teja hormigón mixta; debe coincidir con la existente |
| FV-02-014 | 8,16 | Amazon (orientativo) | bolsa 60 clips → mantiene `paneles_por_bolsa_clips = 20` |
| FV-03-008 | 29,54 | Amazon (orientativo) | marquesina policarbonato 100×75 |
| FV-05-006 | 0,53 | TDTprofesional | Cat6 exterior cobre, por metro |
| FV-06-008 | 1,04 | Obramat | canaleta PVC 25×40, por metro |
| FV-06-009 | 0,66 | Obramat | tubo doble capa **Ø63**, por metro (no Ø90) |
| FV-07-002 | 7,56 | Obramat + Autosolar | fusible gPV 16 A + portafusibles, conjunto |
| FV-07-012 | 8,95 | Amazon (orientativo) | kit etiquetas; hacer kit propio impreso |
| FV-14-002 | 70,21 | Solarmat (orientativo) | Shelly EM + contactor, todo/nada |

Cambios de nombre:
- FV-14-001 → «Cargador de vehículo eléctrico (equipo Wallbox Pulsar Plus 7,4 kW)»,
  coste 712,86, nota «solo equipo; instalación y protecciones aparte, POR DECIDIR».
- FV-07-011 → sigue a 0 (parcial: pica 7,36 sin grapa ni arqueta). Nota: «pica 7,36
  + grapa + arqueta POR CONFIRMAR (≈20–25 €)».

**Servicios internos, siguen a 0** hasta que Sysefen fije el número: FV-11-003
(puesta en marcha), FV-12-001 (portes), FV-13-001 (memoria técnica), FV-13-007,
FV-13-008. Dejar la nota «precio interno POR FIJAR».

**NO cargar** (choque de unidad o de sistema, ver §6): FV-02-004, FV-02-007,
FV-02-008, FV-02-009.

## 5 · Coeficientes (`tablas_lookup`, categoría `solar`)

- `lastres_por_triangulo`: pasar de 1 a **3**, nota «ORIENTATIVO (40–80 kg por
  triángulo a 30º): manda el cálculo de viento del fabricante. POR CONFIRMAR.»
- Nuevo `anclajes_por_cartucho_resina` = 10, nota «anclajes que rinde un cartucho
  de resina de 300 ml. POR CONFIRMAR.» (distinto del sellador, que ya tiene
  `anclajes_por_cartucho`).

El bloque 4 del SQL no pisa valores ya existentes (`on conflict … do update set
notas`): para `lastres_por_triangulo` hace falta un `update` explícito como el
que ya existe para `recargo_sobre_coste`.

## 6 · Decisiones pendientes (no implementar; dejar documentadas)

Están en el Excel y las fija Sysefen. Añadir un apartado «Pendiente de decisión»
al final de `MOTOR-PRESUPUESTOS.md` 0b con esto:

1. **Chapa**: ¿espárrago/soporte trapezoidal + raíl largo (modelo actual) o
   MiniRail (sin raíl, 4 minirraíles + 4 grapas por panel)? Si es MiniRail,
   `ESTR_CHAPA` pierde FV-02-001/002 y cambian las grapas.
2. **Plana**: orientación del panel (vertical = modelo actual, n+1 triángulos
   por fila con ancho 1,134 m; horizontal = largo 1,762 m y otro reparto).
   Referencia vertical: Sunfer 09V1, ≈71 € coste.
3. **Lastre**: bloque de hormigón 40×20×20 del almacén local (precio pendiente)
   y nº por triángulo según viento. Solarbloc NO vale: es estructura + lastre.
4. **FV-02-009** por anclaje: varilla inox M10 3,90 + resina 7,06/10 + malla
   (pendiente) ≈ 5,6 €/ud. Cargar cuando se confirme la malla.
5. **FV-14-001** instalación del cargador: cerrado o MO + protecciones.
6. **FV-14-002** derivador: todo/nada (Shelly) o proporcional (AC·THOR).

## 7 · Regenerar y probar

1. `python herramientas/reglas-fotovoltaica.py` → nuevo
   `etapa72_fotovoltaica_capitulos.sql` y `fotovoltaica-reglas.json`.
2. Ejecutar el SQL en Supabase (idempotente).
3. `pruebas/motor-solar.js`: añadir el caso **«10 × JA 540, trifásico, sin
   batería»** en las tres cubiertas, con `guardar: false`:

```json
{ "categoria": "solar", "guardar": false,
  "datos": { "kwp_objetivo": 5, "wp_manual": 540, "suministro": "trifasico",
             "inversor_marca": "fronius", "baterias": "no",
             "tipo_cubierta": "<teja | chapa_sandwich | plana_transitable>",
             "distancia_cubierta_inversor_m": 15, "distancia_inversor_cuadro_m": 5,
             "distancia_cuadro_contador_m": 3, "recorrido_cableado": "fachada",
             "medio_elevacion": "escalera", "plantas": 1,
             "estado_cuadro": "bien", "toma_tierra": "existe",
             "wifi_inversor": "buena", "excedentes": "sin_excedentes" } }
```

Valores esperados (comprobar, no forzar):
- `variables`: `n_paneles 10`, `kwp 5.40`, `kw_inversor 4.5`, `n_filas 1`,
  `l_filas 11.89`, `n_barras 5`, `m_rail 24`, `n_uniones 3`, `n_ganchos 26`,
  `n_triangulos 11`, `n_strings 1`, `dias_obra 2`.
- Inversor: `FV-FRONIUS-SYMO-GEN24-SC-5.0`; Smart Meter TS 65A-3.
- **Teja**: una línea `ESTR_TEJA` × 10, `confirmada = true` (clips ya con
  precio), `precio_coste ≈ 39,7 €/ud`, `precio_tarifa ≈ 51,7 €/ud`
  (±0,05 por redondeo al céntimo por renglón). Desglose en `origen_inputs`.
- **Chapa**: una línea `ESTR_CHAPA` × 10, `confirmada = false` (FV-02-004 a 0),
  incidencia `precio_pendiente`.
- **Plana**: una línea `ESTR_PLANA` × 10, `confirmada = false` (FV-02-007/008
  a 0), con 11 triángulos y 33 lastres en el desglose; aviso de lastre.
- En ningún caso aparecen líneas sueltas FV-02-001…014 fuera de la partida.
- Con `inversor_marca: "enphase"`: no sale FV-06-004; FV-06-003 = `techo(20 × 1,10)` = 22 m.

4. Volver a pasar la suite existente: nada de aerotermia ni aire cambia.

## 8 · Documentación

- `MOTOR-PRESUPUESTOS.md`: nuevo apartado **0c (09-10-2026)** con lo de arriba
  (kWp de arranque, partidas agrupadas por cubierta, precios web cargados y de
  dónde, pendientes de decisión). Mover el modelo FV antiguo del §3 (panel 110 €,
  kit 5.445 €) a un anexo «Histórico» para que no se lea como vigente.
- Comentario de cabecera del SQL generado: actualizar contadores (partidas,
  coeficientes, reglas).

## Criterio de terminado

- SQL regenerado y ejecutado sin error; `select` de comprobación del final del
  SQL muestra las nuevas partidas y las reglas activas por capítulo.
- Los tres casos de prueba cumplen §7 y la suite anterior sigue verde.
- Ninguna fila de `productos` ha recibido un precio que no esté en §4.
- Las decisiones de §6 están escritas en el briefing, no resueltas por tu cuenta.
