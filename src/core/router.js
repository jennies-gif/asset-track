const TAB_TITLES = {
  home: "资产总览",
  assets: "资产台账",
  analysis: "资产分析",
  notes: "投资复盘"
};

export function activateTab(name) {
  document.querySelectorAll(".tab").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const active = panel.id === `${name}-panel`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  const pageTitle = document.querySelector("#navbar-page-title");
  if (pageTitle) pageTitle.textContent = TAB_TITLES[name] || "资产总览";
}

export function activatePortfolioView(name) {
  document.querySelectorAll(".sub-tab").forEach((button) => {
    const active = button.dataset.portfolioView === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".portfolio-view").forEach((view) => {
    const active = view.id === `${name}-portfolio-view`;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
  document.querySelector(".portfolio-filter")?.classList.toggle("is-hidden", name !== "open");
}

export function initRouterEvents({ startQuickAsset } = {}) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => moveTabFocus(event, ".tab", "tab"));
  });

  const savedSidebarCollapsed = localStorage.getItem("assetTrailSidebarCollapsed") === "true";
  document.body.classList.toggle("sidebar-collapsed", savedSidebarCollapsed);
  document.querySelector("#side-nav-toggle")?.setAttribute("aria-expanded", String(!savedSidebarCollapsed));
  document.querySelector("#side-nav-toggle")?.addEventListener("click", () => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem("assetTrailSidebarCollapsed", String(collapsed));
    document.querySelector("#side-nav-toggle")?.setAttribute("aria-expanded", String(!collapsed));
  });

  document.querySelector(".header-add-button")?.addEventListener("click", () => {
    activateTab("assets");
    startQuickAsset();
  });

  document.querySelectorAll(".sub-tab").forEach((button) => {
    button.addEventListener("click", () => activatePortfolioView(button.dataset.portfolioView));
    button.addEventListener("keydown", (event) => moveTabFocus(event, ".sub-tab", "portfolioView"));
  });

  document.querySelectorAll(".brand, .side-brand").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activateTab("home");
    });
  });

  document.querySelectorAll(".footer-links a[href^='#']").forEach((link) => {
    link.addEventListener("click", () => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target instanceof HTMLDetailsElement) target.open = true;
    });
  });
}

function moveTabFocus(event, selector, dataKey) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll(selector)];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;
  event.preventDefault();
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  nextTab.focus();
  if (dataKey === "tab") activateTab(nextTab.dataset.tab);
  if (dataKey === "portfolioView") activatePortfolioView(nextTab.dataset.portfolioView);
}
