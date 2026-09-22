# Motor de presupuestos · briefing para continuar

Documento de traspaso. Todo lo que se decidió y se midió analizando 59
presupuestos cerrados de Sysefen y las tres tarifas de proveedor. Quien lea
esto empieza de cero: aquí está todo lo necesario para seguir sin volver a
analizar nada.

---

## 1 · Qué se quiere conseguir

Que una ficha de visita se convierta sola en un presupuesto con líneas,
precios y descuentos, y que ese presupuesto se empuje a Teamleader.

Hoy Ramón toma datos en casa del cliente, la ficha viaja al CRM y allí alguien
monta el presupuesto a mano. El objetivo es que el paso manual desaparezca.

**Esto cambia una decisión de la etapa 20**, donde se dejó escrito "La app NO
calcula precios. Guarda datos y los manda al CRM". Era correcto entonces.
Ahora sí calcula, porque el análisis demostró que el cálculo ya era
determinista. Teamleader sigue siendo el maestro de clientes y el sitio donde
vive el presupuesto final: lo que sale del motor se le empuja, no lo
sustituye.

---

## 2 · El hallazgo que lo hace posible

**Los presupuestos de Sysefen ya son deterministas.** Se reconstruyeron **57
de 59 al céntimo** con esta cadena:

```
suma de líneas a PVP de tarifa
  − descuentos de línea   (−15 % en material de marca)
  = subtotal
  − descuento global      (−10 % habitual, varía por presupuesto)
  = TOTAL sin IVA
```

Los dos que no cuadran tienen erratas en el PDF, no fallo de regla.

El −15 % de línea se aplica a: `bomba_calor`, `acumulador`,
`deposito_inercia`. El resto de líneas no lo lleva.

Y los precios unitarios **son el PVP de tarifa tal cual**, sin recargo:
`aroTHERM plus VWL 65/6` está a 9.385 € en el presupuesto y a 9.385 € en el
catálogo Vaillant 2025. El margen de Sysefen está en el descuento de
proveedor, no en un recargo sobre tarifa.

### Caso de prueba obligatorio

Presupuesto **2026/596** (aerotermia Vaillant 8 kW). Si el motor no reproduce
esto exactamente, está mal:

| | € |
|---|---:|
| Suma a PVP de tarifa | 21.560,00 |
| Descuentos de línea (−15 %) | −2.005,50 |
| Subtotal | 19.554,50 |
| Descuento global −10 % | −1.955,44 |
| **Total sin IVA** | **17.599,06** |

Sus líneas: aroTHERM plus VWL 85/6 (10.235) · UniSTOR VIH RW 200/2 (2.035) ·
depósito de inercia (1.100) · soportes de caucho (115) · grupo de bombeo (825)
· resistencia eléctrica (250) · A100 (2.100) · A101 (750) · A102 (2.250) ·
A103 (850) · RITE (450) · gestiones administrativas (600).

---

## 3 · Las reglas, por oficio

### Aerotermia — 20 presupuestos

```
Total = máquina (por kW, de tarifa)
      + acumulador ACS (si aplica)
      + KIT BASE (7.365 €)
      + grupo de bombeo × nº de circuitos
      + colector (si ≥ 2 circuitos)
      + extras condicionales
```

**Kit base — 7.365 €.** Sale *idéntico* en seis presupuestos distintos. No es
una mediana: es una partida que ya se aplica cerrada.

| Concepto | € |
|---|--:|
| A100 Material hidráulico | 2.100 |
| A102 Mano de obra | 2.250 |
| Depósito de inercia | 1.100 |
| A101 Material eléctrico | 750 |
| Gestiones administrativas | 600 |
| RITE / documentación | 450 |
| Soportes de caucho antivibración | 115 |

**La mano de obra es fija**, no escala con kW: 2.250 € tanto a 8 como a 15 kW.
Sube a 2.400 con conductos y a 2.800–3.100 en cascada o Midea. Lo que la mueve
es la complejidad, no la potencia.

