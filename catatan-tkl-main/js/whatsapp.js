/**
 * WHATSAPP.JS — Kirim laporan OEE ke WhatsApp (gratis via wa.me)
 *
 * Tidak pakai WhatsApp Business API. Hanya membuka chat WhatsApp
 * dengan teks laporan sudah terisi. User pilih kontak/grup sendiri.
 * Nomor default bisa disimpan di localStorage (opsional).
 */
const WhatsApp = (() => {
  'use strict';

  const LS_PHONE = 'TKL_WA_DEFAULT_PHONE';
  const LS_NAME  = 'TKL_WA_DEFAULT_NAME';

  const txt = (id) => {
    const el = State?.el?.[id];
    return el ? String(el.textContent || el.value || '').trim() : '';
  };

  const val = (id) => {
    const el = State?.el?.[id];
    return el ? String(el.value || '').trim() : '';
  };

  const loadPhone = () => {
    try { return localStorage.getItem(LS_PHONE) || ''; } catch (_) { return ''; }
  };
  const loadName = () => {
    try { return localStorage.getItem(LS_NAME) || ''; } catch (_) { return ''; }
  };
  const savePhone = (phone, name) => {
    try {
      localStorage.setItem(LS_PHONE, String(phone || '').replace(/\D/g, ''));
      if (name != null) localStorage.setItem(LS_NAME, String(name || ''));
    } catch (_) {}
  };

  /** Normalisasi nomor: 08xxx → 628xxx, hilangkan non-digit */
  const normPhone = (raw) => {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) d = '62' + d.slice(1);
    if (d.startsWith('8') && d.length >= 9) d = '62' + d;
    return d;
  };

  const buildReport = () => {
    const date = val('fDate') || txt('sheetDateText') || new Date().toLocaleDateString('id-ID');
    const shift = (State.evalShift != null ? State.evalShift + 1 : '?');
    const line = val('fLine') || '—';
    const stage = val('fStage') || '—';
    const stageLabel = stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '—';

    const oee = txt('oee') || '—';
    const avail = txt('oF') || '—';
    const perf = txt('oITotal') || '—';
    const quality = txt('oM') || '—';
    const good = txt('oL') || '0';
    const defect = txt('oK') || '0';
    const totalOut = txt('oJ') || '0';
    const totalDur = txt('totalDurasi') || '0';
    const maxShift = CONFIG?.SHIFT_A?.[State.evalShift] ?? '—';

    // Planned / Unplanned singkat
    const planned = txt('oB') || '0';
    const unplanned = txt('oD') || '0';

    const lines = [
      `*📊 Laporan OEE — Catatan TKL*`,
      ``,
      `📅 Tanggal : ${date}`,
      `⏰ Shift   : S${shift}`,
      `🏭 Line    : ${line}`,
      `🔧 Tahapan : ${stageLabel}`,
      ``,
      `*Hasil OEE*`,
      `• OEE          : ${oee}`,
      `• Availability : ${avail}%`,
      `• Performance  : ${perf}%`,
      `• Quality      : ${quality}%`,
      ``,
      `*Output*`,
      `• Good   : ${good}`,
      `• Defect : ${defect}`,
      `• Total  : ${totalOut}`,
      ``,
      `*Durasi*`,
      `• Tercatat : ${totalDur} mnt / ${maxShift} mnt`,
      `• Planned DT  : ${planned} mnt`,
      `• Unplanned DT: ${unplanned} mnt`,
      ``,
      `_Dikirim dari aplikasi Catatan TKL_`,
    ];
    return lines.join('\n');
  };

  const openWa = (phone, text) => {
    const encoded = encodeURIComponent(text);
    const p = normPhone(phone);
    const url = p
      ? `https://wa.me/${p}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const closeModal = () => {
    const ov = document.getElementById('waOverlay');
    if (ov) ov.classList.add('hide');
  };

  const renderModal = () => {
    let ov = document.getElementById('waOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'waOverlay';
      ov.className = 'qm-overlay hide';
      ov.innerHTML = `<div class="qm-modal bulk-modal" id="waModal" style="max-width:420px"></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    }
    const modal = document.getElementById('waModal');
    const phone = loadPhone();
    const name = loadName();
    const preview = buildReport();

    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">💬</span> Kirim ke WhatsApp</h3>
          <p class="qm-sub">Gratis via link wa.me — tidak pakai API berbayar.</p>
        </div>
        <button type="button" class="bf-x" data-wa="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:0 16px 12px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Nomor tujuan (opsional)</label>
        <input type="tel" id="waPhone" inputmode="tel" placeholder="08xxxxxxxxxx atau kosongkan"
          value="${phone ? (phone.startsWith('62') ? '0' + phone.slice(2) : phone) : ''}"
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border, #ccc);font-size:15px;box-sizing:border-box">
        <input type="text" id="waName" placeholder="Label (opsional, mis. Grup Shift)"
          value="${name.replace(/"/g, '&quot;')}"
          style="width:100%;padding:8px 12px;margin-top:6px;border-radius:10px;border:1px solid var(--border, #ccc);font-size:13px;box-sizing:border-box">
        <p style="font-size:11px;opacity:.7;margin:6px 0 0">Kosongkan nomor = pilih kontak manual di WhatsApp.</p>
      </div>
      <div style="padding:0 16px 12px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Preview pesan</label>
        <textarea id="waPreview" rows="12" readonly
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border, #ccc);font-size:12px;font-family:inherit;line-height:1.45;resize:vertical;box-sizing:border-box;background:var(--bg-soft, #f8f8f8)">${preview.replace(/</g, '&lt;')}</textarea>
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-ghost" data-wa="close">Batal</button>
          <button type="button" class="btn btn-primary" data-wa="send">💬 Buka WhatsApp</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-wa="close"]').forEach(b => b.addEventListener('click', closeModal));
    modal.querySelector('[data-wa="send"]')?.addEventListener('click', () => {
      const phoneEl = document.getElementById('waPhone');
      const nameEl = document.getElementById('waName');
      const previewEl = document.getElementById('waPreview');
      const p = phoneEl ? phoneEl.value.trim() : '';
      const n = nameEl ? nameEl.value.trim() : '';
      savePhone(p, n);
      const text = previewEl ? previewEl.value : buildReport();
      openWa(p, text);
      closeModal();
      if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast(p ? 'Membuka WhatsApp…' : 'Pilih kontak di WhatsApp…');
      }
    });

    ov.classList.remove('hide');
    setTimeout(() => document.getElementById('waPhone')?.focus(), 80);
  };

  /** Kirim langsung tanpa modal (pakai nomor tersimpan / kosong) */
  const sendQuick = () => {
    openWa(loadPhone(), buildReport());
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(loadPhone() ? 'Membuka WhatsApp…' : 'Pilih kontak di WhatsApp…');
    }
  };

  const open = () => {
    // Pastikan angka OEE terbaru
    try { if (typeof Calculation !== 'undefined') Calculation.recalc(); } catch (_) {}
    renderModal();
  };

  const bind = () => {
    const btn = document.getElementById('btnWhatsApp');
    if (btn) btn.addEventListener('click', open);
  };

  return { open, sendQuick, buildReport, bind, savePhone, loadPhone };
})();
