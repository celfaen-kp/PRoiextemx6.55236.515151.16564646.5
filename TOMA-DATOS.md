# Toma de datos para presupuestos — cómo se engancha

Módulo nuevo para el rol `presupuestos` (Ramón). **No ficha, no imputa horas, no
ve obras ni partes, no firma nada.** Entra, rellena la ficha de la visita y la
manda a Teamleader, que es donde se hace el presupuesto.

## Archivos

| Archivo | Qué es |
|---|---|
| `sql/etapa20_toma_datos.sql` | Migración: tablas, bucket, RLS, rol nuevo |
| `visitas-schemas.js` | **Los cuestionarios.** Toda la "data" del diseño vive aquí |
| `visitas-form.js` | Dibuja el formulario a partir del esquema. No sabe de aerotermia |
| `visitas-db.js` | Supabase: visitas, fichas, fotos, envío al CRM |

La idea de fondo: para añadir un campo se toca **solo `visitas-schemas.js`**.
Ni base de datos, ni renderer, ni vistas.

## Orden de instalación

1. Ejecutar `sql/etapa20_toma_datos.sql` en Supabase.
2. Dar el rol a Ramón:
   ```sql
   update public.empleados set rol = 'presupuestos' where email = 'ramon@sysefen.app';
   ```
3. Copiar los tres `.js` a la raíz del repo, al lado de `supabase-db.js`.
4. Los enganches de abajo **ya están aplicados** en `index.html` (versión 10.4),
   con el diseño revisado: barra de pasos, botones fijos abajo, fotos en cada
   ficha y lista agrupada. Lo de abajo queda como referencia del primer borrador.

---

## Enganche 1 · Imports

En el bloque `<script type="module">`, junto a los otros imports:

```js
import * as vSchemas from './visitas-schemas.js';
import * as vForm from './visitas-form.js';
import * as visitasDB from './visitas-db.js';
```

## Enganche 2 · Estado

En la declaración de `V`, añadir al final del objeto:

```js
  visitas: [], visitaId: null, visitaPaso: 1, visitaCat: null,
  visitaDraft: null, visitaFichas: {}, visitaBusy: false, visitaBuscar: '',
```

Y un helper al lado de `esAdmin` / `puedeCrear`:

```js
const esPresupuestos = () => rol() === 'presupuestos';
const esComercial = () => ['presupuestos', 'jefe', 'admin'].includes(rol());
```

## Enganche 3 · Dos líneas en los manejadores

En `document.addEventListener('click', ...)`, **antes** de la cadena de ifs:

```js
  if (a.startsWith('vf')) return A.vf(a, d);
```

En `document.addEventListener('input', ...)`, justo después de `if (!f) return;`:

```js
  if (f.startsWith('vf')) return A.vf(f, t.dataset, t.value);
```

Eso es todo el cableado del formulario. No hace falta un `if` por campo.

## Enganche 4 · render() y nav()

En `render()`, junto a las demás vistas:

```js
  else if (v === 'visitas' && esComercial()) html = vVisitas();
  else if (v === 'visita' && esComercial()) html = vVisita();
  else if (v === 'visitaNueva' && esComercial()) html = vVisitaNueva();
```

Y en la línea que decide si se pinta la barra de abajo, añadir `'visitas'` a la
lista de vistas con nav.

En `nav()`, **la primera rama**, antes de la de admin — a Ramón se le da su
propia barra y no la del operario:

```js
  const items = esPresupuestos()
    ? [['visitas', 'Visitas', '5px'], ['ajustes', 'Perfil', '99px']]
    : esAdmin()
    ? [...]  // lo que ya había
```

Y en `act(id)`, para que "Visitas" siga marcada dentro de una visita:

```js
    || (id === 'visitas' && (v === 'visita' || v === 'visitaNueva'))
```

## Enganche 5 · Entrada de la app

Donde se decide la vista tras el PIN, mandar a Ramón a sus visitas en vez de a
`hoy` (que es la pantalla de fichar):

