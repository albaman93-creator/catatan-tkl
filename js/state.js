/**
 * STATE.JS
 * Menyimpan state global aplikasi dan cache elemen DOM.
 * Cache DOM di sini agar tidak perlu query ulang di setiap event handler.
 */
const State = (() => {
  'use strict';

  // State
  let navMode = 'v';           // 'v' | 'h'
  let evalShift = 0;           // 0 = S1, 1 = S2, 2 = S3
  let deferredPrompt = null;   // PWA install prompt
  let toastTimer = null;       // timer untuk auto-hide toast

  // Cache elemen DOM (akan di-inisialisasi setelah DOMContentLoaded)
  const el = {};

  const initElements = () => {
    const ids = [
      'loginOverlay', 'loginForm', 'loginPin', 'rememberMe', 'loginError',
      'appContainer', 'pos', 'hint', 'lastSaved', 'syncStatus',
      'fDate', 'fLine', 'fStage',
      'op1','op2','op3','op4','op5','op6',
      'prodName1','prodRate1','prodName2','prodRate2','prodName3','prodRate3',
      'thProd1','thProd2','thProd3',
      'tbody', 'tbodyProdDetail', 'btnAdd', 'btnSave', 'btnReset', 'btnLogout',
      'dbLink', 'pwa-install-btn',
      'clock', 'dateEl', 'rincSub',
      'maxShiftMnt', 'maxShiftMnt2',
      'totalDurasi', 'sumDur', 'rowN',
      'oA','oB','oC','oD','oE','oF',
      'oG1','oG2','oG3','oH1','oH2','oH3',
      'oI1','oI2','oI3','oITotal','badgeAvgP',
      'oJ','oK','oL','oM','oee','diag','toast',
    ];
    ids.forEach(id => { el[id] = document.getElementById(id); });
  };

  return {
    // state
    get navMode()        { return navMode; },
    set navMode(v)       { navMode = v; },
    get evalShift()      { return evalShift; },
    set evalShift(v)     { evalShift = v; },
    get deferredPrompt() { return deferredPrompt; },
    set deferredPrompt(v){ deferredPrompt = v; },
    get toastTimer()     { return toastTimer; },
    set toastTimer(v)    { toastTimer = v; },

    // DOM cache
    el,
    initElements,
  };
})();