**Circuitos.** Los emisores pueden ser varios (`emisores_previstos` ya es
`multi` en visitas-schemas.js). Cada temperatura distinta es un circuito:

- `A106 Grupo de bombeo sin mezcladora` × nº de circuitos · 825–895 €
- Colector: 2 grupos → 335 € · 3 grupos → 525 €
- Observado: ×1, ×2 y ×3 en presupuestos reales (los titulados "1 CIRCUITOS",
  "3 CIRCUITOS")

⚠ **Sin calibrar**: cuando hay temperaturas mixtas (suelo 35 °C + radiadores
50 °C) el circuito de baja necesita grupo CON mezcladora. No hay ningún
presupuesto cerrado con ese caso, así que esa regla hay que preguntarla antes
de inventarla.

**Extras condicionales:**

| Condición | Línea | € |
|---|---|--:|
| `sistema_actual` ≠ ninguno | A103 Sustitución de caldera | 850 |
| ACS 200 l | UniSTOR VIH RW 200/2 | 2.035 |
| ACS 250 l | UniSTOR VIH RW 250/2 | 2.265 |
| Apoyo eléctrico | Resistencia eléctrica | 250 |
| Circuito existente | Limpieza de circuito (A111) | 500 |

**Selección de máquina** por rango de kW, con `condicion` extra: el mismo kW
con suelo radiante o con radiadores puede ser otra máquina.

### Fotovoltaica — 21 presupuestos

```
Total = kit fijo (por tramo de kWp)
      + 110 € × nº de paneles
      + inversor (por kWp)
      + batería (si la hay)
```

**El panel va a 110 €/ud en los 21 presupuestos, sin una sola excepción.**

**Kit fijo — 5.445 €** en 5–6 kWp, idéntico en seis presupuestos:

| Concepto | € |
|---|--:|
| Material eléctrico | 1.905 |
| Mano de obra | 725 |
| Estructura de soportación | 252 |
| Trámites D.G. Industria | 300 |
| Gestiones documentales | 300 |
| Puesta en marcha y monitorización | 150 |
| Medidor de energía e interfaz | 110 |

Escalona por tramos, no linealmente: 5–6 kWp → 5.445 · 10 kWp → 8.560 ·
145 kWp → 56.450 (comercial, otra liga).

**Inversor**: 5–6 kWp → 1.606–1.612 · 10 kWp → 2.100 · 145 kWp → 7.900.

**Nº de paneles** = `ceil(kWp × 1000 / Wp_panel)`. Cuadra: 5 kWp → 10–12
paneles según el panel sea de 450 o 510 Wp.

**La batería es una magnitud propia, no un extra.** Sin batería el €/kWp es
estable (1.373–1.675). Con batería se va a 2.835–4.140, porque la batería
domina el coste y no escala con los kWp. El estimativo necesita **dos
entradas**: kWp y kWh.

### Aire acondicionado — 14 presupuestos

El más limpio de los tres. Dos contadores y ya:

```
Total = equipos
      + 245 € × unidades interiores     C100  tubería frigorífica
      +  72 € × unidades interiores     C101  electricidad
      +  45 € × unidades exteriores     C102  soportes
      +  52 € × metros de exceso        C103
      + 450 € × unidades interiores     C104  mano de obra
```

Verificado en los tres presupuestos que usan los códigos: las cantidades
siguen **exactamente** el número de unidades, sin excepción ni criterio.

| Presupuesto | Config | Int | Ext | C100 | C101 | C102 | C104 |
|---|---|--:|--:|--:|--:|--:|--:|
| AIRE MIDEA 1 | multisplit 2×1 | 2 | 1 | ×2 | ×2 | ×1 | ×2 |
| AIRE MIDEA | 2×1 + módulo | 3 | 2 | ×3 | ×3 | ×2 | ×3 |
| AIRES VAILLANT | 2×1 + mural | 3 | 2 | ×3 | ×3 | ×2 | ×3 |

⚠ `C104` vale 450 € en los Midea y 300 € en el de Vaillant. Con tres casos no
se sabe de qué depende. Hay que preguntarlo, no promediarlo.

