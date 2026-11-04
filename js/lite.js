/**
 * LITE.JS — Mode Ringan (dimuat di <head> agar kelas dipasang sebelum halaman digambar)
 * Kunci simpanan 'tkl_lite': '1' = paksa ON · '0' = paksa OFF · kosong = otomatis.
 * Otomatis ON bila perangkat ≤4 core, RAM ≤4 GB, atau pengguna meminta animasi dikurangi.
 * Bisa juga lewat alamat: ?lite=1 · ?lite=0 · ?lite=auto
 */
(function () {
  'use strict';
  var KEY = 'tkl_lite';
  var root = document.documentElement;

  var read = function () {
    try { var v = localStorage.getItem(KEY); return (v === '1' || v === '0') ? v : 'auto'; } catch (e) { return 'auto'; }
  };
  var write = function (m) {
    try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (e) {}
  };
  var autoOn = function () {
    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return cores <= 4 || mem <= 4 || reduce;
  };
  var isOn = function () { var m = read(); return m === '1' || (m === 'auto' && autoOn()); };
  var apply = function () { var on = isOn(); root.classList.toggle('lite', on); return on; };
  var label = function () {
    var m = read(), on = isOn();
    return '⚡ Mode Ringan: ' + (m === 'auto' ? 'Otomatis (' + (on ? 'ON' : 'OFF') + ')' : (m === '1' ? 'ON' : 'OFF'));
  };
  var buttons = function () { return document.querySelectorAll('.lite-toggle'); };
  var refresh = function () { var t = label(); Array.prototype.forEach.call(buttons(), function (b) { b.textContent = t; }); };
  var set = function (m) { write(m); apply(); refresh(); };
  var cycle = function () { var m = read(); set(m === 'auto' ? '1' : (m === '1' ? '0' : 'auto')); };

  try {
    var q = new URLSearchParams(location.search).get('lite');
    if (q === '1' || q === '0' || q === 'auto') write(q);
  } catch (e) {}
  apply();

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.sheet-f'), function (f) {
      var s = document.createElement('span'), b = document.createElement('button');
      b.type = 'button'; b.className = 'lite-toggle'; b.addEventListener('click', cycle);
      s.appendChild(b); f.appendChild(s);
    });
    refresh();
  });

  window.TKLLite = { set: set, cycle: cycle, isOn: isOn };
})();
