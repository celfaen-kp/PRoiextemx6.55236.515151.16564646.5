# Tarea 4 · Fotovoltaica: margen distinto por familia y beneficio visible solo por dentro

Decisión Sysefen 09-10-2026:
- Panel: **coste 80 €, venta 115 €**.
- Equipos de catálogo (Fronius, Enphase, BYD, Tesla, Smart Meter, Gateway,
  Backup Switch, BCU, expansiones…): lo cargado es **coste**; venta = coste +20 %.
- Resto (estructura, cable, protecciones, pequeño material, mano de obra): sigue
  el 30 % actual.
- Cada presupuesto tiene que mostrar **por dentro** coste, venta y beneficio
  (por línea y total) para saber cuánto descuento cabe. **El cliente nunca lo ve.**

Hoy el motor aplica un único `recargo_sobre_coste` 1,30 a todo (+10 % CDC al
material). Para tener tres márgenes hace falta un cambio pequeño en motor y
datos. Es la única tarea que toca `motor.js`; el resto son datos.

---

## 1 · Datos: recargo por producto

Nueva columna `productos.recargo numeric null` (multiplicador sobre coste;
`null` = usa el lookup `recargo_sobre_coste` de la categoría). `sin_recargo`
sigue valiendo lo que vale (trámites a precio de venta).

Nueva columna `productos.aplica_cdc boolean not null default true`: si `false`,
no se suma `costes_complementarios_pct` aunque la familia sea material.

Valores a cargar (todos en la categoría `solar`):

| Producto(s) | coste | recargo | aplica_cdc | Venta resultante |
|---|---:|---:|---|---:|
| FV-01-002 JA 540 | **80,00** | **1,4375** | false | 115,00 |
| FV-01-001 genérico (510 W) | **80,00** | 1,4375 | false | 115,00 · nota «POR CONFIRMAR, mismo coste que el JA» |
| Todos los `FV-FRONIUS-*`, `FV-ENPHASE-*`, `FV-BYD-*`, `FV-TESLA-*` | sin cambio | **1,20** | false | coste × 1,20 |
| Resto de `FV-…` | sin cambio | null | true | coste × 1,10 × 1,30 (como ahora) |

Decidido así porque «+20 %» se entiende sobre el coste de la factura del
distribuidor, sin sumarle el 10 % de CDC (si no, el equipo saldría a +32 %). Si
Sysefen quiere el CDC también en equipos, basta poner `aplica_cdc = true`:
el motor no cambia.

Ejemplos: Symo GEN24 SC 5.0 → 1.256,49 × 1,20 = 1.507,79 ·
Powerwall 3 → 7.218,50 × 1,20 = 8.662,20 · BYD HVS 2,56 → 1.007,54 × 1,20 = 1.209,05.

Mantener los márgenes en `tablas_lookup` como documentación: añadir
`recargo_equipos = 1.20` y `recargo_paneles = 1.4375` (categoría `solar`), con
nota «informativo: el valor que manda es `productos.recargo`». Así el día que
cambien se sabe dónde se decidió.

## 2 · Motor (`motor.js`, función `precios()`)

Única modificación:

```
const recargo   = producto.sin_recargo ? 1 : (producto.recargo ?? lookup('recargo_sobre_coste'))
const cdc       = (producto.familia === 'material' && producto.aplica_cdc !== false) ? 1 + cdc_pct : 1
precio_coste    = alCentimo(coste_base * cdc)
precio_tarifa   = alCentimo(precio_coste * recargo)
```

Mismo orden que hoy (CDC sobre coste, recargo sobre el resultado). Las partidas
agrupadas ya suman `precio_coste` y `precio_tarifa` renglón a renglón, así que
heredan el margen de cada renglón sin cambios.

Añadir al resultado del motor, junto a `lineas` y `variables`:

```
resumen: {
  coste:         Σ precio_coste × cantidad,
  venta:         Σ precio_tarifa × cantidad,
  beneficio:     venta - coste,
  margen_pct:    beneficio / venta,        // sobre venta, que es como se descuenta
  descuento_max_pct_para_margen: { "20": …, "15": …, "10": … }
}
```

Y por línea, dos campos más: `beneficio_ud = precio_tarifa - precio_coste` y
`margen_pct`. Lo demás del motor, intacto. Versión → 1.4.

`descuento_max_pct_para_margen[m]` = `1 - coste / (venta × (1 - m))`: cuánto
descuento sobre la venta puede hacerse y seguir con un margen m. Si sale
negativo, 0.

## 3 · App y PDF

- Vista interna del presupuesto: columnas coste · venta · beneficio · margen por
  línea, y el bloque `resumen` arriba con los tres descuentos máximos.
- PDF del cliente y cualquier salida externa: **solo** `precio_tarifa`,
  cantidad e importe. Ni `precio_coste`, ni `beneficio`, ni `origen_inputs`, ni
  `resumen`. Comprobarlo con un test que busque esas claves en el HTML del PDF.
- Si la app ya aplica un descuento comercial, que lo aplique sobre `venta` y
  recalcule `beneficio` en la vista interna.

## 4 · Comprobación · 10 × JA 540, teja, Fronius trifásico, sin batería

- Paneles: 10 × 80 coste · 10 × 115 venta → beneficio 350 €.
- Inversor Symo 5.0: 1.256,49 → 1.507,79 → beneficio 251,30.
- Smart Meter TS 65A-3: 193,53 → 232,24.
- Estructura teja × 10: ≈ 39,7 → ≈ 51,7 /ud (sin cambio).
- `resumen.margen_pct` entre 0,20 y 0,30 (ponderado); `descuento_max` para
  mantener 15 % > 0.
- Test negativo: el HTML del PDF no contiene «coste», «beneficio» ni «margen».

## 5 · Documentación

MOTOR-PRESUPUESTOS.md 0c: tabla de márgenes por familia (panel 43,75 %, equipos
20 %, resto 30 % + 10 % CDC) y la regla de oro: «el beneficio existe en el JSON
y en la vista interna; jamás en el PDF».
