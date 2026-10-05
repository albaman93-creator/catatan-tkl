/**
 * SHEET-PRODUCT-SYNC.JS
 * Cermin ringkas Produk / Rate / No. WO di barisan kontrol Sheet.
 * Slot 1 selalu tampil; tombol + membuka slot 2 lalu 3.
 * Semua perubahan ditulis ke field Master Produk asli agar alur
 * storage, kalkulasi, dropdown dan sinkronisasi lama tetap digunakan.
 */
(function () {
  'use strict';
  const slots = () => Array.from(document.querySelectorAll('.sheet-product-slot[data-product-slot]'));
  const master = (i, field) => document.getElementById(
    field === 'name' ? 'prodName' + i : field === 'rate' ? 'prodRate' + i : 'prodWo' + i
  );

  const syncFromMaster = () => {
    slots().forEach(slot => {
      const i = slot.dataset.productSlot;
      ['name','rate','wo'].forEach(field => {
        const src = master(i, field), input = slot.querySelector(`[data-field="${field}"]`);
        if (src && input && document.activeElement !== input) input.value = src.value || '';
      });
    });
  };

  const setVisible = (count) => {
    slots().forEach((slot, idx) => { slot.hidden = idx >= count; });
    const add = document.getElementById('sheetProductAdd');
    if (add) add.hidden = count >= 3;
  };

  const initialVisible = () => {
    let count = 1;
    if ((master(2,'name')?.value || '').trim() || (master(2,'rate')?.value || '').trim() || (master(2,'wo')?.value || '').trim()) count = 2;
    if ((master(3,'name')?.value || '').trim() || (master(3,'rate')?.value || '').trim() || (master(3,'wo')?.value || '').trim()) count = 3;
    setVisible(count);
    return count;
  };

  const bind = () => {
    slots().forEach(slot => {
      const i = slot.dataset.productSlot;
      slot.querySelectorAll('.sheet-product-input').forEach(input => {
        input.addEventListener('input', () => {
          const field = input.dataset.field, src = master(i, field);
          if (!src) return;
          src.value = input.value;
          src.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });

    const add = document.getElementById('sheetProductAdd');
    if (add) add.addEventListener('click', () => {
      const visible = slots().filter(s => !s.hidden).length;
      if (visible < 3) {
        setVisible(visible + 1);
        const next = document.querySelector(`.sheet-product-slot[data-product-slot="${visible + 1}"] .sheet-product-name`);
        if (next) { next.focus(); document.getElementById('sheetProductStrip')?.scrollTo({left: document.getElementById('sheetProductStrip').scrollWidth, behavior:'smooth'}); }
      }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.sheet-product-slot')) return;
    bind();
    initialVisible();
    setInterval(syncFromMaster, 500);
  });
})();
