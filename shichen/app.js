/* 烟火人间 · 浮生十二食辰志（另册）—— 十二辰食候对勘联动 */
(function () {
  "use strict";

  var buttons = Array.prototype.slice.call(document.querySelectorAll(".chen-btn"));
  var panel = {
    chen: document.getElementById("sky-current-chen"),
    mansion: document.getElementById("sky-current-mansion"),
    name: document.getElementById("sky-current-name"),
    desc: document.getElementById("sky-current-desc"),
    rule: document.getElementById("sky-current-rule"),
    detail: document.getElementById("sky-current-detail"),
    modernTitle: document.getElementById("sky-current-modern-title"),
    modernDesc: document.getElementById("sky-current-modern-desc")
  };

  if (!buttons.length || !panel.chen) return;

  /* 星盘上十二辰的原始墨色，切换时辰时先复原再点亮当值 */
  var dialTexts = Array.prototype.slice.call(document.querySelectorAll(".dial-art text")).map(function (el) {
    return {
      el: el,
      fill: el.getAttribute("fill"),
      weight: el.getAttribute("font-weight")
    };
  });

  function highlightDial(hour) {
    dialTexts.forEach(function (item) {
      if (item.fill === null) item.el.removeAttribute("fill");
      else item.el.setAttribute("fill", item.fill);
      if (item.weight === null) item.el.removeAttribute("font-weight");
      else item.el.setAttribute("font-weight", item.weight);
    });
    dialTexts.forEach(function (item) {
      if (item.el.textContent.trim().indexOf(hour + " · ") === 0) {
        item.el.setAttribute("fill", "#ffcf7a");
        item.el.setAttribute("font-weight", "700");
      }
    });
  }

  function activate(btn) {
    if (!btn) return;
    buttons.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });

    var data = btn.dataset;
    var mansion = (data.mansion || "").split("·").map(function (s) { return s.trim(); });

    panel.chen.textContent = data.shichen + "时 · " + (mansion[0] || "");
    panel.mansion.textContent = "宿度：" + (mansion[1] || "") + " · 官历对勘";
    panel.name.textContent = data.shichen + "时食候 · " + (data.title || "");
    panel.desc.textContent = data.desc || "";
    panel.rule.textContent = data.rule || "";
    panel.detail.textContent = data.detail || "";
    panel.modernTitle.textContent = data.moderntitle || "今日市井烟火";
    panel.modernDesc.textContent = data.modern || data.desc || "";

    highlightDial(data.shichen);
  }

  var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () { activate(btn); });
    btn.addEventListener("focus", function () { activate(btn); });
    if (canHover) {
      btn.addEventListener("mouseenter", function () { activate(btn); });
    }
  });

  /* 方向键在十二辰之间移步 */
  var grid = document.querySelector(".chen-grid");
  if (grid) {
    grid.addEventListener("keydown", function (event) {
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      var next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      if (next !== index) {
        event.preventDefault();
        buttons[next].focus();
        activate(buttons[next]);
      }
    });
  }

  var initial = buttons.filter(function (b) { return b.classList.contains("is-active"); })[0] || buttons[2] || buttons[0];
  activate(initial);

  /* 窄屏时表格转为卡片：为每个单元格补上列名 */
  var ledgerTable = document.querySelector(".ledger table");
  if (ledgerTable && ledgerTable.tHead && ledgerTable.tBodies[0]) {
    var shortLabels = {
      "宋代食宪考述（《食货志》）": "宋人考述",
      "市井物候景象（《东京梦华录》）": "市井景象",
      "今世烟火映射（街巷实存）": "今世烟火"
    };
    var headers = Array.prototype.map.call(ledgerTable.tHead.rows[0].cells, function (cell) {
      return cell.textContent.trim();
    });
    Array.prototype.forEach.call(ledgerTable.tBodies[0].rows, function (row) {
      Array.prototype.forEach.call(row.cells, function (cell, index) {
        if (headers[index]) cell.setAttribute("data-label", shortLabels[headers[index]] || headers[index]);
      });
    });
  }

  /* 卷目随滚动点亮 */
  var links = Array.prototype.slice.call(document.querySelectorAll(".head-nav a"));
  var sections = links.map(function (link) {
    return document.querySelector(link.getAttribute("href"));
  }).filter(Boolean);

  var ticking = false;
  function updateNav() {
    var line = window.scrollY + window.innerHeight * 0.3;
    var current = sections[0];
    sections.forEach(function (section) {
      var top = section.getBoundingClientRect().top + window.scrollY;
      if (top <= line) current = section;
    });
    if (!current) return;
    links.forEach(function (link) {
      link.classList.toggle("is-current", link.getAttribute("href") === "#" + current.id);
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      updateNav();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  updateNav();
})();