⚠ Solo 3 de los 14 presupuestos usan los códigos C100–C104; el resto va con
conceptos libres ("instalación", "material"). Los códigos son lo que hace el
presupuesto reproducible.

**Marcas en aire, cinco y no tres**: Vaillant (climaVAIR), Midea
(Solunaria/Soltice), Kosner, Mitsubishi Electric, Hisense. Kosner, Mitsubishi
e Hisense no tienen tarifa cargada.

### Electricidad — aplazado

Decisión tomada: se deja para más adelante. Los otros tres oficios tienen una
magnitud que manda (kW, kWp, nº de unidades). Una instalación eléctrica se
define por circuitos, y cada uno depende de su uso, sección, protección,
longitud y del REBT. No es una cadena, es una combinatoria — y el peso está en
lo que ya existe, que ninguna medición sencilla captura. Cuando toque,
probablemente no sea el mismo motor con otras reglas sino un motor por
circuitos con las tablas del REBT detrás.

---

## 4 · Catálogos extraídos

En `herramientas/tarifas/`, con su extractor al lado en `herramientas/`:

| Fichero | Productos | Origen |
|---|--:|---|
| `vaillant-2025.csv` | 360 | PDF con capa de texto limpia, lista |
| `midea-2026.csv` | 326 | PDF en **matriz**: fila `Código` + fila `P.V.R.`, emparejadas por posición de carácter |
| `saunier-2026.csv` | 1.011 | mismo formato que Vaillant |
| `equivalencias-vaillant-saunier.csv` | 4 | pares aroTHERM ↔ Genia Air Max |

Columnas: `referencia, nombre, familia, unidad, precio_tarifa, iva, atributos`.
`atributos` es jsonb con lo que consultan las reglas (`potencia_kw`, `litros`,
`trifasica`, `control`).

### Vaillant y Saunier Duval son del mismo grupo

Comparten sistema de referencias: los packs Genia Air Max llevan referencia
`00203xxxxx`, formato Vaillant. Los equivalentes reales salen **+5,4 %**:

| kW | Vaillant | Saunier | ratio |
|---|--:|--:|--:|
| 4 | 8.755 (0020306791) | 9.230 (0020307741) | ×1,0543 |
| 8 | 9.710 (0020306795) | 10.235 (0020307745) | ×1,0541 |
| 12 | 12.780 (0020306797) | 13.465 (0020307747) | ×1,0536 |
| 15 | 13.395 (0020306801) | 14.115 (0020307751) | ×1,0538 |

**Se emparejan por referencia, no por fórmula.** El precio de un presupuesto
tiene que ser el de tarifa, no uno calculado; el ratio solo sirve para
detectar equivalencias mal puestas.

Al comparar marcas hay que enfrentar **producto equivalente contra producto
equivalente**. Un GeniaSet Iso (pack completo con acumulador inox) contra un
aroTHERM plus básico (solo la unidad exterior) da un +50 % que no es real.

Las gamas no casan una a una: Vaillant va 4/6/8/12/15 y la Max de Saunier va
5/8/12/15. En 6 kW no hay equivalente.

**Midea sí es otra liga**: −45 % consistente (8 kW → 5.340 € frente a 9.710 €).
Encaja con su papel de opción económica.

---

## 5 · Base de datos

`sql/etapa38_motor_presupuestos.sql`, ya escrito y listo para ejecutar.
Idempotente, con `begin/commit`, usando los helpers de la etapa 20
(`es_admin()`, `es_comercial()`).

Tablas: `proveedores` · `tarifas` · `productos` · `producto_equivalencias` ·
`variables_derivadas` · `tablas_lookup` · `partidas` · `partidas_items` ·
`conjuntos_reglas` · `reglas` · `mano_obra` · `politica_descuentos` ·
`ratios` · `presupuestos` · `presupuesto_lineas` ·
`presupuesto_incidencias` · `motor_correcciones`.

### Los principios que explican el diseño

