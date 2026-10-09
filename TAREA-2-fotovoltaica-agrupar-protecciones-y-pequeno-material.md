# Tarea 2 · Fotovoltaica: quitar líneas sueltas y agrupar cuadro/protecciones y pequeño material

Continúa `TAREA-fotovoltaica-montaje-y-precios.md`. Mismas reglas de la casa:
todo por el generador `reglas-fotovoltaica.py` y el CSV, nada en el SQL a mano,
ningún precio inventado, no tocar el motor.

Objetivo: menos líneas en el presupuesto del cliente. Cada grupo es UNA línea
cuyo coste es la suma de sus renglones, y los renglones siguen calculándose
según la instalación (metros, strings, MPPT, paneles), igual que ya hace
`ESTR_TEJA`.

---

## 1 · Líneas que dejan de salir

Desactivar la regla (no borrar la partida ni el producto):

| Código | Partida |
|---|---|
| FV-13-008 | Gestión con la distribuidora y compensación de excedentes |
| FV-13-004 | Permiso de obra / comunicación previa |
| FV-13-001 | Memoria técnica de diseño |
| FV-12-001 | Portes de material |
| FV-12-004 | Gestión de residuos |
| FV-10-004 | Línea de vida / anclajes provisionales |
| FV-07-012 | Kit de etiquetado → pasa a pequeño material (§3) |

En `notas` de cada regla desactivada: «Fuera del presupuesto por decisión
Sysefen 09-10-2026: se entiende incluido en legalización / mano de obra.»

⚠ Aviso para Sysefen, no para Code: al quitar memoria técnica, permiso y gestión
con distribuidora, ese trabajo no desaparece; queda cubierto por FV-13-003
«Legalización e Industria» (300 €) si ese precio lo incluye. Confirmar que sí.
Igual con portes y residuos dentro de la mano de obra.

«Pendiente de confirmar» no es una partida: es el estado de una línea cuyo
precio está a 0. Desaparece sola al cargar precios. Si la intención es que el
PDF del cliente no imprima ese texto aunque la línea esté sin confirmar, es un
cambio de la vista de impresión, no del motor: dejarlo anotado y no hacerlo aquí.

## 2 · Partida agrupada `CUADRO_PROT` · «Cuadro y protecciones»

`partidas`: `('solar', 'CUADRO_PROT', 'Cuadro de protecciones de la instalación fotovoltaica', true,
'Cuadro de protecciones AC con magnetotérmico, diferencial 30 mA y protector de sobretensiones; caja de protecciones DC IP65 con protectores de sobretensión por MPPT y fusibles de string cuando hay más de dos en paralelo')`

Renglones (`partidas_items`), con las fórmulas que hoy tienen las reglas sueltas:

| orden | producto_ref | formula_cantidad | unidad |
|---|---|---|---|
| 1 | FV-07-005 | `1` | ud |
| 2 | FV-07-006 | `1` | ud |
| 3 | FV-07-007 | `1` | ud |
| 4 | FV-07-008 | `1` | ud |
| 5 | FV-07-001 | `si(marca_inversor = 'fronius', 1, 0)` | ud |
| 6 | FV-07-004 | `si(marca_inversor = 'fronius', lookup('mppt','defecto'), 0)` | ud |
| 7 | FV-07-002 | `si(marca_inversor = 'fronius' y n_strings > 2, 2 * n_strings, 0)` | ud |

Regla: `('cantidad', null, null, null, '{}', null, 'CUADRO_PROT', 'si(n_paneles > 0, 1, 0)',
'07 · Protecciones, cuadros y puesta a tierra', 139, 'Una por instalación; dentro, AC siempre y DC solo con inversor de string, según MPPT y strings.')`

Desactivar las reglas sueltas de FV-07-001, 002, 004, 005, 006, 007, 008.
Se quedan sueltas FV-07-010 (adecuación del cuadro) y FV-07-011 (pica): son
condicionales y el cliente debe verlas.

Cómo escala: con Enphase no entra nada de DC; con Fronius, un SPD por MPPT y
fusibles si hay más de dos strings. El calibre del magneto y del diferencial sí
cambia con la potencia, pero el precio de catálogo es casi el mismo hasta 40 A:
una sola referencia es correcto por ahora. Si Sysefen quiere distinguir
monofásico / trifásico, se añade un segundo renglón con condición `fases`.

## 3 · Partida agrupada `PEQ_MAT` · «Pequeño material eléctrico»

