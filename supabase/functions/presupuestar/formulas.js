// =============================================================================
// Sysefen · Motor de presupuestos · El evaluador de fórmulas
//
// Las reglas del motor son DATOS, no código: viven en filas de Supabase que
// alguien de presupuestos puede editar sin tocar la app. Eso significa que hay
// que evaluar expresiones que vienen de la base de datos.
//
// Con `eval()` eso sería una puerta abierta: quien pudiera escribir en una fila
// ejecutaría lo que quisiera dentro del servidor. Aquí se lee la expresión a
// mano y solo se entiende esto:
//
//   números           12   3.5
//   textos            'suelo_radiante'
//   variables         unidades_interiores   estancias
//   aritmética        + - * /   y paréntesis
//   comparaciones     =  !=  <  <=  >  >=
//   lógica            y   o   no
//   funciones         min max techo piso redondea si lookup cuenta suma
//
// No hay acceso a nada más: ni objetos, ni propiedades, ni llamadas fuera de esa
// lista. Una fórmula que intente otra cosa no se ejecuta, da error.
//
// Sin dependencias: lo usan igual la Edge Function y las pruebas.
// =============================================================================

const FUNCIONES = {
  min: (...a) => Math.min(...a.map(numero)),
  max: (...a) => Math.max(...a.map(numero)),
  techo: (a) => Math.ceil(numero(a)),
  piso: (a) => Math.floor(numero(a)),
  redondea: (a, d) => {
    const f = Math.pow(10, d == null ? 0 : numero(d));
    return Math.round(numero(a) * f) / f;
  },
  si: (c, a, b) => (verdad(c) ? a : b),
  // cuenta(lista) → cuántos elementos tiene
  cuenta: (l) => (Array.isArray(l) ? l.length : (l == null || l === '' ? 0 : 1)),
  // suma(lista, 'campo') → suma ese campo de cada elemento
  suma: (l, campo) => (Array.isArray(l) ? l : []).reduce((t, x) => {
    const v = campo == null ? x : (x || {})[campo];
    const n = Number(String(v == null ? 0 : v).replace(',', '.'));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0),
};

function numero(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function verdad(v) {
  if (Array.isArray(v)) return v.length > 0;
  return !(v === false || v == null || v === '' || v === 0);
}

/* --- El lector: trocea la expresión en piezas ----------------------------- */
function trocear(txt) {
  const piezas = [];
  let i = 0;
  const esLetra = (c) => /[A-Za-z_áéíóúñÁÉÍÓÚÑ0-9]/.test(c);
  while (i < txt.length) {
    const c = txt[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < txt.length && txt[j] !== c) { s += txt[j]; j++; }
      if (j >= txt.length) throw new Error('falta cerrar la comilla');
      piezas.push({ t: 'texto', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(txt[i + 1] || ''))) {
      let j = i, s = '';
      while (j < txt.length && /[0-9.]/.test(txt[j])) { s += txt[j]; j++; }
      piezas.push({ t: 'numero', v: Number(s) }); i = j; continue;
    }
    if (esLetra(c)) {
      let j = i, s = '';
      while (j < txt.length && esLetra(txt[j])) { s += txt[j]; j++; }
      piezas.push({ t: 'nombre', v: s }); i = j; continue;
    }
    const dos = txt.slice(i, i + 2);
    if (['<=', '>=', '!=', '<>', '=='].includes(dos)) { piezas.push({ t: 'op', v: dos === '<>' ? '!=' : dos === '==' ? '=' : dos }); i += 2; continue; }
    if ('+-*/()<>=,'.includes(c)) { piezas.push({ t: c === ',' ? 'coma' : c === '(' ? 'abre' : c === ')' ? 'cierra' : 'op', v: c }); i++; continue; }
    throw new Error('no entiendo el carácter "' + c + '"');
  }
  return piezas;
}

/* --- El intérprete: descenso recursivo ------------------------------------ */
export function evaluar(formula, ambito, ayudas) {
  const piezas = trocear(String(formula == null ? '' : formula));
  let p = 0;
  const mira = () => piezas[p];
  const come = (t, v) => {
    const x = piezas[p];
    if (!x || (t && x.t !== t) || (v != null && x.v !== v)) {
      throw new Error('se esperaba ' + (v || t) + ' en «' + formula + '»');
    }
    p++; return x;
  };

  function expresion() { return o_(); }
  function o_() {
    let a = y_();
    while (mira() && mira().t === 'nombre' && mira().v === 'o') { come(); const b = y_(); a = verdad(a) || verdad(b); }
    return a;
  }
  function y_() {
    let a = comparacion();
    while (mira() && mira().t === 'nombre' && mira().v === 'y') { come(); const b = comparacion(); a = verdad(a) && verdad(b); }
    return a;
  }
  function comparacion() {
    const a = suma_();
    const x = mira();
    if (x && x.t === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(x.v)) {
      come(); const b = suma_();
      const textos = typeof a === 'string' || typeof b === 'string';
      const ia = textos ? String(a == null ? '' : a) : numero(a);
      const ib = textos ? String(b == null ? '' : b) : numero(b);
      switch (x.v) {
        case '=': return ia === ib;
        case '!=': return ia !== ib;
        case '<': return ia < ib;
        case '<=': return ia <= ib;
        case '>': return ia > ib;
        default: return ia >= ib;
      }
    }
    return a;
  }
  function suma_() {
    let a = producto();
    for (;;) {
      const x = mira();
      if (x && x.t === 'op' && (x.v === '+' || x.v === '-')) { come(); const b = producto(); a = x.v === '+' ? numero(a) + numero(b) : numero(a) - numero(b); }
      else return a;
    }
  }
  function producto() {
    let a = unario();
    for (;;) {
      const x = mira();
      if (x && x.t === 'op' && (x.v === '*' || x.v === '/')) {
        come(); const b = unario();
        if (x.v === '/' && numero(b) === 0) throw new Error('división por cero en «' + formula + '»');
        a = x.v === '*' ? numero(a) * numero(b) : numero(a) / numero(b);
      } else return a;
    }
  }
  function unario() {
    const x = mira();
    if (x && x.t === 'op' && x.v === '-') { come(); return -numero(unario()); }
    if (x && x.t === 'op' && x.v === '+') { come(); return numero(unario()); }
    if (x && x.t === 'nombre' && x.v === 'no') { come(); return !verdad(unario()); }
    return atomo();
  }
  function atomo() {
    const x = mira();
    if (!x) throw new Error('la fórmula «' + formula + '» se corta');
    if (x.t === 'numero' || x.t === 'texto') { come(); return x.v; }
    if (x.t === 'abre') { come(); const v = expresion(); come('cierra'); return v; }
    if (x.t === 'nombre') {
      come();
      if (mira() && mira().t === 'abre') {
        come('abre');
        const args = [];
        if (!(mira() && mira().t === 'cierra')) {
          args.push(expresion());
          while (mira() && mira().t === 'coma') { come('coma'); args.push(expresion()); }
        }
        come('cierra');
        if (x.v === 'lookup') {
          const f = (ayudas && ayudas.lookup) || (() => { throw new Error('aquí no hay tablas de coeficientes'); });
          return f(String(args[0]), args[1] == null ? '' : String(args[1]));
        }
        const fn = FUNCIONES[x.v];
        if (!fn) throw new Error('no existe la función ' + x.v + '()');
        return fn(...args);
      }
      if (x.v === 'verdadero' || x.v === 'si_') return true;
      if (x.v === 'falso' || x.v === 'no_') return false;
      if (x.v === 'nada') return null;
      if (ambito && Object.prototype.hasOwnProperty.call(ambito, x.v)) return ambito[x.v];
      // Un dato que la visita no rellenó vale 0 / vacío, no revienta el cálculo:
      // el motor lo anota como incidencia y sigue.
      if (ayudas && ayudas.faltante) ayudas.faltante(x.v);
      return null;
    }
    throw new Error('no entiendo «' + (x.v != null ? x.v : x.t) + '» en «' + formula + '»');
  }

  const valor = expresion();
  if (p < piezas.length) throw new Error('sobra algo al final de «' + formula + '»');
  return valor;
}

/** Como `evaluar`, pero devolviendo siempre un número. */
export function evaluarNumero(formula, ambito, ayudas) {
  return numero(evaluar(formula, ambito, ayudas));
}
export { numero, verdad };