```js
  V.view = esPresupuestos() ? 'visitas' : 'hoy';
```

---

## Acciones

```js
/* ---------- toma de datos ---------- */

// Único manejador del formulario: delega en visitas-form.js
A.vf = (accion, d, valor) => {
  if (!V.visitaDraft) return;
  const cat = V.visitaCat;
  const estado = cat
    ? (V.visitaFichas[cat] || (V.visitaFichas[cat] = { datos: {}, tocados: {} }))
    : { datos: V.visitaDraft, tocados: V.visitaDraft._tocados || (V.visitaDraft._tocados = {}) };
  const esquema = cat ? vSchemas.ESQUEMAS[cat] : vSchemas.COMUN;
  const cambio = vForm.manejar(accion, d, valor, estado, cat ? esquema : null, V.visitaDraft);
  if (!cambio) return;
  guardarBorradorVisita();
  // Los campos de texto no se repintan: perderían el foco y el cursor.
  if (accion !== 'vfCampo' && accion !== 'vfLista') render();
};

A.visitas = async () => {
  V.view = 'visitas'; render();
  try { V.visitas = await visitasDB.listarVisitas(); render(); }
  catch (e) { avisar('No se pudieron cargar las visitas: ' + (e.message || e)); }
};

A.nuevaVisita = () => {
  V.visitaId = crypto.randomUUID();     // el id lo pone el móvil, no la base
  V.visitaDraft = { id: V.visitaId, fecha_visita: hoyISO(), _tocados: {} };
  V.visitaFichas = {};
  V.visitaPaso = 1;
  V.visitaCat = null;
  V.view = 'visitaNueva';
  render();
};

A.visitaPaso = (n) => { V.visitaPaso = Number(n); V.visitaCat = null; render(); };
A.visitaCat = (c) => { V.visitaCat = c || null; render(); };

A.visitaToggleCat = (c) => {
  const cats = V.visitaDraft.categorias || (V.visitaDraft.categorias = []);
  const i = cats.indexOf(c);
  if (i >= 0) { cats.splice(i, 1); delete V.visitaFichas[c]; }
  else { cats.push(c); V.visitaFichas[c] = { datos: {}, tocados: {} }; }
  guardarBorradorVisita(); render();
};

A.guardarVisita = async (completar) => {
  const d = V.visitaDraft;
  if (completar) {
    const faltan = [];
    for (const c of (d.categorias || [])) {
      const f = V.visitaFichas[c] || { datos: {} };
      vSchemas.loQueFalta(vSchemas.ESQUEMAS[c], f.datos)
        .forEach((x) => faltan.push(`${vSchemas.ESQUEMAS[c].categoria}: ${x.campo}`));
    }
    if (faltan.length) return avisar('Falta por rellenar:\n' + faltan.join('\n'));
  }
  V.visitaBusy = true; render();
  try {
    const fila = Object.assign({}, d);
    delete fila.categorias; delete fila._tocados;
    fila.estado = completar ? 'completada' : 'borrador';
    await visitasDB.crearVisita(fila).catch(() => visitasDB.guardarVisita(d.id, fila));
    for (const c of (d.categorias || [])) {
      const f = V.visitaFichas[c] || { datos: {} };
      await visitasDB.guardarFicha(d.id, c, f.datos, vSchemas.VERSION, !!completar);
    }
    limpiarBorradorVisita();
    V.visitaBusy = false;
    await A.visitas();
  } catch (e) {
    V.visitaBusy = false; render();
    avisar('No se pudo guardar: ' + (e.message || e) + '\nSe queda en el móvil, no se pierde.');
  }
};

A.verVisita = async (id) => {
  V.visitaId = id; V.view = 'visita'; render();
  try {
    const { visita, fichas } = await visitasDB.verVisita(id);
    V.visitaDraft = visita;
    V.visitaFichas = {};
    fichas.forEach((f) => { V.visitaFichas[f.categoria] = { datos: f.datos, tocados: {} }; });
    V.visitaDraft.categorias = fichas.map((f) => f.categoria);
    render();
  } catch (e) { avisar('No se pudo abrir: ' + (e.message || e)); }
};

A.enviarVisita = async () => {
  V.visitaBusy = true; render();
  try {
    await visitasDB.enviarATeamleader(V.visitaId);
    await A.verVisita(V.visitaId);
    avisar('Enviado. Ya está en Teamleader.');
  } catch (e) {
    avisar('No se pudo enviar ahora: ' + (e.message || e) + '\nQueda en la cola y se reintenta solo.');
  } finally { V.visitaBusy = false; render(); }
};
```

