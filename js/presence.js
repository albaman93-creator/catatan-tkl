/**
 * PRESENCE.JS
 * Peringatan "sedang dibuka orang lain" untuk shift/line/tahapan yang sama.
 *
 * Memakai Supabase Realtime *Presence* (hanya daftar siapa yang online di
 * ruang itu — BUKAN sinkron isi data). Sangat ringan: satu koneksi per
 * perangkat, hanya pesan kecil saat ada yang masuk/keluar. Tidak butuh tabel.
 * Dimatikan dengan CONFIG.PRESENCE_ENABLED = false. Jika Realtime gagal,
 * aplikasi tetap jalan normal tanpa banner.
 */
const Presence = (() => {
  'use strict';

  const deviceId = (() => {
    try {
      let id = sessionStorage.getItem('tkl_presence_id');
      if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('tkl_presence_id', id); }
      return id;
    } catch (_) { return Math.random().toString(36).slice(2, 10); }
  })();

  let channel = null;
  let roomKey = '';
  let roomLabel = '';
  let tracked = false;

  const myName = () => {
    try {
      const u = typeof Auth !== 'undefined' && Auth.getCurrentUser ? Auth.getCurrentUser() : null;
      const meta = (u && u.user_metadata) || {};
      const raw = meta.full_name || meta.name || (u && u.email ? String(u.email).split('@')[0] : '');
      return String(raw || 'Operator').slice(0, 24);
    } catch (_) { return 'Operator'; }
  };

  // ---------- banner ----------
  const banner = () => {
    let el = document.getElementById('presenceBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'presenceBanner';
    el.className = 'presence-banner';
    el.setAttribute('role', 'status');
    el.hidden = true;
    const anchor = document.querySelector('.sheet-kpi-stack');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
    else document.body.prepend(el);
    return el;
  };

  const render = () => {
    const el = banner();
    if (!channel) { el.hidden = true; return; }
    const state = channel.presenceState() || {};
    const names = [];
    Object.keys(state).forEach((k) => {
      if (k === deviceId) return;
      const m = (state[k] && state[k][0]) || {};
      names.push(m.name || 'Operator');
    });
    if (!names.length) { el.hidden = true; return; }
    const esc = (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml : (s) => String(s);
    const list = [...new Set(names)].map(esc).join(', ');
    el.innerHTML = `👥 <b>${list}</b> juga sedang membuka <b>${esc(roomLabel)}</b>. ` +
      'Pembagian tugas dulu ya — simpan bersamaan bisa saling menimpa.';
    el.hidden = false;
  };

  // ---------- channel ----------
  const track = async () => {
    if (!channel || tracked) return;
    try { await channel.track({ name: myName(), at: Date.now() }); tracked = true; } catch (_) {}
  };
  const untrack = async () => {
    if (!channel || !tracked) return;
    try { await channel.untrack(); } catch (_) {}
    tracked = false;
  };

  const leave = () => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (channel && client) { try { client.removeChannel(channel); } catch (_) {} }
    channel = null; tracked = false; roomKey = '';
    const el = document.getElementById('presenceBanner');
    if (el) el.hidden = true;
  };

  const join = (key, label) => {
    if (typeof CONFIG !== 'undefined' && CONFIG.PRESENCE_ENABLED === false) return;
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    const offline = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    if (!client || offline || !navigator.onLine) { leave(); return; }
    if (channel && key === roomKey) { roomLabel = label || roomLabel; render(); return; }

    leave();
    roomKey = key;
    roomLabel = label || key;
    try {
      const topic = 'tkl-presence:' + key.replace(/[^A-Za-z0-9_-]/g, '_');
      channel = client.channel(topic, { config: { presence: { key: deviceId } } });
      channel
        .on('presence', { event: 'sync' }, render)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !document.hidden) track();
        });
    } catch (e) {
      console.warn('Presence gagal:', e);
      channel = null;
    }
  };

  // Tab/aplikasi tersembunyi (HP di saku) → jangan dianggap "sedang membuka"
  document.addEventListener('visibilitychange', () => {
    if (!channel) return;
    if (document.hidden) untrack(); else track();
  });
  window.addEventListener('offline', leave);
  window.addEventListener('pagehide', leave);

  return { join, leave };
})();
