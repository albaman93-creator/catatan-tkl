/**
 * SHEET-PRODUCT-WO-SYNC.JS
 * Produk + No. WO ringkas pada baris kontrol halaman Sheet.
 * Produk mengambil pilihan dari Master Produk; saat produk cocok dengan
 * master, No. WO otomatis mengikuti No. WO produk tersebut, tetapi tetap
 * bisa diedit manual.
 */
(function () {
  'use strict';

  const productInput = () => State.el.sheetProductName;
  const woInput = () => State.el.sheetWo;
  const list = () => State.el.sheetProductList;

  const masterProducts = () => [
    { name: State.el.prodName1?.value?.trim() || '', wo: State.el.prodWo1?.value?.trim() || '' },
    { name: State.el.prodName2?.value?.trim() || '', wo: State.el.prodWo2?.value?.trim() || '' },
    { name: State.el.prodName3?.value?.trim() || '', wo: State.el.prodWo3?.value?.trim() || '' },
  ].filter(p => p.name);

  const refreshList = () => {
    const dl = list();
    if (!dl) return;
    dl.innerHTML = '';
    masterProducts().forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      dl.appendChild(opt);
    });
  };

  const syncWOFromProduct = () => {
    const p = productInput();
    const w = woInput();
    if (!p || !w) return;
    const found = masterProducts().find(x => x.name.toLowerCase() === p.value.trim().toLowerCase());
    if (found) w.value = found.wo || '';
    p.classList.toggle('filled', !!p.value.trim());
    w.classList.toggle('filled', !!w.value.trim());
  };

  const bind = () => {
    const p = productInput();
    const w = woInput();
    if (!p || !w) return;

    p.addEventListener('input', () => {
      syncWOFromProduct();
      if (typeof Storage !== 'undefined') Storage.autoSaveLocal?.();
    });
    p.addEventListener('change', syncWOFromProduct);
    w.addEventListener('input', () => {
      w.value = w.value.replace(/[^A-Za-z0-9._/-]/g, '');
      w.classList.toggle('filled', !!w.value.trim());
      if (typeof Storage !== 'undefined') Storage.autoSaveLocal?.();
    });

    refreshList();
    syncWOFromProduct();

    // Master Produk dapat berubah dari wizard/section Produk.
    setInterval(() => refreshList(), 700);
  };

  document.addEventListener('DOMContentLoaded', bind);
})();