1. **Las reglas son datos, no código.** Cambiar qué máquina va a 8 kW es
   editar una fila, no tocar index.html ni desplegar.
2. **Todo lo que cambia va versionado.** Nunca se edita la tarifa o el
   conjunto de reglas vigente: se publica el siguiente y se cierra el
   anterior. Cada presupuesto congela con qué versiones se calculó. Sin esto,
   uno reabierto en un año muestra otros números y no se sabe cuál se mandó.
3. **Las reglas no miran los m² crudos**, miran `variables_derivadas`. Ahí
   vive la ingeniería (carga térmica, circuitos, nº de paneles). Cambiar el
   criterio de dimensionado se hace en un sitio, no en cuarenta reglas.
4. **Los coeficientes van en `tablas_lookup`**, no en el código: son
   exactamente lo que se va a calibrar durante meses.
5. **Cada línea guarda qué regla la produjo y con qué valores**
   (`origen_regla_id`, `origen_inputs`). Sin eso, un presupuesto raro obliga a
   ingeniería inversa a mano.
6. **El detalle técnico se escribe una vez por producto**, no por presupuesto
   (`productos.detalle_tecnico` y `especificaciones`). Va a Teamleader en
   `extra_information` de la línea.
7. **`motor_correcciones`**: cuando alguien cambia la línea que propuso el
   motor, se anota qué se propuso y qué se eligió. Con cincuenta de esas se
   sabe qué reglas están mal calibradas. Es lo único que hace que el motor
   mejore en vez de quedarse como se dejó.

### Lo que NO se duplica

El cuestionario de la visita vive en `visitas-schemas.js` con su flag
`motor: true`, y las categorías en sus `CATEGORIAS`. No se replica en base de
datos. Los roles y sus helpers son de la etapa 20.

---

## 6 · Lo que falta, en orden

### Paso 1 · Ejecutar y cargar

- Ejecutar `sql/etapa38_motor_presupuestos.sql` en Supabase.
- Escribir `herramientas/cargar-tarifa.py`: lee un CSV de
  `herramientas/tarifas/` y lo inserta en `productos` contra su `tarifas.id`.
  Idempotente por `(tarifa_id, referencia)`.

### Paso 2 · El motor

Edge Function, entrada y salida JSON, sin saber nada de la UI ni del CRM:

```
POST /presupuestar
  { categoria, visita_id, ficha_id, datos, marca? }
  ↓
  { lineas[], totales, incidencias[], trazas[] }
```

Orden interno: `datos` → `variables_derivadas` (en orden) → `reglas`
(por prioridad) → `partidas` → `mano_obra` → precios → descuentos.

Las fórmulas se evalúan con un **evaluador acotado**, nunca `eval()`.

### Paso 3 · La suite de tests

`herramientas/tarifas/presupuestos-historicos-lineas.csv` tiene las 562 líneas
de los 59 presupuestos. Son los casos de verdad: se mete la ficha, se espera
el total. Empezar por el 2026/596.

Va en `pruebas/`, junto a `arnes.js`.

### Paso 4 · La pantalla

Prototipo funcionando con datos reales en el artefacto **Motor Sysefen**. El
patrón es: **el motor propone, el humano confirma, la app aprende.**

- Cada línea muestra su origen: `regla #12` · `partida KIT_BASE` · `manual`.
- La máquina lleva un desplegable con **las alternativas compatibles con esa
  potencia**, no el catálogo entero, cada una con su diferencia sobre la
  recomendada (`+1.200 €`, `−90 €`). En una visita eso se decide en dos
  segundos; un select de 360 referencias, no.
- Vista de impresión: la especificación debajo de cada artículo.
- Comparador de marcas: como el motor separa la máquina del resto, generar el
  mismo presupuesto con las tres marcas cuesta cero. Enseñar tres precios al
  cliente en la visita, en vez de mandarle uno por correo la semana que viene.

### Paso 5 · Teamleader

`quotations.create` recibe **líneas ya montadas**; no interpreta texto.
`quotations.create` y `quotations.send` son llamadas separadas: se crea el
presupuesto en el CRM sin mandarlo al cliente simplemente no llamando a la
segunda.

