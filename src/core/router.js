const TAB_TITLES = {
  home: "资产总览",
  assets: "资产台账",
  analysis: "资产分析",
  notes: "投资复盘"
};

export function activateTab(name) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `${name}-panel`);
  });
  const pageTitle = document.querySelector("#navbar-page-title");
  if (pageTitle) pageTitle.textContent = TAB_TITLES[name] || "资产总览";
}

export function activatePortfolioView(name) {
  document.querySelectorAll(".sub-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.portfolioView === name);
  });
  document.querySelectorAll(".portfolio-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `${name}-portfolio-view`);
  });
  document.querySelector(".portfolio-filter")?.classList.toggle("is-hidden", name !== "open");
}

export function initRouterEvents({ startQuickAsset } = {}) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
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
