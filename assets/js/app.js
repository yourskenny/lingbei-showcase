/* 等一碗 — 交互
 * 原生 JavaScript，无第三方库。
 * 核心循环：排队 → 听两句 / 看表 → 点单 → 得到一张过早签。
 */
(function () {
  "use strict";

  var D = window.DENGYI;
  if (!D) return;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var els = {
    strip: $("#strip"),
    dialog: $("#dialog"),
    clock: $("#clock"),
    dots: $("#dots"),
    queueCount: $("#queueCount"),
    menuGrid: $("#menuGrid"),
    neighborGrid: $("#neighborGrid"),
    heardCount: $("#heardCount"),
    heardNote: $("#heardNote"),
    clear: $("#clearProgress"),
    head: $("#siteHead")
  };

  /* ---------- 本地存档 ---------- */
  function emptyStore() { return { heard: [], last: null }; }

  function loadStore() {
    try {
      var raw = localStorage.getItem(D.storeKey);
      if (!raw) return emptyStore();
      var parsed = JSON.parse(raw);
      var ids = D.people.map(function (p) { return p.id; });
      return {
        heard: Array.isArray(parsed.heard) ? parsed.heard.filter(function (id) { return ids.indexOf(id) > -1; }) : [],
        last: parsed.last || null
      };
    } catch (err) {
      return emptyStore();
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(D.storeKey, JSON.stringify(store));
    } catch (err) { /* file:// 或隐私模式下静默降级为内存状态 */ }
  }

  var store = loadStore();

  var state = {
    index: 0,
    clock: D.startTime,
    phase: "person", // person | listen | skip | order | ticket
    order: null,
    finished: false
  };

  /* ---------- 工具 ---------- */
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function formatTime(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
  function today() {
    var d = new Date();
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate());
  }
  function scrollBehavior() { return reduceMotion ? "auto" : "smooth"; }

  function currentPerson() { return D.people[state.index] || null; }
  function isHeard(id) { return store.heard.indexOf(id) > -1; }

  /* ---------- 时钟 ---------- */
  function updateClock(animate) {
    els.clock.textContent = formatTime(state.clock);
    els.clock.setAttribute("datetime", formatTime(state.clock));
    if (animate) {
      els.clock.classList.remove("is-tick");
      void els.clock.offsetWidth;
      els.clock.classList.add("is-tick");
    }
  }

  /* ---------- 队伍 ---------- */
  function renderStrip() {
    var html = D.people.map(function (p, i) {
      var cls = "ticket";
      var tag = "";
      if (state.finished || i < state.index) cls += " is-done";
      if (!state.finished && i === state.index) { cls += " is-current"; tag = '<span class="t-tag">现在</span>'; }
      return (
        '<div class="' + cls + '" role="listitem" aria-label="' + p.no + '号，' + p.name + '">' +
          tag +
          '<span class="t-no">' + p.no + '</span>' +
          '<svg class="t-icon" aria-hidden="true" focusable="false"><use href="#i-' + p.icon + '"></use></svg>' +
          '<span class="t-who">' + p.short + '</span>' +
        '</div>'
      );
    }).join("");

    var youCls = "ticket is-you" + (state.finished ? " is-current" : "");
    html +=
      '<div class="' + youCls + '" role="listitem" aria-label="12号，你">' +
        '<span class="t-no">12</span>' +
        '<svg class="t-icon" aria-hidden="true" focusable="false"><use href="#i-bowl"></use></svg>' +
        '<span class="t-who">你</span>' +
      '</div>';

    els.strip.innerHTML = html;

    if (!state.finished) {
      var cur = $(".ticket.is-current", els.strip);
      var wrap = $(".strip-wrap");
      if (cur && wrap && wrap.scrollWidth > wrap.clientWidth) {
        var left = cur.offsetLeft - wrap.clientWidth / 2 + cur.offsetWidth / 2;
        wrap.scrollTo({ left: Math.max(0, left), behavior: scrollBehavior() });
      }
    }

    els.queueCount.textContent = state.finished
      ? "轮到你了"
      : "前面还有 " + (D.people.length - state.index) + " 位";
  }

  function renderDots() {
    els.dots.innerHTML = D.people.map(function (p, i) {
      var cls = i < state.index || state.finished ? "done" : (i === state.index ? "current" : "");
      return '<span class="' + cls + '"></span>';
    }).join("");
  }

  /* ---------- 对话 ---------- */
  function dialogHead(p) {
    return (
      '<div class="dialog-top">' +
        '<span class="dialog-no">' + p.no + '</span>' +
        '<span class="dialog-name">' + p.name + '</span>' +
        '<span class="dialog-order">' + p.order + '</span>' +
      '</div>'
    );
  }

  function renderDialog(animate) {
    var p = currentPerson();
    var html = "";

    if (state.phase === "person" && p) {
      html = dialogHead(p) +
        '<p class="dialog-quote">' + p.quote + '</p>' +
        '<div class="dialog-actions">' +
          '<button class="choice choice--listen" type="button" data-act="listen">听两句 <small>+3 分钟</small></button>' +
          '<button class="choice" type="button" data-act="skip">看表，先走 <small>+2 分钟</small></button>' +
        '</div>';
    } else if (state.phase === "listen" && p) {
      html = dialogHead(p) +
        '<p class="dialog-quote">' + p.quote + '</p>' +
        '<p class="dialog-body"><b>你多站了一会儿。</b> ' + p.story + '<br><b>' + p.heardLine + '</b></p>' +
        '<div class="dialog-actions">' +
          '<button class="choice choice--next" type="button" data-act="next">记下了，往前挪 <span class="arrow" aria-hidden="true">→</span> <small>+2 分钟</small></button>' +
        '</div>';
    } else if (state.phase === "skip" && p) {
      html = dialogHead(p) +
        '<p class="dialog-quote">' + p.quote + '</p>' +
        '<p class="dialog-body">' + p.skipLine + ' 你低头看了一眼手机，队伍又往前挪了一点。</p>' +
        '<div class="dialog-actions">' +
          '<button class="choice choice--next" type="button" data-act="next">往前挪 <span class="arrow" aria-hidden="true">→</span> <small>+2 分钟</small></button>' +
        '</div>';
    } else if (state.phase === "order") {
      html =
        '<div class="dialog-top">' +
          '<span class="dialog-no">12</span>' +
          '<span class="dialog-name">你</span>' +
          '<span class="dialog-order">' + formatTime(state.clock) + '</span>' +
        '</div>' +
        '<h3 class="order-title">老板把笊篱往锅边一磕：<br>“吃么斯？”</h3>' +
        '<p class="order-sub">' + (state.clock > D.deadline ? "已经过了六点三十五。反正都迟了，先吃碗热的。" : "还来得及。挑一碗，坐下吃。") + '</p>' +
        '<div class="order-grid" role="group" aria-label="选择你的过早">' +
          D.menu.map(function (m) {
            return '<button class="order-btn" type="button" data-act="order" data-id="' + m.id + '">' +
              '<span class="o-no">' + m.no + '</span>' +
              '<span class="o-name">' + m.name + '</span>' +
              '<span class="o-price">' + m.price + ' 元</span>' +
            '</button>';
          }).join("") +
        '</div>';
    } else if (state.phase === "ticket") {
      html = renderTicket();
    }

    els.dialog.innerHTML = html;

    if (state.phase === "ticket") {
      els.dialog.classList.add("is-swapping");
      els.dialog.classList.remove("is-enter");
      void els.dialog.offsetWidth;
      els.dialog.classList.remove("is-swapping");
      els.dialog.classList.add("is-enter");
    } else if (animate) {
      els.dialog.classList.remove("is-enter");
      void els.dialog.offsetWidth;
      els.dialog.classList.add("is-enter");
    }

    if (animate) {
      window.requestAnimationFrame(function () {
        try { els.dialog.focus({ preventScroll: true }); } catch (err) { els.dialog.focus(); }
      });
    }
  }

  function renderTicket() {
    var m = D.menu.filter(function (x) { return x.id === state.order; })[0] || D.menu[0];
    var n = store.heard.length;
    var late = state.clock > D.deadline;
    var ending = D.endings[n] || D.endings[0];
    var waited = state.clock - D.startTime;
    var when = formatTime(state.clock);

    return (
      '<div class="receipt-wrap">' +
        '<article class="receipt" aria-label="你的过早签">' +
          '<div class="receipt-head">' +
            '<b>等一碗</b>' +
            '<span>过早签<br>武昌 · 得胜桥</span>' +
          '</div>' +
          '<div class="receipt-no"><em>NO.</em><strong>012</strong><em>' + today() + '</em></div>' +
          '<dl class="receipt-rows">' +
            '<div><dt>轮到你了</dt><dd>' + when + '</dd></div>' +
            '<div><dt>前面的人</dt><dd>5 位</dd></div>' +
            '<div><dt>听过的故事</dt><dd>' + n + ' 段</dd></div>' +
            '<div><dt>等位时长</dt><dd>' + waited + ' 分钟</dd></div>' +
            '<div><dt>你的过早</dt><dd>' + m.name + ' · ' + m.price + ' 元</dd></div>' +
          '</dl>' +
          '<div class="receipt-ending">' +
            '<strong>' + (late ? when + "，你迟到了。" : when + "，你赶上了。") + '</strong>' +
            '<strong>' + ending.title + '</strong>' +
            '<p>' + ending.note + '</p>' +
            '<p>' + m.line + '</p>' +
          '</div>' +
          '<div class="receipt-foot"><span>等一碗 · 故事纯属虚构</span><span>谢谢光临</span></div>' +
        '</article>' +
      '</div>' +
      '<div class="receipt-actions">' +
        '<button class="btn btn-primary" type="button" data-act="restart">再排一次 <span class="arrow" aria-hidden="true">↻</span></button>' +
        '<button class="btn btn-ghost" type="button" data-act="save">存下这张签 <span aria-hidden="true">↓</span></button>' +
        '<a class="btn btn-ghost" href="#neighbors">去街坊看看</a>' +
      '</div>'
    );
  }

  /* ---------- 存下过早签（canvas，无第三方库） ---------- */
  function wrapText(ctx, text, x, y, maxW, lineH) {
    var line = "";
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        line = text[i];
        y += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
    return y;
  }

  function saveTicket(btn) {
    var m = D.menu.filter(function (x) { return x.id === state.order; })[0] || D.menu[0];
    var n = store.heard.length;
    var late = state.clock > D.deadline;
    var ending = D.endings[n] || D.endings[0];
    var waited = state.clock - D.startTime;
    var W = 760, H = 1160, S = 2;
    var c = document.createElement("canvas");
    c.width = W * S;
    c.height = H * S;
    var x = c.getContext("2d");
    if (!x) return;
    x.scale(S, S);
    var serif = '"Songti SC", "STSong", "Noto Serif CJK SC", serif';
    var sans = '"PingFang SC", "Microsoft YaHei", sans-serif';

    x.fillStyle = "#F2E7D3";
    x.fillRect(0, 0, W, H);
    x.fillStyle = "#FFFAF0";
    x.fillRect(40, 40, W - 80, H - 80);
    x.fillStyle = "#BE3A26";
    x.fillRect(40, 40, W - 80, 9);

    x.textAlign = "left";
    x.fillStyle = "#1F211C";
    x.font = "700 34px " + serif;
    x.fillText("等一碗", 82, 128);
    x.font = "13px " + sans;
    x.fillStyle = "#4B4A3F";
    x.fillText("DĚNG YĪ WǍN · 武 昌 得 胜 桥", 82, 156);

    x.textAlign = "right";
    x.fillText("过 早 签", W - 82, 118);
    x.fillText("06:12 / 晴", W - 82, 142);

    x.textAlign = "left";
    x.strokeStyle = "#1F211C";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(82, 180);
    x.lineTo(W - 82, 180);
    x.stroke();

    x.fillStyle = "#4B4A3F";
    x.font = "14px " + sans;
    x.fillText("NO.", 82, 222);
    x.fillStyle = "#1F211C";
    x.font = "700 62px " + serif;
    x.fillText("012", 122, 234);
    x.textAlign = "right";
    x.font = "13px " + sans;
    x.fillStyle = "#4B4A3F";
    x.fillText(today(), W - 82, 226);

    var rows = [
      ["轮到你了", formatTime(state.clock)],
      ["前面的人", "5 位"],
      ["听过的故事", n + " 段"],
      ["等位时长", waited + " 分钟"],
      ["你的过早", m.name + " · " + m.price + " 元"]
    ];
    var y = 272;
    x.textAlign = "left";
    for (var i = 0; i < rows.length; i++) {
      x.strokeStyle = "rgba(31,33,28,.24)";
      x.lineWidth = 1;
      x.setLineDash([3, 4]);
      x.beginPath();
      x.moveTo(82, y);
      x.lineTo(W - 82, y);
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = "#4B4A3F";
      x.font = "15px " + sans;
      x.fillText(rows[i][0], 82, y + 32);
      x.fillStyle = "#1F211C";
      x.font = "600 17px " + serif;
      x.textAlign = "right";
      x.fillText(rows[i][1], W - 82, y + 32);
      x.textAlign = "left";
      y += 50;
    }
    x.strokeStyle = "rgba(31,33,28,.24)";
    x.beginPath();
    x.moveTo(82, y);
    x.lineTo(W - 82, y);
    x.stroke();

    // 结语
    y += 30;
    x.fillStyle = "#F2E7D3";
    x.fillRect(82, y, W - 164, 300);
    x.fillStyle = "#BE3A26";
    x.fillRect(82, y, 4, 300);
    x.fillStyle = "#1F211C";
    x.font = "700 25px " + serif;
    y += 48;
    y = wrapText(x, (late ? formatTime(state.clock) + "，你迟到了。" : formatTime(state.clock) + "，你赶上了。"), 108, y, W - 220, 38);
    y += 14;
    y = wrapText(x, ending.title, 108, y, W - 220, 38);
    x.fillStyle = "#4B4A3F";
    x.font = "15px " + sans;
    y += 34;
    y = wrapText(x, ending.note, 108, y, W - 220, 27);
    y += 27;
    wrapText(x, m.line, 108, y, W - 220, 27);

    // 页脚
    x.fillStyle = "#1F211C";
    x.font = "700 35px " + serif;
    x.fillText("趁热吃。", 82, H - 150);
    x.fillStyle = "#4B4A3F";
    x.font = "13px " + sans;
    x.fillText("等一碗 · 2026 零杯 · 壹组", 82, H - 110);
    x.textAlign = "right";
    x.fillText("故事纯属虚构", W - 82, H - 110);
    x.textAlign = "left";
    x.fillStyle = "#BE3A26";
    x.font = "12px " + sans;
    x.fillText("DENG YI WAN", 82, H - 84);

    var name = "等一碗-过早签-" + today() + ".png";
    c.toBlob(function (blob) {
      if (!blob) { window.alert("这张签没能存下来，请截图保存。"); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, "image/png");

    if (btn) {
      var old = btn.innerHTML;
      btn.innerHTML = '已存下 <span aria-hidden="true">✓</span>';
      window.setTimeout(function () { btn.innerHTML = old; }, 2400);
    }
  }

  /* ---------- 操作 ---------- */
  function goNext() {
    state.clock += 2;
    state.index += 1;
    if (state.index >= D.people.length) {
      state.finished = true;
      state.phase = "order";
    } else {
      state.phase = "person";
    }
    updateClock(true);
    renderStrip();
    renderDots();
    renderDialog(true);
    renderNeighbors();
  }

  function chooseOrder(id) {
    state.order = id;
    state.phase = "ticket";
    store.last = {
      order: id,
      time: formatTime(state.clock),
      heard: store.heard.slice(),
      date: today()
    };
    saveStore();
    renderDialog(true);
    renderNeighbors();
  }

  function restart() {
    state.index = 0;
    state.clock = D.startTime;
    state.phase = "person";
    state.order = null;
    state.finished = false;
    updateClock(true);
    renderStrip();
    renderDots();
    renderDialog(true);
  }

  els.dialog.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");

    if (act === "listen") {
      var p = currentPerson();
      state.clock += 3;
      if (p && !isHeard(p.id)) {
        store.heard.push(p.id);
        saveStore();
      }
      state.phase = "listen";
      updateClock(true);
      renderDialog(true);
      renderNeighbors();
    } else if (act === "skip") {
      state.clock += 2;
      state.phase = "skip";
      updateClock(true);
      renderDialog(true);
    } else if (act === "next") {
      goNext();
    } else if (act === "order") {
      chooseOrder(btn.getAttribute("data-id"));
    } else if (act === "save") {
      saveTicket(btn);
    } else if (act === "restart") {
      restart();
      document.getElementById("queue").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  });

  /* ---------- 菜单 ---------- */
  function renderMenu() {
    els.menuGrid.innerHTML = D.menu.map(function (m) {
      return (
        '<article class="menu-card" style="--card-color:' + m.color + '" data-menu="' + m.id + '">' +
          '<div class="menu-card__inner">' +
            '<div class="menu-face menu-front">' +
              '<div class="menu-no"><span>' + m.no + '</span><i aria-hidden="true">' + m.name.slice(0, 1) + '</i></div>' +
              '<h3 class="menu-name">' + m.name + '</h3>' +
              '<p class="menu-price"><b>' + m.price + '</b><span>元</span></p>' +
              '<p class="menu-desc">' + m.desc + '</p>' +
              '<button class="menu-toggle" type="button" aria-expanded="false">' +
                '<span>翻开看老板的讲究</span><span aria-hidden="true">＋</span>' +
              '</button>' +
            '</div>' +
            '<div class="menu-face menu-back">' +
              '<div class="menu-no"><span>' + m.no + '</span><span>讲究</span></div>' +
              '<h3>老板说</h3>' +
              '<p class="menu-tip">' + m.tip + '</p>' +
              '<div class="stamp" aria-hidden="true">' + m.name.slice(0, 2) + '<br>现做</div>' +
              '<button class="menu-toggle" type="button" aria-expanded="true">' +
                '<span>翻回去</span><span aria-hidden="true">−</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join("");
  }

  els.menuGrid.addEventListener("click", function (e) {
    var card = e.target.closest(".menu-card");
    if (!card) return;
    var flipped = card.classList.toggle("is-flipped");
    $$(".menu-toggle", card).forEach(function (b) {
      b.setAttribute("aria-expanded", flipped ? "true" : "false");
    });
  });

  /* ---------- 街坊收藏 ---------- */
  function renderNeighbors() {
    var n = store.heard.length;
    els.heardCount.textContent = n;
    els.heardNote.textContent = n === 0
      ? "排队时听两句，才能拆开一张。"
      : (n === D.people.length ? "五张底片都显影了。整条街的早晨，你都在场。" : "还差 " + (D.people.length - n) + " 位，就能听完整条街。");

    els.neighborGrid.innerHTML = D.people.map(function (p) {
      var open = isHeard(p.id);
      if (!open) {
        return (
          '<article class="neighbor-card is-locked">' +
            '<span class="n-no">' + p.no + ' 号</span>' +
            '<h3 class="n-name">' + p.name + '</h3>' +
            '<p class="n-quote">' + p.order + '</p>' +
            '<p class="locked-note">这张底片还没显影。<br>回到队伍里，多听两句。</p>' +
          '</article>'
        );
      }
      return (
        '<article class="neighbor-card is-open">' +
          '<span class="n-no">' + p.no + ' 号 · 已显影</span>' +
          '<h3 class="n-name">' + p.name + '</h3>' +
          '<p class="n-quote">' + p.quote + '</p>' +
          '<p class="n-story">' + p.story + '</p>' +
          '<span class="n-mark">' + p.heardLine + '</span>' +
        '</article>'
      );
    }).join("");
  }

  els.clear.addEventListener("click", function () {
    if (!window.confirm("清空已经收集的街坊故事？此操作不可撤销。")) return;
    store.heard = [];
    store.last = null;
    saveStore();
    renderNeighbors();
    renderDialog(false);
  });

  /* ---------- 页面细节 ---------- */
  function initHeader() {
    var onScroll = function () {
      els.head.classList.toggle("is-stuck", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function initReveal() {
    var targets = $$(".section-head, .game, .menu-grid, .neighbor-grid, .about-grid");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("reveal", "in"); });
      return;
    }
    targets.forEach(function (el) { el.classList.add("reveal"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach(function (el) { io.observe(el); });
  }

  function initNav() {
    var links = $$(".nav a");
    var sections = links.map(function (a) {
      return document.querySelector(a.getAttribute("href"));
    }).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-40% 0px -50% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 启动 ---------- */
  renderMenu();
  renderStrip();
  renderDots();
  updateClock(false);
  renderDialog(false);
  renderNeighbors();
  initHeader();
  initReveal();
  initNav();

  // 供调试与后续轮次使用
  window.DENGYI_APP = {
    state: state,
    store: store,
    restart: restart
  };
})();
