/* =====================================================
   TKL-OEE - CLEAN LIVE HEADER JS
   Menyembunyikan elemen jam LIVE / tanggal jika dibuat dinamis
   ===================================================== */

(function () {
  const LIVE_TEXT_REGEX = /\bLIVE\b/i;
  const TIME_REGEX = /\d{1,2}[:.]\d{2}([:.]\d{2})?/;
  const DATE_REGEX = /(senin|selasa|rabu|kamis|jumat|sabtu|minggu)/i;

  function shouldHide(el) {
    if (!el) return false;

    // Jangan sentuh bottom navigation mobile
    if (el.closest && el.closest("#mobileBottomNav")) return false;

    const text = (el.innerText || el.textContent || "").trim();

    if (!text) return false;

    // Hanya elemen kecil/pendek agar tidak salah sembunyikan konten besar
    if (text.length > 120) return false;

    const hasLive = LIVE_TEXT_REGEX.test(text);
    const hasTime = TIME_REGEX.test(text);
    const hasDate = DATE_REGEX.test(text);

    // Kombinasi yang paling mungkin sebagai header live clock
    if (hasLive && hasTime) return true;
    if (hasLive && hasDate) return true;
    if (hasTime && hasDate) return true;

    // Kalau hanya kata LIVE tapi elemen sangat pendek
    if (hasLive && text.length <= 20) return true;

    return false;
  }

  function hideElement(el) {
    if (!el) return;

    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function clean() {
    const candidates = document.querySelectorAll(
      "body, body *"
    );

    candidates.forEach(function (el) {
      if (!el || el.nodeType !== 1) return;

      // Jangan sembunyikan elemen yang sudah disembunyikan berulang kali
      if (el.dataset.cleanLiveHidden === "1") return;

      if (shouldHide(el)) {
        hideElement(el);
        el.dataset.cleanLiveHidden = "1";
      }
    });
  }

  function init() {
    clean();

    // Bersihkan ulang saat DOM berubah
    const observer = new MutationObserver(function () {
      clean();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Tambahan: bersihkan berkala untuk update jam
    setInterval(clean, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();