/* La comprobación antirrobots (V14.7): widget nuevo en cada intento, token
 * distinto cada vez, se quita al acabar, y sin Turnstile no bloquea. */
setTimeout(function () {
  titulo('sin Turnstile');
  cargarTurnstile = function () { return Promise.resolve(false); };
  tokenCaptcha().then(function (t) {
    igual('se entra sin token (no bloquea)', t, null);

    var montados = 0, quitados = 0;
    window.turnstile = {
      render: function (el, o) { montados++; var n = montados; setTimeout(function () { o.callback('TOKEN-' + n); }, 1); return n; },
      remove: function () { quitados++; },
    };
    cargarTurnstile = function () { return Promise.resolve(true); };
    document.getElementById = function () { return { dataset: {}, innerHTML: '' }; };
    titulo('con Turnstile');
    return tokenCaptcha().then(function (t1) {
      igual('primer token', t1, 'TOKEN-1');
      return tokenCaptcha();
    }).then(function (t2) {
      igual('segundo token, con widget nuevo', t2, 'TOKEN-2');
      igual('widgets quitados al acabar', quitados, 2);
      resultado();
    });
  }).catch(function (e) { print('ERROR: ' + e); });
}, 10);
