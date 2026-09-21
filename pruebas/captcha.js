/* La comprobación antirrobots: que dé un token nuevo por intento, que sin
 * Turnstile no bloquee la entrada, y que si Cloudflare no contesta no deje la
 * app colgada. */
setTimeout(function () {
  titulo('sin Turnstile cargado');
  tokenCaptcha(50).then(function (t) {
    igual('se entra sin token (no bloquea)', t, null);

    var ejecutado = 0, reseteado = 0, cb = null;
    window.turnstile = {
      render: function (el, o) { cb = o; return 7; },
      execute: function () { ejecutado++; setTimeout(function () { cb.callback('TOKEN-' + ejecutado); }, 1); },
      reset: function () { reseteado++; },
    };
    document.getElementById = function () { return { dataset: {} }; };
    return montarCaptcha();
  }).then(function () {
    titulo('con Turnstile');
    igual('widget montado', captchaId, 7);
    return tokenCaptcha(500);
  }).then(function (t1) {
    igual('primer token', t1, 'TOKEN-1');
    return tokenCaptcha(500);
  }).then(function (t2) {
    igual('segundo token, distinto', t2, 'TOKEN-2');
    window.turnstile.execute = function () { /* Cloudflare no contesta */ };
    var t0 = Date.now();
    return tokenCaptcha(300).then(function (t3) {
      titulo('si Cloudflare no contesta');
      igual('devuelve null', t3, null);
      comprueba('no se queda colgado (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 1500);
      resultado();
    });
  }).catch(function (e) { print('ERROR: ' + e); });
}, 10);
