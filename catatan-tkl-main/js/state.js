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

  // Mode Input Cepat (lihat js/quickmode.js)
  // inputMode: 'normal' | 'cepat1' | 'cepat2'
  // activeProducts: array nama produk aktif (dari Master Produk) yang dipakai
  //                 sebagai fokus pengisian pada Mode Cepat 1 / Mode Cepat 2.
  let inputMode = 'normal';
  let quickActiveProducts = [];
  let defaultWO = '';          // "WO default" dari Wizard Setup — auto-isi ke baris baru

  // Cache elemen DOM (akan di-inisialisasi setelah DOMContentLoaded)
  const el = {};

  const initElements = () => {
    const ids = [
      'loginOverlay', 'loginForm', 'loginEmail', 'loginPassword', 'loginBtn', 'loginError', 'loginOfflineNote',
      'appContainer', 'pos', 'hint', 'lastSaved', 'syncStatus',
      'shiftIndicator', 'shiftIndicatorText', 'oeeIndicator', 'oeeIndicatorValue',
      'toolbarToggle', 'toolbarToggleIcon', 'toolbarBody', 'screenNav',
      'logsheetHelpBtn', 'logsheetHelpPanel',
      'viewModeToggle', 'tblWrap',
      'colToggleHead', 'colToggleIcon', 'colToggleBar',
      'formPanel', 'fpPrev', 'fpNext', 'fpNavLabel',
      'fpKode', 'fpMulai', 'fpKegiatan', 'fpGood', 'fpDefect', 'fpSave',
      'formFullPanel', 'ffPrev', 'ffNext', 'ffNavLabel', 'ffSave', 'ffDelete',
      'ffKode', 'ffMulai', 'ffPanggil', 'ffTeknik', 'ffSelesai', 'ffDurasi',
      'ffKegiatan', 'ffMasalah', 'ffDisposisi', 'ffWo', 'ffBatch', 'ffGood', 'ffDefect',
      'fDate', 'fLine', 'fStage',
      'sheetUnifiedControl', 'sheetShift', 'sheetLine', 'sheetDateTrigger', 'sheetDateText',
      'sheetKpiA', 'sheetKpiP', 'sheetKpiQ', 'sheetKpiOEE',
      'op1','op2','op3','op4','op5','op6',
      'prodName1','prodRate1','prodWo1','prodName2','prodRate2','prodWo2','prodName3','prodRate3','prodWo3',
      'thProd1','thProd2','thProd3',
      'tbody', 'tbodyProdDetail', 'btnAdd', 'btnSave', 'btnReset', 'btnLogout',
      'btnPrint', 'printArea', 'presetQuick', 'presetFull',
      'btnWizard', 'wizardOverlay', 'wizardModal',
      'dashFrom', 'dashTo', 'dashLine', 'dashShift', 'dashStage', 'dashProduct', 'dashOperator',
      'dashApply', 'dashReset', 'dashRefresh', 'dashExport', 'dashStatus', 'dashChart', 'dashTbody',
      'dashOeeStatus', 'dashKpiOee', 'dashTargetOee', 'dashOeeGap', 'dashKpiA', 'dashKpiAInfo',
      'dashKpiP', 'dashKpiPInfo', 'dashKpiQ', 'dashKpiQInfo', 'dashKpiOutput', 'dashKpiDefect',
      'dashKpiDt', 'dashKpiDtSplit', 'dashOeeDonut', 'dashStatusDonut', 'dashStatusLegend',
      'dashCompA', 'dashCompP', 'dashCompQ', 'dashRecordCount', 'dashCodeSummary', 'dashChartSwitch',
      'dashCodeSwitch', 'dashZoom', 'dashZoomText', 'dashSearch', 'dashPageInfo', 'dashPagination', 'dashTableHint',
      'pwa-install-btn',
      'clock', 'dateEl', 'rincSub',
      'maxShiftMnt', 'maxShiftMnt2',
      'totalDurasi', 'sumDur', 'rowN',
      'oA','oB','oC','oD','oE','oF',
      'oG1','oG2','oG3','oH1','oH2','oH3',
      'oI1','oI2','oI3','oITotal','badgeAvgP',
      'oJ','oK','oL','oM','oee','diag','toast',
      'qmOverlay', 'qmModal',
      'bulkOverlay', 'bulkModal',
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
    get inputMode()          { return inputMode; },
    set inputMode(v)         { inputMode = v; },
    get quickActiveProducts(){ return quickActiveProducts; },
    set quickActiveProducts(v){ quickActiveProducts = v; },
    get defaultWO()       { return defaultWO; },
    set defaultWO(v)      { defaultWO = v; },

    // DOM cache
    el,
    initElements,
  };
})();