Y el borrador local, para que una visita a medias sobreviva a cerrar la app:

```js
const KEY_VISITA = 'sysefen.visita.borrador';
function guardarBorradorVisita() {
  try {
    localStorage.setItem(KEY_VISITA, JSON.stringify({
      draft: V.visitaDraft, fichas: V.visitaFichas, paso: V.visitaPaso,
    }));
  } catch (e) { /* sin espacio: no es motivo para romper la visita */ }
}
function limpiarBorradorVisita() {
  try { localStorage.removeItem(KEY_VISITA); } catch (e) {}
  V.visitaDraft = null; V.visitaFichas = {}; V.visitaId = null;
}
function recuperarBorradorVisita() {
  try {
    const raw = localStorage.getItem(KEY_VISITA);
    if (!raw) return false;
    const b = JSON.parse(raw);
    V.visitaDraft = b.draft; V.visitaFichas = b.fichas || {};
    V.visitaPaso = b.paso || 1; V.visitaId = b.draft?.id || null;
    return true;
  } catch (e) { return false; }
}
const hoyISO = () => new Date().toISOString().slice(0, 10);
```

## Registrar las acciones en el click

```js
  if (a === 'visitas') return A.visitas();
  if (a === 'nuevaVisita') return A.nuevaVisita();
  if (a === 'visitaPaso') return A.visitaPaso(d.n);
  if (a === 'visitaCat') return A.visitaCat(d.c);
  if (a === 'visitaToggleCat') return A.visitaToggleCat(d.c);
  if (a === 'guardarVisita') return A.guardarVisita(d.completar === '1');
  if (a === 'verVisita') return A.verVisita(d.id);
  if (a === 'enviarVisita') return A.enviarVisita();
```

---

## Las tres vistas

