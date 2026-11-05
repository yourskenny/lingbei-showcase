/* 最后一单 · 交互
 * 原生 JS；无第三方库。
 * 状态机：idle → map → riding → scene → (map | summary)
 */
(function () {
  "use strict";

  var DATA = window.LASTORDER;
  if (!DATA) return;

  var NS = "http://www.w3.org/2000/svg";
  var KEY = "lastorder.v1";
  var STORY_DATE = "2026.11.05";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileQuery = window.matchMedia("(max-width: 720px)");

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var el = {
    head: $("#siteHead"),
    progress: $("#scrollProgress"),
    startBtn: $("#startBtn"),
    mapFrame: $("#mapFrame"),
    mapSvg: $("#cityMap"),
    mapRoutes: $("#mapRoutes"),
    mapPins: $("#mapPins"),
    scooter: $("#mapScooter"),
    mapClock: $("#mapClock"),
    mapToast: $("#mapToast"),
    dispatchState: $("#dispatchState"),
    dispatchCount: $("#dispatchCount"),
    dispatchBattery: $("#dispatchBattery"),
    dispatchTime: $("#dispatchTime"),
    orderCard: $("#orderCard"),
    orderKicker: $("#orderKicker"),
    orderFee: $("#orderFee"),
    orderTitle: $("#orderTitle"),
    orderPickup: $("#orderPickup"),
    orderDrop: $("#orderDrop"),
    orderNote: $("#orderNote"),
    orderDistance: $("#orderDistance"),
    orderMinutes: $("#orderMinutes"),
    orderCustomer: $("#orderCustomer"),
    acceptBtn: $("#acceptBtn"),
    skipRide: $("#skipRide"),
    rideProgress: $("#rideProgress"),
    rideBar: $("#rideBar"),
    rideStatus: $("#rideStatus"),
    dispatchLog: $("#dispatchLog"),
    logEmpty: $("#logEmpty"),
    dispatchHint: $("#dispatchHint"),
    ticketRow: $("#ticketRow"),
    nightCount: $("#nightCount"),
    nightDate: $("#nightDate"),
    timeline: $("#nightTimeline"),
    nightLogFoot: $("#nightLogFoot"),
    scene: $("#scene"),
    sceneVisual: $("#sceneVisual"),
    sceneNo: $("#sceneNo"),
    scenePlace: $("#scenePlace"),
    sceneTime: $("#sceneTime"),
    sceneWeather: $("#sceneWeather"),
    sceneNarration: $("#sceneNarration"),
    sceneSpeaker: $("#sceneSpeaker"),
    sceneLine: $("#sceneLine"),
    scenePlayer: $("#scenePlayer"),
    sceneChoices: $("#sceneChoices"),
    sceneResult: $("#sceneResult"),
    sceneOutcome: $("#sceneOutcome"),
    miniNo: $("#miniTicketNo"),
    miniStamp: $("#miniTicketStamp"),
    miniItems: $("#miniTicketItems"),
    miniNote: $("#miniTicketNote"),
    miniChoice: $("#miniTicketChoice"),
    miniPlace: $("#miniTicketPlace"),
    miniTime: $("#miniTicketTime"),
    sceneAfter: $("#sceneAfter"),
    sceneNext: $("#sceneNext"),
    summary: $("#summary"),
    sumOrders: $("#sumOrders"),
    sumDistance: $("#sumDistance"),
    sumIncome: $("#sumIncome"),
    summaryTickets: $("#summaryTickets"),
    summaryLine: $("#summaryLine"),
    summarySubline: $("#summarySubline"),
    summaryNight: $("#summaryNight"),
    saveReceipt: $("#saveReceipt"),
    replayBtn: $("#replayBtn"),
    closeSummary: $("#closeSummary")
  };

  var store = loadStore();
  var state = {
    started: false,
    phase: "idle",
    orderIndex: 0,
    tickets: [],
    choices: [],
    skip: false,
    camera: { x: 0, y: 0, w: 1200, h: 760 },
    camRaf: 0,
    rideRaf: 0,
    toastTimer: 0,
    dialog: null,
    lastFocus: null,
    dropPin: null
  };

  var orders = DATA.orders;
  var finale = DATA.finale;

  /* ---------------- 存档 ---------------- */
  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { nights: 0, last: null };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { nights: 0, last: null };
      return {
        nights: Number(parsed.nights) || 0,
        last: parsed.last && Array.isArray(parsed.last.tickets) ? parsed.last : null
      };
    } catch (e) {
      return { nights: 0, last: null };
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nights: store.nights, last: store.last }));
    } catch (e) { /* file:// 或隐私模式下降级 */ }
  }
  function currentOrder() {
    return state.orderIndex < orders.length ? orders[state.orderIndex] : finale;
  }
  function batteryFor(order) {
    return { o1: "23%", o2: "19%", o3: "14%", o4: "9%" }[order.id] || "23%";
  }

  /* ---------------- 渲染订单 ---------------- */
  function renderOrder(order, opts) {
    opts = opts || {};
    var isFinale = order.id === "o4";
    el.orderTitle.innerHTML = escape(order.pickup.short) + ' <span>→</span> ' + escape(order.drop.short);
    el.orderPickup.textContent = order.pickup.name;
    el.orderDrop.textContent = order.drop.name;
    el.orderNote.textContent = order.note;
    el.orderDistance.textContent = order.distance;
    el.orderMinutes.textContent = order.minutes;
    el.orderCustomer.textContent = order.customer;
    el.orderFee.textContent = order.fee;
    el.orderKicker.textContent = "新订单 / NEW ORDER";
    el.dispatchState.textContent = isFinale ? "加单" : "待接单";
    el.dispatchCount.textContent = order.count;
    el.dispatchBattery.textContent = batteryFor(order);
    el.dispatchTime.textContent = order.time;
    el.mapClock.textContent = order.time;
    el.acceptBtn.disabled = false;
    el.acceptBtn.hidden = false;
    el.acceptBtn.innerHTML = (isFinale ? "接单 · 回家" : "接单 · 出发") + '<span class="arrow" aria-hidden="true">→</span>';
    el.skipRide.hidden = true;
    el.skipRide.disabled = false;
    el.rideProgress.hidden = true;
    el.rideBar.style.width = "0%";
    el.dispatchHint.textContent = isFinale ? "最后一单。送到就收工。" : "提示：骑行中可以点「跳过骑行」，直接到门口。";
    el.orderCard.classList.remove("is-finished");
    showPins(order);
    setScooterStart(order);
    if (opts.focus !== false) focusOrder(order);
  }

  function setScooterStart(order) {
    var point = order.approach ? pathStart(order.approach) : order.pickup;
    if (point) placeScooter(point.x, point.y, 0);
  }

  function showPins(order) {
    el.mapPins.innerHTML = "";
    el.dropPin = null;
    addPin(order.pickup, "pick", "取餐", -14);
    if (order.drop) addPin(order.drop, "drop", order.id === "o4" ? "回家" : "送达", 20);
  }

  function addPin(point, type, label, labelY) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "pin " + type);
    g.setAttribute("transform", "translate(" + point.x + " " + point.y + ")");

    var halo = document.createElementNS(NS, "circle");
    halo.setAttribute("class", "pin-halo");
    halo.setAttribute("r", "21");
    g.appendChild(halo);

    var ring = document.createElementNS(NS, "circle");
    ring.setAttribute("class", "pin-ring");
    ring.setAttribute("r", "9");
    g.appendChild(ring);

    var core = document.createElementNS(NS, "circle");
    core.setAttribute("class", "pin-core");
    core.setAttribute("r", "3.5");
    g.appendChild(core);

    var text = document.createElementNS(NS, "text");
    text.setAttribute("class", "pin-label");
    text.setAttribute("x", "11");
    text.setAttribute("y", String(labelY || -10));
    text.textContent = label;
    g.appendChild(text);

    el.mapPins.appendChild(g);
    if (type === "drop") el.dropPin = g;
  }

  function markDropPinArrived(on) {
    if (!el.dropPin) return;
    el.dropPin.classList.toggle("is-arrived", !!on);
  }

  /* ---------------- 地图运镜 ---------------- */
  function initCamera() {
    if (!el.mapFrame || !el.mapSvg) return;
    var target = fullCamera();
    state.camera = target;
    setView(target);
  }

  function fullCamera() {
    var rect = el.mapFrame.getBoundingClientRect();
    var aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1200 / 760;
    var w = 1200;
    var h = 760;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    return { x: 600 - w / 2, y: 380 - h / 2, w: w, h: h };
  }

  function fitBox(box, pad) {
    var rect = el.mapFrame.getBoundingClientRect();
    var aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1200 / 760;
    var minW = mobileQuery.matches ? 440 : 540;
    var w = Math.max(box.w + pad * 2, minW);
    var h = Math.max(box.h + pad * 2, minW * 0.62);
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h };
  }

  function focusOrder(order) {
    var boxes = [];
    if (order.approach) boxes.push(measurePath(order.approach));
    if (order.delivery) boxes.push(measurePath(order.delivery));
    if (!boxes.length) boxes.push({ x: order.pickup.x - 30, y: order.pickup.y - 30, w: 60, h: 60 });
    var union = unionBox(boxes);
    animateCamera(fitBox(union, mobileQuery.matches ? 72 : 96), reduceMotion ? 0 : 720);
  }

  function measurePath(d) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.style.visibility = "hidden";
    el.mapRoutes.appendChild(p);
    var b;
    try { b = p.getBBox(); } catch (e) { b = { x: 0, y: 0, width: 0, height: 0 }; }
    p.remove();
    if (!b || !b.width) return { x: 600, y: 380, w: 1, h: 1 };
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  function pathStart(d) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.style.visibility = "hidden";
    el.mapRoutes.appendChild(p);
    var pt;
    try { pt = p.getPointAtLength(0); } catch (e) { pt = null; }
    p.remove();
    return pt ? { x: pt.x, y: pt.y } : null;
  }

  function unionBox(boxes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boxes.forEach(function (b) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });
    if (!isFinite(minX)) return { x: 600, y: 380, w: 1, h: 1 };
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  function setView(v) {
    el.mapSvg.setAttribute("viewBox", [v.x, v.y, v.w, v.h].map(function (n) { return Math.round(n * 10) / 10; }).join(" "));
  }

  function animateCamera(target, duration) {
    cancelAnimationFrame(state.camRaf);
    if (!duration || reduceMotion) {
      state.camera = target;
      setView(target);
      return;
    }
    var from = state.camera;
    var t0 = performance.now();
    function step(now) {
      var p = clamp((now - t0) / duration, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      var v = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e
      };
      state.camera = v;
      setView(v);
      if (p < 1) state.camRaf = requestAnimationFrame(step);
    }
    state.camRaf = requestAnimationFrame(step);
  }

  function placeScooter(x, y, angle) {
    if (!el.scooter) return;
    el.scooter.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + (angle + 180).toFixed(1) + ")");
  }

  function clearRoutes() {
    if (el.mapRoutes) el.mapRoutes.innerHTML = "";
  }

  function createRoute(d, kind) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "route route-" + kind);
    el.mapRoutes.appendChild(p);
    return p;
  }

  /* ---------------- 骑行 ---------------- */
  function runPath(pathEl, fromP, toP) {
    return new Promise(function (resolve) {
      var total = 0;
      try { total = pathEl.getTotalLength(); } catch (e) { total = 0; }
      if (!total) { resolve(); return; }
      pathEl.style.strokeDasharray = total;
      pathEl.style.strokeDashoffset = total;
      var duration = reduceMotion ? 0 : clamp(total * 5.2, 1400, 3400);
      var t0 = performance.now();

      function step(now) {
        var p = duration ? clamp((now - t0) / duration, 0, 1) : 1;
        if (state.skip) p = 1;
        var q = fromP + (toP - fromP) * p;
        pathEl.style.strokeDashoffset = total * (1 - p);
        var pt = pathEl.getPointAtLength(total * p);
        var ahead = pathEl.getPointAtLength(Math.min(total, total * p + 8));
        var angle = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
        placeScooter(pt.x, pt.y, isFinite(angle) ? angle : 0);
        setRideProgress(q);
        if (p < 1) {
          state.rideRaf = requestAnimationFrame(step);
        } else {
          pathEl.style.strokeDasharray = "";
          pathEl.style.strokeDashoffset = 0;
          setRideProgress(toP);
          resolve();
        }
      }
      state.rideRaf = requestAnimationFrame(step);
    });
  }

  function setRideProgress(p) {
    el.rideBar.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + "%";
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, state.skip ? Math.min(ms, 60) : ms);
    });
  }

  function rideOrder(order) {
    clearRoutes();
    showPins(order);
    var start = order.approach ? pathStart(order.approach) : order.pickup;
    if (start) placeScooter(start.x, start.y, 0);
    focusOrder(order);
    markDropPinArrived(false);

    // 最后一单：粮道街 → 积玉桥，一段路直接到家。
    if (!order.delivery) {
      el.rideStatus.textContent = "沿着临江大道，回家…";
      var home = createRoute(order.approach, "delivery");
      return runPath(home, 0, 1).then(function () {
        toast("到家了");
        addLog(order.scene.time, "到家 · " + order.drop.short);
        return sleep(620);
      });
    }

    var chain = Promise.resolve();
    if (order.approach) {
      chain = chain.then(function () {
        el.rideStatus.textContent = "正在前往取餐点…";
        var approach = createRoute(order.approach, "approach");
        return runPath(approach, 0, 0.45).then(function () {
          toast("取餐完成 · " + order.pickup.short);
          addLog("取餐", order.pickup.name);
          approach.classList.add("route-past");
          return sleep(480);
        });
      });
    }

    return chain.then(function () {
      el.rideStatus.textContent = "已取餐，正在配送…";
      var delivery = createRoute(order.delivery, "delivery");
      return runPath(delivery, order.approach ? 0.45 : 0, 1).then(function () {
        toast("已送达 · " + order.drop.short);
        addLog(order.scene.time, "已送达 · " + order.drop.short);
        markDropPinArrived(true);
        return sleep(520);
      });
    });
  }

  /* ---------------- 接单 / 场景 ---------------- */
  function acceptOrder() {
    if (state.phase === "riding" || state.phase === "scene" || state.phase === "summary") return;
    if (!state.started) state.started = true;
    state.skip = false;
    state.phase = "riding";
    var order = currentOrder();
    el.acceptBtn.hidden = true;
    el.skipRide.hidden = false;
    el.skipRide.disabled = false;
    el.rideProgress.hidden = false;
    el.dispatchState.textContent = "配送中";
    el.orderKicker.textContent = order.id === "o4" ? "回家 / HOME" : "配送中 / ON THE WAY";
    addLog(order.time, order.id === "o4" ? "接单 · 回家" : "接单 · " + order.pickup.short);
    renderTimeline();
    rideOrder(order).then(function () {
      state.phase = "scene";
      openScene(order);
    }).catch(function (err) {
      console.error(err);
      state.phase = "map";
      el.acceptBtn.hidden = false;
      el.acceptBtn.disabled = false;
      el.skipRide.hidden = true;
      el.rideProgress.hidden = true;
      el.dispatchState.textContent = "待接单";
    });
  }

  function openScene(order) {
    var scene = order.scene;
    el.sceneNo.textContent = order.no;
    el.scenePlace.textContent = scene.place;
    el.sceneTime.textContent = scene.time;
    el.sceneWeather.textContent = scene.weather;
    el.sceneNarration.textContent = scene.narration;
    el.sceneSpeaker.textContent = scene.customerName;
    el.sceneLine.textContent = scene.customerLine;
    el.scenePlayer.textContent = scene.playerLine;
    el.sceneOutcome.textContent = "";
    el.sceneAfter.textContent = "";
    el.miniChoice.textContent = "";
    el.sceneResult.hidden = true;
    el.sceneChoices.hidden = false;
    el.sceneChoices.innerHTML = "";

    var template = document.getElementById("visual-" + scene.visual);
    el.sceneVisual.innerHTML = "";
    if (template) el.sceneVisual.appendChild(template.content.cloneNode(true));

    scene.choices.forEach(function (choice, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.setAttribute("data-choice", String(index));
      btn.textContent = choice.label;
      btn.addEventListener("click", function () { choose(index); });
      el.sceneChoices.appendChild(btn);
    });

    state.lastFocus = document.activeElement;
    state.dialog = el.scene;
    el.scene.hidden = false;
    lockScroll(true);
    document.addEventListener("keydown", onDialogKeydown);
    setTimeout(function () {
      var first = el.sceneChoices.querySelector("button");
      if (first) first.focus();
    }, 120);
    renderTimeline();
  }

  function choose(index) {
    if (state.phase !== "scene") return;
    var order = currentOrder();
    var choice = order.scene.choices[index];
    if (!choice) return;
    state.phase = "scene-result";
    state.choices.push({ order: order.id, choice: index, label: choice.label });

    var ticket = {};
    Object.keys(order.scene.ticket).forEach(function (k) { ticket[k] = order.scene.ticket[k]; });
    ticket.customer = order.customer;
    ticket.orderId = order.id;
    ticket.choice = choice.short || choice.label;
    state.tickets.push(ticket);

    el.sceneOutcome.textContent = choice.outcome;
    el.miniNo.textContent = ticket.no;
    el.miniStamp.textContent = ticket.stamp;
    el.miniItems.textContent = ticket.items;
    el.miniNote.textContent = ticket.note;
    el.miniChoice.textContent = "你 · " + ticket.choice;
    el.miniPlace.textContent = ticket.place;
    el.miniTime.textContent = ticket.time;
    el.sceneAfter.textContent = order.scene.after;
    el.sceneNext.innerHTML = (order.id === "o4" ? "收工" : "继续送单") + '<span class="arrow" aria-hidden="true">→</span>';
    el.sceneChoices.hidden = true;
    el.sceneResult.hidden = false;
    renderNotes();
    renderTimeline();
    setTimeout(function () {
      el.sceneNext.focus();
      if (el.sceneResult.scrollIntoView) {
        el.sceneResult.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      }
    }, 60);
  }

  function nextScene() {
    if (state.phase !== "scene-result") return;
    var finishedFinale = state.orderIndex >= orders.length;
    closeScene();
    if (finishedFinale) {
      finishNight();
      return;
    }
    if (state.orderIndex < orders.length - 1) {
      state.orderIndex += 1;
      state.phase = "map";
      renderOrder(orders[state.orderIndex]);
    } else {
      state.orderIndex = orders.length;
      state.phase = "map";
      renderOrder(finale);
    }
    renderNotes();
    renderTimeline();
    setTimeout(function () {
      el.acceptBtn.focus({ preventScroll: true });
      el.orderCard.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    }, 80);
  }

  function closeScene() {
    el.scene.hidden = true;
    state.dialog = null;
    lockScroll(false);
    document.removeEventListener("keydown", onDialogKeydown);
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus({ preventScroll: true });
  }

  /* ---------------- 收工 ---------------- */
  function finishNight() {
    state.phase = "summary";
    state.dialog = el.summary;
    state.lastFocus = document.activeElement;
    var night = (store.nights || 0) + 1;
    store.nights = night;
    store.last = {
      date: STORY_DATE,
      tickets: state.tickets.slice(),
      choices: state.choices.slice(),
      stats: {
        orders: DATA.summary.totalOrders,
        distance: DATA.summary.distance,
        income: DATA.summary.income
      }
    };
    saveStore();
    renderSummary(night);
    renderNotes();
    renderTimeline();

    el.dispatchState.textContent = "已收工";
    el.acceptBtn.hidden = false;
    el.acceptBtn.disabled = true;
    el.acceptBtn.innerHTML = "今夜收工";
    el.skipRide.hidden = true;
    el.rideProgress.hidden = true;
    el.orderCard.classList.add("is-finished");
    el.orderKicker.textContent = "已收工 / OFF DUTY";
    el.dispatchHint.textContent = "小票已存好。可以再跑一夜。";

    el.summary.hidden = false;
    lockScroll(true);
    document.addEventListener("keydown", onDialogKeydown);
    setTimeout(function () { el.saveReceipt.focus(); }, 100);
  }

  function renderSummary(night) {
    el.sumOrders.textContent = DATA.summary.totalOrders;
    el.sumDistance.textContent = DATA.summary.distance;
    el.sumIncome.textContent = DATA.summary.income;
    el.summaryNight.textContent = night;
    el.summaryLine.textContent = DATA.summary.line;
    el.summarySubline.textContent = DATA.summary.subline;

    el.summaryTickets.innerHTML = state.tickets.map(function (t) {
      return '<li><span class="r-no">' + escape(t.no) + '</span>' +
        '<div class="r-body"><b>' + escape(t.place) + ' · ' + escape(t.time) +
        (t.choice ? '<em class="r-choice">你 · ' + escape(t.choice) + '</em>' : '') +
        '</b>' + escape(t.note) + '<span>' + escape(t.items) + '</span></div></li>';
    }).join("");
  }

  function closeSummary() {
    el.summary.hidden = true;
    state.dialog = null;
    state.phase = "done";
    lockScroll(false);
    document.removeEventListener("keydown", onDialogKeydown);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    setTimeout(function () { el.startBtn.focus({ preventScroll: true }); }, 200);
  }

  function replayNight() {
    el.summary.hidden = true;
    state.dialog = null;
    lockScroll(false);
    document.removeEventListener("keydown", onDialogKeydown);
    resetRun();
  }

  function resetRun() {
    state.started = true;
    state.phase = "map";
    state.orderIndex = 0;
    state.tickets = [];
    state.choices = [];
    state.skip = false;
    clearRoutes();
    el.dispatchLog.innerHTML = "";
    el.dispatchLog.appendChild(el.logEmpty);
    el.logEmpty.textContent = "重新上线。";
    el.orderCard.classList.remove("is-finished");
    renderOrder(orders[0]);
    renderNotes();
    renderTimeline();
    el.acceptBtn.classList.remove("is-pulse");
    void el.acceptBtn.offsetWidth;
    el.acceptBtn.classList.add("is-pulse");
    document.getElementById("ride").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setTimeout(function () {
      el.acceptBtn.classList.remove("is-pulse");
      el.acceptBtn.focus({ preventScroll: true });
    }, 1600);
  }

  /* ---------------- 首屏入口 ---------------- */
  function startShift() {
    if (state.phase === "summary") return;
    if (state.tickets.length === 4 || state.phase === "done") {
      resetRun();
      return;
    }
    if (!state.started) {
      state.started = true;
      state.phase = "map";
      el.dispatchLog.innerHTML = "";
      el.dispatchLog.appendChild(el.logEmpty);
      el.logEmpty.textContent = "上线。";
      addLog(DATA.meta.startTime, "上线 · 武昌");
      renderTimeline();
    }
    document.getElementById("ride").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.acceptBtn.classList.remove("is-pulse");
    void el.acceptBtn.offsetWidth;
    el.acceptBtn.classList.add("is-pulse");
    setTimeout(function () {
      el.acceptBtn.classList.remove("is-pulse");
      el.acceptBtn.focus({ preventScroll: true });
    }, 1400);
  }

  /* ---------------- 小票与日志 ---------------- */
  function renderNotes() {
    var showStored = !state.started && store.last;
    var tickets = state.tickets.length ? state.tickets : (showStored ? store.last.tickets : []);
    var allOrders = orders.concat([finale]);

    el.ticketRow.innerHTML = allOrders.map(function (order) {
      var ticket = null;
      for (var i = 0; i < tickets.length; i++) {
        if (tickets[i].orderId === order.id || tickets[i].no === order.scene.ticket.no) { ticket = tickets[i]; break; }
      }
      if (!ticket) {
        return '<article class="ticket is-locked">' +
          '<div class="ticket-top"><span class="ticket-no">' + escape(order.scene.ticket.no) + '</span><span class="ticket-no">未送达</span></div>' +
          '<div class="ticket-who"><h3>待送达</h3><span>' + escape(order.drop.short) + '</span></div>' +
          '<p class="ticket-note">这一单还没有送出。<span class="ticket-locked-line"></span><span class="ticket-locked-line" style="width:38%"></span></p>' +
          '<span class="ticket-locked-mark" aria-hidden="true">未送达</span>' +
          '<div class="ticket-foot"><span>—</span><span>' + escape(order.id === "o4" ? "最后一单" : "今夜") + '</span></div>' +
          '</article>';
      }
      return '<article class="ticket">' +
        '<div class="ticket-top"><span class="ticket-no">' + escape(ticket.no) + '</span><span class="ticket-stamp">' + escape(ticket.stamp) + '</span></div>' +
        '<div class="ticket-who"><h3>' + escape(ticket.customer) + '</h3><span>' + escape(ticket.place) + '</span></div>' +
        '<p class="ticket-note">' + escape(ticket.note) + '</p>' +
        (ticket.choice ? '<p class="ticket-choice"><i>你</i>' + escape(ticket.choice) + '</p>' : '') +
        '<div class="ticket-foot"><span>' + escape(ticket.time) + '</span><span>' + escape(ticket.items) + '</span></div>' +
        '</article>';
    }).join("");

    var night = store.nights || 0;
    el.nightCount.textContent = night;
    if (state.phase === "summary" || (state.phase === "done" && state.tickets.length === 4)) {
      el.nightDate.textContent = STORY_DATE + " · 收工";
    } else if (state.started) {
      el.nightDate.textContent = "进行中 · " + currentOrder().time;
    } else if (store.last) {
      el.nightDate.textContent = store.last.date || STORY_DATE;
    } else {
      el.nightDate.textContent = "尚未收工";
    }
    el.nightLogFoot.textContent = state.started
      ? "这一夜还在路上。"
      : (store.nights ? "上一夜留在了浏览器里。" : "完成这一夜后，路线会留在这里。");
  }

  function renderTimeline() {
    var active = 0;
    if (state.phase === "summary" || state.tickets.length === 4) active = 5;
    else if (state.started) active = 1 + state.tickets.length;
    else if (store.last) active = 5;

    el.timeline.innerHTML = DATA.timeline.map(function (item, index) {
      return '<li class="' + (index < active ? "is-on" : "") + '">' +
        '<time>' + escape(item.time) + '</time>' +
        '<b>' + escape(item.place) + '</b>' +
        '<span>' + escape(item.line) + '</span>' +
        '</li>';
    }).join("");
  }

  function addLog(time, text) {
    if (el.logEmpty && el.logEmpty.parentNode === el.dispatchLog) el.logEmpty.remove();
    var li = document.createElement("li");
    var b = document.createElement("b");
    b.textContent = time;
    var span = document.createElement("span");
    span.textContent = text;
    li.appendChild(b);
    li.appendChild(span);
    el.dispatchLog.appendChild(li);
    var items = $$("#dispatchLog li");
    if (items.length > 6) items[0].remove();
    el.dispatchLog.scrollTop = el.dispatchLog.scrollHeight;
  }

  function toast(text) {
    clearTimeout(state.toastTimer);
    el.mapToast.textContent = text;
    el.mapToast.classList.add("is-on");
    state.toastTimer = setTimeout(function () { el.mapToast.classList.remove("is-on"); }, 1700);
  }

  /* ---------------- 收工小票 PNG ---------------- */
  function saveReceiptImage() {
    if (!state.tickets.length) return;
    var W = 760;
    var H = 1240;
    var scale = 2;
    var canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    ctx.fillStyle = "#f7efdf";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(70,48,25,.055)";
    ctx.lineWidth = 1;
    for (var y = 24; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y + .5);
      ctx.lineTo(W, y + .5);
      ctx.stroke();
    }

    ctx.fillStyle = "#8a6a45";
    ctx.font = '10px "SFMono-Regular", Consolas, monospace';
    ctx.textAlign = "left";
    ctx.fillText("LAST ORDER / 最后一单", 50, 62);
    ctx.textAlign = "right";
    ctx.fillText(STORY_DATE, W - 50, 62);

    ctx.textAlign = "left";
    ctx.fillStyle = "#071018";
    ctx.font = '700 62px "Noto Serif CJK SC", "Songti SC", serif';
    ctx.fillText("今夜收工", 48, 156);
    ctx.fillStyle = "#7a6248";
    ctx.font = '11px "SFMono-Regular", Consolas, monospace';
    ctx.fillText("武昌 · 00:47 — 02:52", 50, 188);

    var stats = [
      [DATA.summary.totalOrders, "单"],
      [DATA.summary.distance, "公里"],
      [DATA.summary.income, "元"]
    ];
    stats.forEach(function (s, i) {
      var x = 50 + i * 220;
      ctx.fillStyle = "#071018";
      ctx.font = '700 40px "Noto Serif CJK SC", "Songti SC", serif';
      ctx.fillText(s[0], x, 266);
      ctx.fillStyle = "#8a6a45";
      ctx.font = '9px "SFMono-Regular", Consolas, monospace';
      ctx.fillText(s[1], x, 288);
    });

    ctx.strokeStyle = "rgba(70,48,25,.3)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(50, 326);
    ctx.lineTo(W - 50, 326);
    ctx.stroke();
    ctx.setLineDash([]);

    var cursor = 366;
    state.tickets.forEach(function (t) {
      ctx.fillStyle = "#6a4e30";
      ctx.font = '600 12px "Noto Sans CJK SC", "PingFang SC", sans-serif';
      ctx.fillText(t.place + " · " + t.time, 50, cursor);
      if (t.choice) {
        ctx.save();
        ctx.textAlign = "right";
        ctx.fillStyle = "#a33a2b";
        ctx.font = '9px "SFMono-Regular", Consolas, monospace';
        ctx.fillText("你 · " + t.choice, W - 50, cursor);
        ctx.restore();
      }
      ctx.fillStyle = "#2a2118";
      ctx.font = '15px "Noto Serif CJK SC", "Songti SC", serif';
      var lines = wrapText(ctx, "“" + t.note + "”", W - 100);
      lines.forEach(function (line, i) {
        ctx.fillText(line, 50, cursor + 27 + i * 24);
      });
      cursor += 27 + lines.length * 24 + 12;
      ctx.fillStyle = "#8a6a45";
      ctx.font = '9px "SFMono-Regular", Consolas, monospace';
      ctx.fillText(t.items, 50, cursor);
      cursor += 36;
    });

    ctx.strokeStyle = "rgba(70,48,25,.3)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(50, cursor);
    ctx.lineTo(W - 50, cursor);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#241b12";
    ctx.font = '20px "Noto Serif CJK SC", "Songti SC", serif';
    ctx.textAlign = "center";
    ctx.fillText("城市睡了，总有人醒着。", W / 2, cursor + 52);
    ctx.fillStyle = "#8a6a45";
    ctx.font = '9px "SFMono-Regular", Consolas, monospace';
    ctx.fillText("明天，还会有新的订单。", W / 2, cursor + 76);

    ctx.save();
    ctx.translate(W - 126, cursor + 150);
    ctx.rotate(-12 * Math.PI / 180);
    ctx.strokeStyle = "rgba(200,64,47,.82)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-64, -30, 128, 60);
    ctx.fillStyle = "rgba(200,64,47,.82)";
    ctx.font = '700 30px "Noto Serif CJK SC", "Songti SC", serif';
    ctx.textAlign = "center";
    ctx.fillText("收工", 0, 11);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "#8a6a45";
    ctx.font = '9px "SFMono-Regular", Consolas, monospace';
    ctx.fillText("谢谢惠顾", 50, H - 54);
    ctx.textAlign = "right";
    ctx.fillText("第 " + (store.nights || 1) + " 夜", W - 50, H - 54);

    var done = function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "最后一单-今夜小票.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    };
    if (canvas.toBlob) {
      canvas.toBlob(done, "image/png");
    } else {
      var a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "最后一单-今夜小票.png";
      a.click();
    }

    var old = el.saveReceipt.textContent;
    el.saveReceipt.textContent = "已存下";
    setTimeout(function () { el.saveReceipt.textContent = old; }, 1800);
  }

  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    var line = "";
    for (var i = 0; i < text.length; i++) {
      var next = line + text[i];
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = text[i];
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ---------------- 顶栏与滚动 ---------------- */
  function updateChrome() {
    var sy = window.scrollY || document.documentElement.scrollTop || 0;
    el.head.classList.toggle("is-scrolled", sy > 24);

    var notes = document.getElementById("notes");
    if (notes) {
      var r = notes.getBoundingClientRect();
      var mark = (el.head.offsetHeight || 80) + 24;
      var paper = r.top <= mark && r.bottom >= mark;
      el.head.classList.toggle("is-paper", paper);
    }

    var sections = ["hero", "ride", "notes", "about"];
    var active = "hero";
    sections.forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec && sec.getBoundingClientRect().top <= 140) active = id;
    });
    $$(".site-nav a").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-nav") === active);
    });

    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? clamp(sy / max, 0, 1) : 0;
    el.progress.style.transform = "scaleX(" + p.toFixed(4) + ")";
  }

  function onDialogKeydown(e) {
    if (!state.dialog) return;
    if (e.key === "Escape" && state.dialog === el.summary) {
      e.preventDefault();
      closeSummary();
      return;
    }
    if (e.key !== "Tab") return;
    var focusables = $$("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])", state.dialog).filter(function (node) {
      return node.offsetParent !== null;
    });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle("is-locked", !!on);
  }

  function escape(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    el.startBtn.addEventListener("click", startShift);
    el.acceptBtn.addEventListener("click", acceptOrder);
    el.skipRide.addEventListener("click", function () {
      state.skip = true;
      el.skipRide.disabled = true;
      el.rideStatus.textContent = "正在加速…";
    });
    el.sceneNext.addEventListener("click", nextScene);
    el.saveReceipt.addEventListener("click", saveReceiptImage);
    el.replayBtn.addEventListener("click", replayNight);
    el.closeSummary.addEventListener("click", closeSummary);

    window.addEventListener("scroll", updateChrome, { passive: true });
    window.addEventListener("resize", debounce(function () {
      if (state.phase === "scene" || state.phase === "summary") return;
      if (state.started) focusOrder(currentOrder());
      else initCamera();
    }, 180));
  }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function initReveal() {
    var nodes = $$(".ride-head, .ride-stage, .notes-head, .ticket-row, .night-log, .about-grid, .about-foot");
    nodes.forEach(function (node) { node.classList.add("js-reveal"); });
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (node) { node.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
    nodes.forEach(function (node) { io.observe(node); });
  }

  function init() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    renderOrder(orders[0], { focus: false });
    renderNotes();
    renderTimeline();
    initCamera();
    setTimeout(function () {
      if (state.phase === "idle") focusOrder(orders[0]);
    }, 380);
    bind();
    initReveal();
    updateChrome();
  }

  init();
})();
