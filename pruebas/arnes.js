/* =============================================================================
 * Sysefen · Arnés de pruebas
 *
 * Deja correr la app entera fuera del navegador, con jsc (el motor de
 * JavaScript que trae macOS, sin instalar nada). Sirve para pintar una pantalla
 * con datos de mentira y comprobar lo que sale, o para ver qué le pide a la base
 * sin tocar la base de verdad.
 *
 * No es un navegador: aquí no hay dibujo ni estilos. Lo que se comprueba es la
 * lógica y el HTML que genera.
 *
 * USO:  ./pruebas/correr.sh            (todas)
 *       ./pruebas/correr.sh ventana    (solo esa)
 * ============================================================================= */

var almacen = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
  setItem: function (k, v) { almacen[k] = String(v); },
  removeItem: function (k) { delete almacen[k]; },
};
globalThis.sessionStorage = globalThis.localStorage;

function nodo() {
  return {
    innerHTML: '', value: '', style: {}, dataset: {}, scrollTop: 0,
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    appendChild: function () {}, addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function () { return nodo(); }, querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    setAttribute: function () {}, removeAttribute: function () {}, focus: function () {}, click: function () {},
    closest: function () { return null; }, scrollIntoView: function () {}, insertAdjacentHTML: function () {}, remove: function () {},
  };
}
globalThis.document = {
  addEventListener: function () {}, removeEventListener: function () {},
  querySelector: function () { return nodo(); }, querySelectorAll: function () { return []; },
  getElementById: function () { return null; }, createElement: function () { return nodo(); },
  head: nodo(), body: nodo(), documentElement: nodo(), visibilityState: 'visible',
};
globalThis.window = globalThis;
globalThis.addEventListener = function () {};
globalThis.removeEventListener = function () {};
globalThis.navigator = {
  onLine: true, userAgent: 'arnes', platform: 'MacIntel', maxTouchPoints: 0,
  serviceWorker: { register: function () { return Promise.resolve(); }, addEventListener: function () {} },
};
globalThis.location = { href: 'https://ejemplo/', origin: 'https://ejemplo', protocol: 'https:', hostname: 'ejemplo', pathname: '/', search: '', reload: function () {} };
globalThis.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
globalThis.setInterval = function () { return 0; };
globalThis.clearInterval = function () {};
globalThis.clearTimeout = function () {};
globalThis.requestAnimationFrame = function () { return 0; };
globalThis.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };
globalThis.crypto = globalThis.crypto || { randomUUID: function () { return 'x'; } };
globalThis.alert = function () {};
globalThis.confirm = function () { return false; };

/* --- ayudas para escribir pruebas cortas --- */
var fallos = 0;
globalThis.comprueba = function (etiqueta, cierto) {
  if (!cierto) fallos++;
  print('  ' + (cierto ? 'OK   ' : 'FALLA') + '  ' + etiqueta);
};
globalThis.igual = function (etiqueta, a, b) {
  comprueba(etiqueta + (a === b ? '' : '  (salió "' + a + '", se esperaba "' + b + '")'), a === b);
};
globalThis.titulo = function (t) { print(''); print('--- ' + t + ' ---'); };
globalThis.resultado = function () {
  print('');
  print(fallos ? '>>> ' + fallos + ' FALLO(S)' : '>>> todo bien');
  return fallos;
};
