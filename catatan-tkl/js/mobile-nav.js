/* =====================================================
   TKL-OEE - MOBILE BOTTOM NAVIGATION
   STEP 2
   ===================================================== */

(function () {
  const MOBILE_MEDIA = "(max-width: 768px)";

  const PREFERRED_SCREENS = [
    "logsheet",
    "filter",
    "oee"
  ];

  const ICONS = {
    logsheet: "ðŸ“",
    filter: "ðŸ”Ž",
    oee: "ðŸ“ˆ",
    setup: "âš™ï¸",
    dashboard: "ðŸ“Š",
    print: "ðŸ–¨ï¸",
    help: "â“",
    mode: "ðŸ§©",
    bulk: "ðŸ§®"
  };

  function isMobile() {
    return window.matchMedia(MOBILE_MEDIA).matches;
  }

  function getNav() {
    return document.getElementById("mobileBottomNav");
  }

  function getOriginalScreenButtons() {
    const buttons = Array.from(document.querySelectorAll("[data-screen]"));

    return buttons.filter(function (btn) {
      return !btn.closest("#mobileBottomNav");
    });
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      el.offsetParent !== null
    );
  }

  function chooseScreenButtons(buttons) {
    const byScreen = {};

    buttons.forEach(function (btn) {
      const screen = btn.getAttribute("data-screen");
      if (screen && !byScreen[screen]) {
        byScreen[screen] = btn;
      }
    });

    const chosen = [];

    PREFERRED_SCREENS.forEach(function (screen) {
      if (byScreen[screen] && chosen.length < 3) {
        chosen.push(byScreen[screen]);
      }
    });

    if (chosen.length < 3) {
      buttons.forEach(function (btn) {
        if (chosen.length >= 3) return;
        if (!chosen.includes(btn)) {
          chosen.push(btn);
        }
      });
    }

    return chosen;
  }

  function getShortLabel(btn, screen) {
    let label = (btn.textContent || "").trim();

    if (!label) {
      label = screen;
    }

    if (label.length > 10) {
      label = label.slice(0, 10).trim() + "â€¦";
    }

    return label;
  }

  function getSaveButton() {
    const knownSelectors = [
      "#btnSave",
      "#saveBtn",
      "[data-action='save']",
      "button[data-action='save']"
    ];

    for (let i = 0; i < knownSelectors.length; i++) {
      const el = document.querySelector(knownSelectors[i]);
      if (el) return el;
    }

    const allButtons = Array.from(document.querySelectorAll("button"));

    return allButtons.find(function (btn) {
      const text = (btn.textContent || "").trim().toLowerCase();
      return text.includes("simpan") || text.includes("save");
    });
  }

  function setActive(screen) {
    const nav = getNav();
    if (!nav) return;

    const items = nav.querySelectorAll(".mbn-btn[data-screen]");

    items.forEach(function (item) {
      if (item.getAttribute("data-screen") === screen) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  function buildBottomNav() {
    const nav = getNav();
    if (!nav) return;

    nav.innerHTML = "";

    const screenButtons = getOriginalScreenButtons();
    const chosenScreens = chooseScreenButtons(screenButtons);

    chosenScreens.forEach(function (originalBtn) {
      const screen = originalBtn.getAttribute("data-screen");
      if (!screen) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mbn-btn";
      btn.setAttribute("data-screen", screen);

      const icon = ICONS[screen] || "â€¢";
      const label = getShortLabel(originalBtn, screen);

      btn.innerHTML =
        '<span class="mbn-icon">' + icon + "</span>" +
        '<span class="mbn-label">' + label + "</span>";

      btn.addEventListener("click", function () {
        originalBtn.click();
        setActive(screen);
      });

      nav.appendChild(btn);
    });

    const saveTarget = getSaveButton();

    if (saveTarget) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "mbn-btn mbn-save";

      saveBtn.innerHTML =
        '<span class="mbn-icon">ðŸ’¾</span>' +
        '<span class="mbn-label">Simpan</span>';

      saveBtn.addEventListener("click", function () {
        saveTarget.click();
      });

      nav.appendChild(saveBtn);
    }

    nav.dataset.built = "1";
  }

  function shouldShowBottomNav() {
    if (!isMobile()) return false;

    const screenButtons = getOriginalScreenButtons();
    if (!screenButtons.length) return false;

    const anyVisible = screenButtons.some(function (btn) {
      return isVisible(btn);
    });

    return anyVisible;
  }

  function updateBottomNav() {
    const nav = getNav();
    if (!nav) return;

    if (shouldShowBottomNav()) {
      if (!nav.dataset.built || nav.childElementCount === 0) {
        buildBottomNav();
      }

      nav.classList.add("show");
      document.body.classList.add("has-mobile-bottom-nav");
    } else {
      nav.classList.remove("show");
      document.body.classList.remove("has-mobile-bottom-nav");
    }
  }

  function syncActiveFromOriginalButtons() {
    const screenButtons = getOriginalScreenButtons();

    const activeBtn = screenButtons.find(function (btn) {
      return (
        btn.classList.contains("active") ||
        btn.getAttribute("aria-selected") === "true" ||
        btn.classList.contains("is-active")
      );
    });

    if (activeBtn) {
      setActive(activeBtn.getAttribute("data-screen"));
    }
  }

  function init() {
    updateBottomNav();

    setInterval(updateBottomNav, 700);

    window.addEventListener("resize", function () {
      updateBottomNav();
      syncActiveFromOriginalButtons();
    });

    document.addEventListener(
      "click",
      function (event) {
        const originalBtn = event.target.closest("[data-screen]");

        if (!originalBtn) return;
        if (originalBtn.closest("#mobileBottomNav")) return;

        const screen = originalBtn.getAttribute("data-screen");

        setTimeout(function () {
          setActive(screen);
        }, 50);
      },
      true
    );

    setTimeout(syncActiveFromOriginalButtons, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();