Campos personalizados del deal: **50 como máximo** en deals, y **solo 3
buscables**. Así que no se vuelca la ficha entera — sube un subconjunto
curado (oficio, magnitud principal, estimativo, estado del motor, id de
visita, enlace a la ficha). Los tres buscables: oficio, estado del motor e id
de visita.

---

## 7 · El hueco que queda abierto

**Los presupuestos no contienen los datos del inmueble.** Empiezan con la
máquina ya elegida. Así que se pudo calibrar todo menos una cosa:

| Capa | ¿Calibrada? |
|---|---|
| Precios, partidas, descuentos, mano de obra | ✅ exacta |
| Selección de máquina por magnitud | ✅ |
| Cálculo de la magnitud desde el inmueble | ❌ faltan datos |

Para cerrarlo hacen falta, de 10–15 obras ya hechas: m² climatizados, altura,
año de construcción, tipo de inmueble y tipo de emisor. Con eso se ajustan los
coeficientes W/m² hasta que el cálculo devuelva la potencia que realmente se
instaló.

**Mientras tanto el motor funciona igual** con la potencia introducida a mano
en la visita. Se pierde el dimensionado automático y se gana el presupuesto
automático, que viendo los números es el 80 % del trabajo.

**Aire acondicionado no tiene este problema**: su magnitud es discreta (nº de
unidades) y la visita la cuenta directamente. Es el único de los tres que se
puede automatizar entero hoy, así que es el mejor candidato para salir
primero a producción, aunque la calibración empezara por aerotermia.

---

## 8 · Dónde está la IA, y dónde no

La IA **no calcula el presupuesto**. En cuanto decide precios, el sistema deja
de ser reproducible y un día manda al cliente una referencia que no existe.

Donde sí, por orden de valor:

1. **Cargar catálogos.** Las tarifas en PDF. Se verifica fácil contra el
   original.
2. **Revisar, no generar.** Se le pasa la visita *y* el presupuesto ya
   calculado y se le pregunta qué no cuadra. Detecta el olvido: falta el
   desagüe, falta el diferencial, hay fancoils sin bomba de condensados. Los
   modelos son buenos reconociendo lo que falta en un patrón, malos
   calculando.
3. **Redacción.** Descripciones, alcance de obra, observaciones. Entra el
   presupuesto calculado, sale texto. No toca un número.
4. **Fotos de la visita.** Placa de características, estado del cuadro,
   estado de una cubierta.
5. **El hueco.** Lo que ninguna regla cubrió, marcado como *sin confirmar*, en
   sección aparte, nunca mezclado con lo calculado (`presupuesto_lineas.origen
   = 'ia'`, `confirmada = false`).

**La regla de oro: el LLM puede elegir *qué*, nunca *cuánto cuesta*.** En la
práctica, tool calling: se le dan herramientas (`buscar_producto`,
`calcular_carga`) y el precio sale siempre de la base de datos. Structured
outputs, temperatura 0, y se guarda el prompt y la respuesta junto al
presupuesto.

---

## 9 · Erratas encontradas en los datos

Por si conviene corregirlas en Teamleader:

- Números de presupuesto duplicados: `2025/470`, `2026/672`, `2026/574` —
  parecen variantes de la misma oferta. En el CRM deberían ser versiones, no
  presupuestos distintos.
- `INSTALACIÓN FOTOVOLTAICA … TESLA` contiene un presupuesto titulado
  "AEROTERMIA".
- Capacidades de batería mal escritas: `5kwp 134 kwh` y `5kwp 930 kwh` —
  serán 13,4 y 9,30 kWh.
- Erratas de texto: "AEROYERMIA", "INSTLACION Y MATERIALES", "GRUPOD E BOMBEO",
  "LIMPIEZA CIRCUITO EXITENTE", "MATERIAL HIDRULICO".
- Una línea con `GESTIONES ADMINISTRATIVAS` a cantidad 0.
