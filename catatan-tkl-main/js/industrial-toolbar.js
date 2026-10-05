/* =====================================================
   TKL-OEE - INDUSTRIAL TOOLBAR JS
   Memasang branding ke toolbar atas
   dan membuang bagian bawah (hero jam/LIVE/tanggal)
   ===================================================== */

(function () {
  const TOOLBAR_SELECTORS = [
    "#toolbar",
    ".toolbar",
    "header.toolbar",
    ".topbar",
    "header"
  ];

  const HERO_SELECTORS = [
    ".dashboard-hero",
    ".hero",
    ".oee-hero",
    ".industrial-hero",
    ".dashboard-header",
    ".header-live",
    ".clock-header",
    ".oee-header-hero",
    ".banner-live",
    ".industrial-banner"
  ];

  const LIVE_REGEX = /\bLIVE\b/i;
  const TIME_REGEX = /\d{1,2}[:.]\d{2}([:.]\d{2})?/;

  function findToolbar() {
    for (let i = 0; i < TOOLBAR_SELECTORS.length; i++) {
      const el = document.querySelector(TOOLBAR_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function applyToolbar() {
    const toolbar = findToolbar();
    if (!toolbar) return;

    toolbar.classList.add("industrial-toolbar");

    // Pasang branding hanya sekali
    if (!toolbar.querySelector(".it-inner")) {
      const inner = document.createElement("div");
      inner.className = "it-inner";
      inner.innerHTML =
        '<div class="it-logo">TKL</div>' +
        '<div class="it-text">' +
        '<div class="it-top">TKL-Produksi-OEE 2026 &bull; SYSTEM</div>' +
        '<div class="it-title">LOG SHEET &amp; PERHITUNGAN OEE</div>' +
        '<div class="it-sub">Availability &middot; Performance &middot; Quality &mdash; Overall Equipment Effectiveness</div>' +
        "</div>";

      toolbar.insertBefore(inner, toolbar.firstChild);
    }

    // Pasang zig-zag di bawah toolbar
    if (!toolbar.querySelector(".it-zigzag")) {
      const zig = document.createElement("div");
      zig.className = "it-zigzag";
      toolbar.appendChild(zig);
    }
  }

  function hideHeroBySelector() {
    HERO_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.closest(".industrial-toolbar")) return;
        if (el.id === "mobileBottomNav") return;
        el.style.setProperty("display", "none", "important");
      });
    });
  }

  function hideHeroByText() {
    // Cari elemen yang memuat LIVE + jam/tanggal, lalu sembunyikan
    // container hero-nya (bukan toolbar).
    const all = document.querySelectorAll("div, section, header");

    all.forEach(function (el) {
      if (el.closest(".industrial-toolbar")) return;
      if (el.id === "mobileBottomNav") return;
      if (el.dataset.itHeroHidden === "1") return;

      const text = (el.innerText || "").trim();
      if (!text || text.length > 400) return;

      const hasLive = LIVE_REGEX.test(text);
      const hasTime = TIME_REGEX.test(text);

      if (hasLive && hasTime) {
        // Sembunyikan container terluar yang kecil (hero), bukan body
        let target = el;
        let guard = 0;

        while (
          target.parentElement &&
          target.parentElement !== document.body &&
          guard < 3
        ) {
          target = target.parentElement;
          guard++;
        }

        target.style.setProperty("display", "none", "important");
        target.dataset.itHeroHidden = "1";
      }
    });
  }

  function init() {
    applyToolbar();
    hideHeroBySelector();
    hideHeroByText();

    setInterval(function () {
      applyToolbar();
      hideHeroBySelector();
      hideHeroByText();
    }, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();