```js
/* --- visitas: la lista --- */
function vVisitas() {
  const pend = V.visitas.filter((v) => v.estado === 'borrador');
  const resto = V.visitas.filter((v) => v.estado !== 'borrador');
  const chipSync = (v) => v.sync_estado === 'sincronizada'
    ? '<span class="pill pill-verde">En Teamleader</span>'
    : v.sync_estado === 'error'
    ? '<span class="pill pill-rojo">No se pudo enviar</span>'
    : v.estado === 'completada'
    ? '<span class="pill">Pendiente de enviar</span>' : '';

  const fila = (v) => `<div class="card" data-a="verVisita" data-id="${v.id}" style="cursor:pointer">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div class="grow">
        <div style="font:600 16px/1.2 var(--sans)">${esc(v.direccion || 'Sin dirección')}</div>
        <div class="sub" style="margin-top:3px">${esc(v.poblacion || '')} · ${esc(v.cliente?.nombre || 'Sin cliente')}</div>
      </div>
      <div class="tiny mono" style="opacity:.5">${esc(v.codigo || '')}</div>
    </div>
    <div class="row g8" style="margin-top:10px;flex-wrap:wrap">${chipSync(v)}</div>
  </div>`;

  return `<div class="scroll pb-nav">
    <div class="hdr"><div class="h1">Visitas</div></div>
    <div class="pad">
      <button class="btn btn-verde" data-a="nuevaVisita">Nueva visita</button>
      ${pend.length ? `<div class="lbl" style="margin-top:24px">Sin cerrar</div>
        <div class="col g8">${pend.map(fila).join('')}</div>` : ''}
      ${resto.length ? `<div class="lbl" style="margin-top:24px">Hechas</div>
        <div class="col g8">${resto.map(fila).join('')}</div>` : ''}
      ${!V.visitas.length ? '<div class="sub" style="margin-top:30px">Todavía no hay ninguna visita.</div>' : ''}
    </div>
  </div>`;
}

/* --- visitaNueva: el wizard de 5 pasos --- */
function vVisitaNueva() {
  const p = V.visitaPaso;
  const d = V.visitaDraft || {};
  const pasos = ['Cliente', 'Inmueble', 'Categorías', 'Ficha', 'Cierre'];

  let cuerpo = '';
  if (p === 1) {
    cuerpo = `<div class="lbl">Cliente</div>
      <input class="inp" data-f="vfCampo" data-k="_cliente_nombre"
        value="${esc(d._cliente_nombre || '')}" placeholder="Nombre o NIF">
      <div class="tiny" style="color:var(--gris);margin-top:6px">
        Si no está, se da de alta aquí y se crea en Teamleader al enviar.</div>`;

  } else if (p === 2) {
    cuerpo = vForm.fichaHTML(vSchemas.COMUN, d, d._tocados || {});

  } else if (p === 3) {
    const cats = d.categorias || [];
    cuerpo = `<div class="lbl">¿Qué se presupuesta?</div>
      <div class="col g8">${vSchemas.CATEGORIAS.map((c) => {
        const on = cats.includes(c.key);
        return `<div class="card" data-a="visitaToggleCat" data-c="${c.key}"
          style="cursor:pointer;${on ? 'border-color:var(--verde-c)' : ''}">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div style="font:600 16px/1.2 var(--sans)">${esc(c.nombre)}</div>
            <div class="chip" style="${on ? 'background:var(--verde-c);color:#fff' : ''}">${on ? '✓' : '+'}</div>
          </div>
        </div>`;
      }).join('')}</div>`;

  } else if (p === 4) {
    const cats = d.categorias || [];
    if (!cats.length) {
      cuerpo = '<div class="sub">Vuelve atrás y elige al menos una categoría.</div>';
    } else if (!V.visitaCat) {
      cuerpo = `<div class="lbl">¿Cuál rellenas?</div>
        <div class="col g8">${cats.map((c) => {
          const esq = vSchemas.ESQUEMAS[c];
          const f = V.visitaFichas[c] || { datos: {} };
          const faltan = vSchemas.loQueFalta(esq, f.datos).length;
          return `<div class="card" data-a="visitaCat" data-c="${c}" style="cursor:pointer">
            <div class="row" style="justify-content:space-between;align-items:center">
              <div style="font:600 16px/1.2 var(--sans)">${esc(vSchemas.CATEGORIAS.find((x) => x.key === c).nombre)}</div>
              ${faltan ? `<span class="pill">Faltan ${faltan}</span>` : '<span class="pill pill-verde">Completa</span>'}
            </div>
          </div>`;
        }).join('')}</div>`;
    } else {
      const esq = vSchemas.ESQUEMAS[V.visitaCat];
      const f = V.visitaFichas[V.visitaCat] || { datos: {}, tocados: {} };
      cuerpo = `<div class="volver" data-a="visitaCat" data-c="">‹ Todas las categorías</div>
        ${vForm.fichaHTML(esq, f.datos, f.tocados)}`;
    }

  } else {
    const cats = d.categorias || [];
    cuerpo = `<div class="lbl">Resumen</div>
      ${cats.map((c) => `<div style="margin-top:18px">
        <div class="h2">${esc(vSchemas.CATEGORIAS.find((x) => x.key === c).nombre)}</div>
        ${vForm.resumenHTML(vSchemas.ESQUEMAS[c], (V.visitaFichas[c] || {}).datos)}
      </div>`).join('')}
      <div class="col g8" style="margin-top:26px">
        <button class="btn btn-verde" data-a="guardarVisita" data-completar="1"
          ${V.visitaBusy ? 'disabled' : ''}>Cerrar la visita</button>
        <button class="btn btn-gris" data-a="guardarVisita">Guardar y seguir luego</button>
      </div>`;
  }

  return `<div class="scroll">
    <div class="hdr">
      <div class="volver" data-a="ir" data-v="visitas">‹ Visitas</div>
      <div class="h1">${esc(pasos[p - 1])}</div>
      <div class="row g8" style="margin-top:12px">${pasos.map((t, i) => `<div class="chip"
        data-a="visitaPaso" data-n="${i + 1}"
        style="cursor:pointer;${i + 1 === p ? 'background:var(--verde-c);color:#fff' : ''}">${i + 1}</div>`).join('')}</div>
    </div>
    <div class="pad">
      ${cuerpo}
      ${p < 5 ? `<button class="btn btn-verde" data-a="visitaPaso" data-n="${p + 1}"
        style="margin-top:26px">Siguiente</button>` : ''}
    </div>
  </div>`;
}

/* --- visita: el detalle --- */
function vVisita() {
  const v = V.visitaDraft;
  if (!v) return '<div class="scroll"><div class="pad"><div class="sub">Cargando…</div></div></div>';
  const cats = v.categorias || [];
  const puedeEnviar = v.estado === 'completada' && v.sync_estado !== 'sincronizada';

  return `<div class="scroll pb-nav">
    <div class="hdr">
      <div class="volver" data-a="ir" data-v="visitas">‹ Visitas</div>
      <div class="h1">${esc(v.direccion || 'Visita')}</div>
      <div class="sub">${esc(v.poblacion || '')} · ${esc(v.codigo || '')}</div>
    </div>
    <div class="pad">
      ${v.sync_estado === 'error' ? `<div class="card" style="border-color:var(--rojo)">
        <div class="lbl" style="color:var(--rojo)">No se pudo enviar</div>
        <div class="tiny" style="margin-top:4px">${esc(v.sync_error || '')}</div>
      </div>` : ''}
      ${v.tl_deal_id ? `<div class="card">
        <div class="lbl">En Teamleader</div>
        <div class="tiny mono" style="margin-top:4px">${esc(v.tl_deal_id)}</div>
      </div>` : ''}
      ${cats.map((c) => `<div style="margin-top:22px">
        <div class="h2">${esc(vSchemas.CATEGORIAS.find((x) => x.key === c).nombre)}</div>
        ${vForm.resumenHTML(vSchemas.ESQUEMAS[c], (V.visitaFichas[c] || {}).datos)}
      </div>`).join('')}
      ${puedeEnviar ? `<button class="btn btn-verde" data-a="enviarVisita"
        style="margin-top:26px" ${V.visitaBusy ? 'disabled' : ''}>Enviar a Teamleader</button>` : ''}
    </div>
  </div>`;
}
```

---

## Lo que falta para que el envío funcione de verdad

La edge function `teamleader-visita` todavía no existe. Hasta que esté, el
botón "Enviar a Teamleader" fallará y la visita se quedará en `pendiente`, que
es el comportamiento correcto: no se pierde nada.

Para escribirla hacen falta dos cosas tuyas:

1. Registrar la app en el Marketplace de Teamleader y hacer la autorización una
   vez, para dejar el `refresh_token` en `tl_oauth`.
2. Decidir en qué fase del embudo nace el deal y con qué responsable.

## Pendiente de decidir

- La quinta categoría (¿fontanería? ¿piscinas? ¿calderas?).
- Particulares en Teamleader: ¿contacto o empresa? Y las comunidades.
- Qué campos personalizados creamos en el CRM.
- Si una ficha ya enviada se puede reabrir, y qué pasa entonces con el deal.