`partidas`: `('solar', 'PEQ_MAT', 'Pequeño material eléctrico y canalización', true,
'Tubo rígido o corrugado, cajas de registro estancas, abrazaderas y grapas, prensaestopas y pasamuros, etiquetado y señalización reglamentaria, consumibles (bridas UV, terminales, punteras, cinta, regletas, silicona, tacos)')`

| orden | producto_ref | formula_cantidad | unidad |
|---|---|---|---|
| 1 | FV-06-007 | `m_tubo` | m |
| 2 | FV-06-010 | `si(dist_dc + dist_ac > 0, techo((dist_dc + dist_ac) / lookup('m_por_caja_registro','defecto')) + 1, 0)` | ud |
| 3 | FV-06-011 | `techo(m_tubo / 10)` | bolsa |
| 4 | FV-06-012 | `perforaciones + 2` | ud |
| 5 | FV-07-012 | `1` | ud |
| 6 | FV-08-001 | `1` | lote |

Regla: `('cantidad', null, null, null, '{}', null, 'PEQ_MAT', 'si(n_paneles > 0, 1, 0)',
'08 · Pequeño material y consumibles', 125, 'Una por instalación; dentro, tubo y cajas por metros de recorrido, prensas por pasos de muro, etiquetado y consumibles.')`

Desactivar las reglas sueltas de FV-06-007, 010, 011, 012, FV-07-012 y FV-08-001.

Se quedan sueltas en el capítulo 06: cable DC, MC4, manguera AC, cable
comunicación, tierra, bandeja y tubo enterrado (son metros que el cliente
entiende y que cambian mucho de una obra a otra).

Cómo escala: tubo y cajas van con los metros de recorrido; prensas con los pasos
de muro. Etiquetado y consumibles son fijos por instalación: si Sysefen prefiere
que el lote de consumibles crezca con los paneles, cambiar el renglón 6 a
`techo(n_paneles / 10)` y anotarlo como POR CONFIRMAR.

## 4 · Efecto en el presupuesto de 10 × JA 540 (teja, Fronius trifásico)

Antes: 11 líneas sueltas en 06/07/08 + 7 en 10/12/13.
Después, en esos capítulos:

- 06: cable DC 33 m · MC4 4 pares · manguera AC 6 m · comunicación 4 m · tierra 20 m
- 07: **Cuadro de protecciones** × 1 (dentro: cuadro AC, magneto, diferencial, SPD AC, caja DC, 2 SPD DC) · pica solo si no hay tierra
- 08: **Pequeño material eléctrico** × 1 (dentro: 22 m tubo, 3 cajas, 3 bolsas, 2 prensas, etiquetado, consumibles)
- 10: andamio / plataforma / elevador solo si aplica
- 12: nada
- 13: legalización 300 · subvención y certificado si se piden · proyecto solo >10 kWp

Con los precios actuales (sin cambiar ninguno):
- `CUADRO_PROT` coste ≈ 76,03 + 2×25,70 + 11,63 + 3,56 + 38,43 + 25,87 = 206,92
  → con CDC 10 % ≈ 227,6 → venta ≈ 295,9 €. `confirmada = true`.
- `PEQ_MAT` coste ≈ 22×0,26 + 3×2,52 + 3×10,66 + 2×0,62 + 8,95 + 13,88 ≈ 69,5
  → con CDC ≈ 76,4 → venta ≈ 99,3 €. `confirmada = true` si FV-07-012 ya tiene
  precio (tarea 1); si no, sale sin confirmar.

Añadir ambas comprobaciones al caso de prueba de la tarea 1 (valores ± redondeo
por renglón). Y comprobar que con `inversor_marca: "enphase"` el cuadro no lleva
ni caja DC ni SPD DC.

## 5 · Documentación

Apartado 0c de `MOTOR-PRESUPUESTOS.md`: añadir las dos agrupadas nuevas y la
lista de líneas desactivadas con la fecha. En el comentario de cabecera del PDF
(lo que imprime cada capítulo) ya no hace falta agrupar 06+07+08 en la vista:
07 y 08 ya son una línea cada uno.

## Criterio de terminado

- Regenerado, ejecutado, suite verde.
- El caso de 10 paneles no muestra ninguna línea de los siete códigos de §1 ni
  de los trece productos que ahora van dentro de `CUADRO_PROT` y `PEQ_MAT`.
- Ninguna de las dos agrupadas sale a 0 €.
