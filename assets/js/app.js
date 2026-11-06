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
    headStatus: $("#headStatus"),
    headClock: $("#headClock"),
    headBattery: $("#headBattery"),
    headBatteryBar: $("#headBatteryBar"),
    headOrders: $("#headOrders"),
    progress: $("#scrollProgress"),
    startBtn: $("#startBtn"),
    heroSub: $("#heroSub"),
    heroLede: $("#heroLede"),
    soundToggle: $("#soundToggle"),
    soundLabel: $("#soundLabel"),
    mapFrame: $("#mapFrame"),
    mapSvg: $("#cityMap"),
    mapRoutes: $("#mapRoutes"),
    mapTrail: $("#mapTrail"),
    mapPins: $("#mapPins"),
    scooter: $("#mapScooter"),
    mapClock: $("#mapClock"),
    mapLive: $(".map-top .live"),
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
    mapSkip: $("#mapSkip"),
    rideProgress: $("#rideProgress"),
    rideBar: $("#rideBar"),
    rideStatus: $("#rideStatus"),
    dispatchLog: $("#dispatchLog"),
    logEmpty: $("#logEmpty"),
    dispatchHint: $("#dispatchHint"),
    ticketRow: $("#ticketRow"),
    reopenNotes: $("#reopenNotes"),
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
    summaryRoute: $("#summaryRoute"),
    summaryTickets: $("#summaryTickets"),
    summaryLine: $("#summaryLine"),
    summarySubline: $("#summarySubline"),
    summaryNight: $("#summaryNight"),
    summaryTotal: $("#summaryTotal"),
    saveReceipt: $("#saveReceipt"),
    replayBtn: $("#replayBtn"),
    closeSummary: $("#closeSummary"),
    copyNight: $("#copyNight"),
    receiptRoute: $("#receiptRoute"),
    replayRoute: $("#replayRoute"),
    routeMeta: $("#routeMeta")
  };

  var store = loadStore();
  if (!store.total) store.total = { orders: 0, distance: 0, income: 0 };
  var state = {
    started: false,
    phase: "idle",
    orderIndex: 0,
    tickets: [],
    choices: [],
    summaryReturn: null,
    skip: false,
    camera: { x: 0, y: 0, w: 1200, h: 760 },
    camRaf: 0,
    rideRaf: 0,
    toastTimer: 0,
    dialog: null,
    lastFocus: null,
    dropPin: null,
    shared: false,
    routeTimers: []
  };

  var orders = DATA.orders;
  var finale = DATA.finale;
  var allOrders = orders.concat([finale]);

  /* ---------------- 存档 ---------------- */
  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { nights: 0, last: null };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { nights: 0, last: null };
      var last = parsed.last && Array.isArray(parsed.last.tickets) ? parsed.last : null;
      var total = parsed.total && typeof parsed.total === "object" ? parsed.total : {};
      var seeded = !parsed.total && last; // 旧存档只有上一夜，没有累计账；至少把这一夜补进账本
      return {
        nights: Number(parsed.nights) || 0,
        last: last,
        total: {
          orders: Number(total.orders) || (seeded ? 4 : 0),
          distance: Number(total.distance) || (seeded ? 19.5 : 0),
          income: Number(total.income) || (seeded ? 36.5 : 0)
        }
      };
    } catch (e) {
      return { nights: 0, last: null, total: { orders: 0, distance: 0, income: 0 } };
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nights: store.nights, last: store.last, total: store.total }));
    } catch (e) { /* file:// 或隐私模式下降级 */ }
  }

  /* ---------------- 环境声 ----------------
   * 不加载音频文件：用 Web Audio 合成一层雨声与城市低频。
   * 默认关闭，只有点击开关才创建 AudioContext，避免自动播放；
   * 音量很低，作为阅读时的底色，而不是配乐。 */
  var ambience = { ctx: null, master: null, on: false };

  function pinkNoiseBuffer(ctx, seconds) {
    var length = Math.floor(ctx.sampleRate * seconds);
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < length; i += 1) {
      var white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function buildAmbience() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    var ctx = new Ctx();
    var master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    var source = ctx.createBufferSource();
    source.buffer = pinkNoiseBuffer(ctx, 6);
    source.loop = true;

    var high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 160;
    var low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1400;
    low.Q.value = 0.4;

    var rain = ctx.createGain();
    rain.gain.value = 0.32;
    var wave = ctx.createOscillator();
    wave.type = "sine";
    wave.frequency.value = 0.08;
    var waveDepth = ctx.createGain();
    waveDepth.gain.value = 0.05;

    source.connect(high);
    high.connect(low);
    low.connect(rain);
    rain.connect(master);
    wave.connect(waveDepth);
    waveDepth.connect(rain.gain);

    // 57Hz 的城市底噪：像远处江面上的船，几乎听不见，但让雨不悬空。
    var hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 57;
    var humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    hum.connect(humGain);
    humGain.connect(master);

    source.start();
    wave.start();
    hum.start();
    ambience.ctx = ctx;
    ambience.master = master;
    return true;
  }

  function setAmbience(on) {
    if (on && !ambience.ctx) {
      try {
        if (!buildAmbience()) return;
      } catch (e) {
        return;
      }
    }
    if (!ambience.ctx) return;
    if (on && ambience.ctx.state === "suspended") ambience.ctx.resume();
    var now = ambience.ctx.currentTime;
    var gain = ambience.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(on ? 0.7 : 0, now + (on ? 1.2 : 0.45));
    ambience.on = on;
    if (el.soundToggle) {
      el.soundToggle.setAttribute("aria-pressed", on ? "true" : "false");
      el.soundToggle.setAttribute("aria-label", on ? "关闭环境声" : "开启环境声：雨声与江风");
      el.soundToggle.dataset.engine = ambience.ctx.state;
    }
    if (el.soundLabel) el.soundLabel.textContent = on ? "雨声 · 已开启" : "雨声 · 可开启";
    document.documentElement.dataset.sound = on ? "on" : "off";
  }

  function toggleAmbience() {
    setAmbience(!ambience.on);
  }
  function currentOrder() {
    return state.orderIndex < orders.length ? orders[state.orderIndex] : finale;
  }
  function batteryFor(order) {
    return { o1: "23%", o2: "19%", o3: "14%", o4: "9%" }[order.id] || "23%";
  }

  // 一张小票只由「哪一单 + 门口选的哪个」决定；分享链接也只需存这两个下标。
  function buildTicket(order, index) {
    var choice = order.scene.choices[index];
    if (!choice) return null;
    var ticket = {};
    Object.keys(order.scene.ticket).forEach(function (k) { ticket[k] = order.scene.ticket[k]; });
    ticket.customer = order.customer;
    ticket.orderId = order.id;
    ticket.choice = choice.short || choice.label;
    ticket.outcome = choice.outcome;
    return ticket;
  }

  function nightCodes() {
    var picked = {};
    state.choices.forEach(function (pickedChoice) { picked[pickedChoice.order] = pickedChoice.choice; });
    return allOrders.map(function (order) {
      return picked[order.id] === 1 ? "1" : "0";
    }).join("");
  }

  function shareUrl() {
    var base = location.href.split("#")[0].split("?")[0];
    return base + "?night=" + (store.nights || 1) + "&c=" + nightCodes();
  }

  // 只读还原：不改访问者的 localStorage，也不改夜班次数。
  function readSharedNight() {
    try {
      var params = new URLSearchParams(location.search);
      var night = parseInt(params.get("night"), 10);
      var codes = params.get("c") || "";
      if (!(night > 0 && night < 10000) || !/^[01]{4}$/.test(codes)) return null;
      var tickets = [];
      var picks = [];
      for (var i = 0; i < allOrders.length; i += 1) {
        var index = codes.charAt(i) === "1" ? 1 : 0;
        var ticket = buildTicket(allOrders[i], index);
        if (!ticket) return null;
        tickets.push(ticket);
        var choice = allOrders[i].scene.choices[index];
        picks.push({ order: allOrders[i].id, choice: index, label: choice.label });
      }
      return {
        night: night,
        last: {
          date: STORY_DATE,
          tickets: tickets,
          choices: picks,
          stats: {
            orders: DATA.summary.totalOrders,
            distance: DATA.summary.distance,
            income: DATA.summary.income
          }
        }
      };
    } catch (e) {
      return null;
    }
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
    el.mapSkip.hidden = true;
    el.rideProgress.hidden = true;
    el.rideBar.style.width = "0%";
    el.dispatchHint.textContent = isFinale ? "最后一单。送到就收工。" : "提示：骑行中可以点「跳过骑行」，直接到门口。";
    el.orderCard.classList.remove("is-finished");
    showPins(order);
    setScooterStart(order);
    renderHeadStatus();
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
    renderTrailStops();
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

  function clearTrail() {
    if (el.mapTrail) el.mapTrail.innerHTML = "";
    if (el.mapFrame) el.mapFrame.classList.remove("has-trail");
  }

  // 送达后不删路线：把它压暗、去掉描边动画，沉到地图底层留作今夜的路。
  function archiveRoute() {
    if (!el.mapTrail || !el.mapRoutes) return;
    $$(".route", el.mapRoutes).forEach(function (path) {
      var trail = path.cloneNode(true);
      trail.removeAttribute("style");
      trail.setAttribute("class", "trail");
      el.mapTrail.appendChild(trail);
    });
  }

  // 已送达的点按订单号留成小灯，跑完四单，地图上就有 01–04 四个亮过的位置。
  function renderTrailStops(tickets) {
    if (!el.mapTrail) return;
    tickets = tickets || state.tickets;
    $$(".trail-stop", el.mapTrail).forEach(function (node) { node.remove(); });
    tickets.forEach(function (ticket) {
      var order = allOrders.filter(function (o) {
        return o.id === ticket.orderId || o.scene.ticket.no === ticket.no;
      })[0];
      if (!order || !order.drop) return;
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "trail-stop");
      g.setAttribute("data-order", order.id);
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", "回看第 " + order.no + " 单 · " + order.drop.short);
      g.setAttribute("transform", "translate(" + order.drop.x + " " + order.drop.y + ")");
      var hit = document.createElementNS(NS, "circle");
      hit.setAttribute("class", "ts-hit");
      hit.setAttribute("r", "30");
      g.appendChild(hit);
      // 视觉之外再留一枚焦点环：热区放大到 30 后，虚线环仍贴着编号。
      var focusRing = document.createElementNS(NS, "circle");
      focusRing.setAttribute("class", "ts-focus");
      focusRing.setAttribute("r", "19.5");
      g.appendChild(focusRing);
      [["ts-halo", 12], ["ts-ring", 6], ["ts-core", 2.6]].forEach(function (spec) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("class", spec[0]);
        c.setAttribute("r", String(spec[1]));
        g.appendChild(c);
      });
      var t = document.createElementNS(NS, "text");
      t.setAttribute("x", "9");
      t.setAttribute("y", "3.4");
      t.textContent = order.no;
      g.appendChild(t);
      // 编号之外补一个名字：夜里跑过的不是四个点，是四个人。
      var name = document.createElementNS(NS, "text");
      name.setAttribute("class", "ts-name");
      name.setAttribute("x", "20");
      name.setAttribute("y", "3.4");
      name.textContent = order.customer;
      g.appendChild(name);
      el.mapTrail.appendChild(g);
    });
    if (el.mapFrame) {
      el.mapFrame.classList.toggle("has-trail", $$(".trail-stop", el.mapTrail).length > 0);
    }
  }

  // 刷新后，上一夜的路网与 01–04 送达点仍在图上；
  // 只在真正重新上线时清空，让「地图记得这一夜」而不只是小票记得。
  function renderStoredTrail() {
    if (!el.mapTrail || !store.last) return;
    clearTrail();
    var tickets = store.last.tickets || [];
    allOrders.forEach(function (order) {
      var seen = tickets.some(function (t) {
        return t.orderId === order.id || t.no === order.scene.ticket.no;
      });
      if (!seen) return;
      [order.approach, order.delivery].forEach(function (d) {
        if (!d) return;
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "trail trail-stored");
        el.mapTrail.appendChild(path);
      });
    });
    renderTrailStops(tickets);
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
        archiveRoute();
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
        archiveRoute();
        toast("已送达 · " + order.drop.short);
        addLog(order.scene.time, "已送达 · " + order.drop.short);
        markDropPinArrived(true);
        return sleep(520);
      });
    });
  }

  /* ---------------- 接单 / 场景 ---------------- */
  function revealMapInSingleColumn() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 980px)").matches) return;
    var panel = document.querySelector(".map-panel");
    if (!panel) return;
    setTimeout(function () {
      if (state.phase !== "riding") return;
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }, 320);
  }

  function acceptOrder() {
    if (state.phase === "riding" || state.phase === "scene" || state.phase === "summary") return;
    if (!state.started) state.started = true;
    state.skip = false;
    state.phase = "riding";
    var order = currentOrder();
    el.acceptBtn.hidden = true;
    el.skipRide.hidden = false;
    el.skipRide.disabled = false;
    el.mapSkip.hidden = false;
    el.mapSkip.disabled = false;
    el.rideProgress.hidden = false;
    el.dispatchState.textContent = "配送中";
    el.orderKicker.textContent = order.id === "o4" ? "回家 / HOME" : "配送中 / ON THE WAY";
    addLog(order.time, order.id === "o4" ? "接单 · 回家" : "接单 · " + order.pickup.short);
    renderTimeline();
    revealMapInSingleColumn();
    rideOrder(order).then(function () {
      state.phase = "scene";
      openScene(order);
    }).catch(function (err) {
      console.error(err);
      state.phase = "map";
      el.acceptBtn.hidden = false;
      el.acceptBtn.disabled = false;
      el.skipRide.hidden = true;
      el.mapSkip.hidden = true;
      el.rideProgress.hidden = true;
      el.dispatchState.textContent = "待接单";
    });
  }

  function openScene(order) {
    var scene = order.scene;
    el.skipRide.hidden = true;
    el.mapSkip.hidden = true;
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
    renderHeadStatus();
    renderTimeline();
  }

  function choose(index) {
    if (state.phase !== "scene") return;
    var order = currentOrder();
    var choice = order.scene.choices[index];
    if (!choice) return;
    state.phase = "scene-result";
    state.choices.push({ order: order.id, choice: index, label: choice.label });

    var ticket = buildTicket(order, index);
    if (!ticket) return;
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
    renderHeadStatus();
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
    if (!store.total) store.total = { orders: 0, distance: 0, income: 0 };
    store.total.orders += Number(DATA.summary.totalOrders) || 4;
    store.total.distance += Number(DATA.summary.distance) || 19.5;
    store.total.income += Number(DATA.summary.income) || 36.5;
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
    renderHeadStatus();
    renderSummary(night);
    renderTrailStops();
    renderNotes();
    renderTimeline();
    syncHeroCta();

    el.dispatchState.textContent = "已收工";
    el.acceptBtn.hidden = false;
    el.acceptBtn.disabled = false;
    el.acceptBtn.innerHTML = "翻看收工小票" + '<span class="arrow" aria-hidden="true">→</span>';
    el.skipRide.hidden = true;
    el.mapSkip.hidden = true;
    el.rideProgress.hidden = true;
    el.orderCard.classList.add("is-finished");
    el.orderKicker.textContent = "已收工 / OFF DUTY";
    el.dispatchHint.textContent = "小票已存好。可以再跑一夜。";
    setMapLive(true);

    el.summary.hidden = false;
    lockScroll(true);
    document.addEventListener("keydown", onDialogKeydown);
    setTimeout(function () { el.saveReceipt.focus(); }, 100);
  }

  // 最后一单门口的选择决定小票的落款：跑了四单 → 妈下的单；端汤上桌 → 回家。
  function closingLine(choices) {
    var line = DATA.summary.subline;
    (choices || state.choices).forEach(function (picked) {
      if (picked.order !== "o4") return;
      var choice = DATA.finale.scene.choices[picked.choice];
      if (choice && choice.closing) line = choice.closing;
    });
    return line;
  }

  // 把这一夜的六段路缩进纸票：与地图共用同一份路径数据，
  // 只保留江的暗影、路线与 01–04 四盏灯，作为可带走的路网存根。
  var MINI_RIVER = "M 40 760 C 200 660 350 590 500 540 C 650 485 760 420 850 330 C 930 250 990 140 1020 0";

  function routeMapGeometry(w, h, pad) {
    var segments = [];
    var stops = [];
    var points = [];
    allOrders.forEach(function (order, leg) {
      var finalLeg = order.id === "o4";
      [order.approach, order.delivery].forEach(function (d) {
        if (!d) return;
        segments.push({ d: d, final: finalLeg, leg: leg });
        var nums = d.match(/-?\d+(?:\.\d+)?/g) || [];
        for (var i = 0; i + 1 < nums.length; i += 2) {
          points.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
        }
      });
      if (order.drop) {
        stops.push({ x: order.drop.x, y: order.drop.y, no: order.no, final: finalLeg });
      }
    });

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(function (p) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    });
    var bw = Math.max(1, maxX - minX);
    var bh = Math.max(1, maxY - minY);
    var scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    var tx = (w - bw * scale) / 2 - minX * scale;
    var ty = (h - bh * scale) / 2 - minY * scale;

    stops.forEach(function (s) {
      s.sx = tx + s.x * scale;
      s.sy = ty + s.y * scale;
    });
    return { scale: scale, tx: tx, ty: ty, segments: segments, stops: stops };
  }

  function renderSummaryRoute() {
    if (!el.summaryRoute) return;
    var geo = routeMapGeometry(330, 64, 7);
    var markup = '<g transform="translate(' + geo.tx.toFixed(2) + ' ' + geo.ty.toFixed(2) +
      ') scale(' + geo.scale.toFixed(4) + ')">' +
      '<path class="mini-river" d="' + MINI_RIVER + '"/>';
    geo.segments.forEach(function (s) {
      markup += '<path class="mini-route' + (s.final ? ' is-final' : '') + '" data-leg="' + s.leg + '" pathLength="100" d="' + s.d + '"/>';
    });
    markup += '</g>';
    geo.stops.forEach(function (s, i) {
      markup += '<g class="mini-stop' + (s.final ? ' is-final' : '') + '" data-stop="' + i + '">' +
        '<circle cx="' + s.sx.toFixed(2) + '" cy="' + s.sy.toFixed(2) + '" r="3.1"/>' +
        '<text x="' + (s.sx + (s.final ? -14 : 5)).toFixed(2) + '" y="' + (s.sy + 2.6).toFixed(2) + '">' +
        s.no + '</text></g>';
    });
    el.summaryRoute.innerHTML = markup;
    if (el.routeMeta) el.routeMeta.textContent = DATA.summary.distance + " KM";
  }

  // 纸票上的路网不是一张死图：按这一夜的顺序重走一遍，四盏灯依次亮起。
  function stopRoutePlay() {
    state.routeTimers.forEach(function (t) { clearTimeout(t); });
    state.routeTimers = [];
    if (!el.receiptRoute) return;
    el.receiptRoute.classList.remove("is-playing");
    $$("#summaryRoute .mini-route, #summaryRoute .mini-stop").forEach(function (n) {
      n.classList.remove("is-on");
    });
    if (el.routeMeta) el.routeMeta.textContent = DATA.summary.distance + " KM";
    if (el.replayRoute) el.replayRoute.textContent = "重走 ↗";
  }

  function playRoute() {
    if (!el.summaryRoute || !el.receiptRoute) return;
    stopRoutePlay();
    var routes = $$("#summaryRoute .mini-route");
    var stops = $$("#summaryRoute .mini-stop");
    if (!routes.length || !stops.length) return;
    if (reduceMotion) {
      routes.forEach(function (n) { n.classList.add("is-on"); });
      stops.forEach(function (n) { n.classList.add("is-on"); });
      return;
    }
    el.receiptRoute.classList.add("is-playing");
    el.replayRoute.textContent = "重走中…";
    var step = 360;
    stops.forEach(function (stop, i) {
      var legRoutes = routes.filter(function (r) { return r.getAttribute("data-leg") === String(i); });
      state.routeTimers.push(setTimeout(function () {
        legRoutes.forEach(function (r) { r.classList.add("is-on"); });
        el.routeMeta.textContent = String(i + 1).padStart(2, "0") + " / 04";
      }, i * step));
      state.routeTimers.push(setTimeout(function () {
        stop.classList.add("is-on");
      }, i * step + 200));
    });
    state.routeTimers.push(setTimeout(function () {
      if (el.receiptRoute) el.receiptRoute.classList.remove("is-playing");
      if (el.routeMeta) el.routeMeta.textContent = DATA.summary.distance + " KM";
      if (el.replayRoute) el.replayRoute.textContent = "重走 ↗";
      state.routeTimers = [];
    }, stops.length * step + 460));
  }

  function renderSummary(night, tickets, choices) {
    stopRoutePlay();
    tickets = tickets || state.tickets;
    el.sumOrders.textContent = DATA.summary.totalOrders;
    el.sumDistance.textContent = DATA.summary.distance;
    el.sumIncome.textContent = DATA.summary.income;
    el.summaryNight.textContent = night;
    var ledger = store.total || { orders: 0, distance: 0, income: 0 };
    if (el.summaryTotal) {
      el.summaryTotal.textContent = state.shared
        ? "朋友的一夜"
        : "累计 " + ledger.orders + " 单 / " + ledger.distance.toFixed(1) + " KM";
    }
    el.summaryLine.textContent = DATA.summary.line;
    el.summarySubline.textContent = closingLine(choices);
    el.summarySubline.classList.add("is-personal");
    renderSummaryRoute();

    el.summaryTickets.innerHTML = tickets.map(function (t) {
      return '<li><button class="r-row" type="button" data-order="' + escape(t.orderId) + '" ' +
        'aria-label="回看 ' + escape(t.no) + ' · ' + escape(t.place) + ' 的小票">' +
        '<span class="r-no">' + escape(t.no) + '</span>' +
        '<span class="r-body"><b>' + escape(t.place) + ' · ' + escape(t.time) +
        (t.choice ? '<em class="r-choice">你 · ' + escape(t.choice) + '</em>' : '') +
        '</b>' + escape(t.note) + '<span>' + escape(t.items) + '</span></span></button></li>';
    }).join("");
  }

  // 收工后小票会关掉；从地图按钮或小票区都能把它翻回来，不要求刷新页面。
  function openSummary(returnTo) {
    var tickets = state.tickets.length === 4 ? state.tickets : ((store.last && store.last.tickets) || []);
    var choices = state.choices.length ? state.choices : ((store.last && store.last.choices) || []);
    if (tickets.length !== 4) return;
    state.phase = "summary";
    state.dialog = el.summary;
    state.summaryReturn = returnTo || null;
    state.lastFocus = document.activeElement;
    renderSummary(store.nights || 1, tickets, choices);
    el.summary.hidden = false;
    lockScroll(true);
    document.addEventListener("keydown", onDialogKeydown);
    setTimeout(function () { el.saveReceipt.focus({ preventScroll: true }); }, 80);
  }

  function closeSummary(toOrderId) {
    stopRoutePlay();
    el.summary.hidden = true;
    state.dialog = null;
    state.phase = state.tickets.length === 4 ? "done" : "idle";
    var back = state.summaryReturn;
    var target = typeof toOrderId === "string" ? toOrderId : null;
    state.summaryReturn = null;
    lockScroll(false);
    document.removeEventListener("keydown", onDialogKeydown);
    renderNotes();
    renderTimeline();
    renderHeadStatus();
    updateChrome();
    syncHeroCta();
    if (target) {
      setTimeout(function () { revealTicket(target); }, 60);
    } else if (back) {
      back.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      setTimeout(function () { el.closeSummary.blur(); }, 80);
    } else {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      setTimeout(function () { el.startBtn.focus({ preventScroll: true }); }, 200);
    }
  }

  function replayNight() {
    el.summary.hidden = true;
    state.dialog = null;
    lockScroll(false);
    document.removeEventListener("keydown", onDialogKeydown);
    resetRun();
  }

  function resetRun() {
    if (state.shared) {
      store.last = null;
      store.nights = 0;
      store.total = { orders: 0, distance: 0, income: 0 };
      state.shared = false;
    }
    try { history.replaceState(null, "", location.href.split("?")[0].split("#")[0]); } catch (e) { /* 忽略 */ }
    state.started = true;
    state.phase = "map";
    state.orderIndex = 0;
    state.tickets = [];
    state.choices = [];
    state.skip = false;
    clearRoutes();
    clearTrail();
    if (el.scooter) el.scooter.style.display = "";
    setMapLive(false);
    el.dispatchLog.innerHTML = "";
    el.dispatchLog.appendChild(el.logEmpty);
    el.logEmpty.textContent = "重新上线。";
    el.orderCard.classList.remove("is-finished");
    renderOrder(orders[0]);
    renderNotes();
    renderTimeline();
    syncHeroCta();
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
  // 首屏是“此刻”的入口：收工/存档后不再喊「接单，出发」，
  // 而是承认这一夜已经发生，把入口改成翻看小票。
  var heroDefault = null;
  function syncHeroCta() {
    if (!el.startBtn) return;
    if (!heroDefault) {
      heroDefault = {
        sub: el.heroSub ? el.heroSub.innerHTML : "",
        lede: el.heroLede ? el.heroLede.innerHTML : ""
      };
    }
    var archived = !state.started && !!store.last;
    var done = state.tickets.length === 4;
    var arrow = '<span class="arrow" aria-hidden="true">→</span>';
    if (archived) {
      el.startBtn.innerHTML = (state.shared ? "翻看朋友的一夜" : "翻看这一夜") + arrow;
      if (el.heroSub) el.heroSub.innerHTML = (state.shared ? "朋友的一夜 · 02:52 收工。" : "上一夜 · 02:52 收工。");
      if (el.heroLede) el.heroLede.innerHTML = "四张小票还在桌上，那条路也记得。<br>点开看看，也可以再跑一夜。";
    } else if (done) {
      el.startBtn.innerHTML = "翻看这一夜" + arrow;
      if (el.heroSub) el.heroSub.innerHTML = "这一夜 · 02:52 收工。";
      if (el.heroLede) el.heroLede.innerHTML = "四张小票都收好了，那条路也记得。<br>点开看看，或者再跑一夜。";
    } else {
      el.startBtn.innerHTML = "接单，出发" + arrow;
      if (el.heroSub) el.heroSub.innerHTML = heroDefault.sub;
      if (el.heroLede) el.heroLede.innerHTML = heroDefault.lede;
    }
  }

  function startShift() {
    if (state.phase === "summary") return;
    if ((!state.started && store.last) || state.tickets.length === 4 || state.phase === "done") {
      openSummary(document.getElementById("hero"));
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
    renderHeadStatus();
    document.getElementById("ride").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.acceptBtn.classList.remove("is-pulse");
    void el.acceptBtn.offsetWidth;
    el.acceptBtn.classList.add("is-pulse");
    setTimeout(function () {
      el.acceptBtn.classList.remove("is-pulse");
      el.acceptBtn.focus({ preventScroll: true });
    }, 1400);
  }

  /* ---------------- 顶栏夜班状态 ---------------- */
  // 顶栏不是装饰：时间、电量与四格送单进度跟着这一夜一起走。
  function renderHeadStatus() {
    if (!el.headStatus) return;
    var order = state.started ? currentOrder() : orders[0];
    if (!order) order = orders[0];
    var archive = !state.started && !!store.last;
    var time = archive ? DATA.meta.endTime : order.time;
    if (state.phase === "scene" || state.phase === "scene-result") time = order.scene.time;
    if (state.phase === "summary" || state.phase === "done") time = DATA.meta.endTime;

    var battery = archive ? "9%" : batteryFor(order);
    var pct = parseInt(battery, 10) || 0;
    el.headClock.textContent = time;
    el.headBattery.textContent = battery;
    el.headBatteryBar.style.width = pct + "%";
    el.headBatteryBar.parentNode.classList.toggle("is-low", pct <= 12);

    var done = archive ? 4 : state.tickets.length;
    var showNow = !archive && state.started && state.phase !== "summary" && state.phase !== "done" && done < 4;
    $$("i", el.headOrders).forEach(function (tick, index) {
      tick.classList.toggle("is-on", index < done);
      tick.classList.toggle("is-now", showNow && index === done);
    });

    el.headStatus.setAttribute("aria-label",
      "夜班状态：武昌，" + time + "，电量 " + battery + "，已送达 " + done + " 单");
  }

  /* ---------------- 小票与日志 ---------------- */
  // 存档里只有短标签的老小票，按短标签回查当时那句话之后发生了什么。
  function ticketAfter(order, ticket) {
    if (ticket.outcome) return ticket.outcome;
    var choices = (order.scene && order.scene.choices) || [];
    for (var i = 0; i < choices.length; i++) {
      if (choices[i].short === ticket.choice || choices[i].label === ticket.label) return choices[i].outcome;
    }
    return "";
  }

  // 地图上的 01–04 是这一夜的目录：点一盏灯，就翻到那一单的小票。
  function revealTicket(orderId) {
    if (!el.ticketRow) return;
    var card = el.ticketRow.querySelector('.ticket[data-order="' + orderId + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    $$(".ticket.is-flash", el.ticketRow).forEach(function (node) { node.classList.remove("is-flash"); });
    void card.offsetWidth;
    card.classList.add("is-flash");
    card.focus({ preventScroll: true });
    setTimeout(function () { card.classList.remove("is-flash"); }, 1900);
  }

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
        return '<article class="ticket is-locked" data-order="' + escape(order.id) + '" tabindex="-1">' +
          '<div class="ticket-top"><span class="ticket-no">' + escape(order.scene.ticket.no) + '</span><span class="ticket-no">未送达</span></div>' +
          '<div class="ticket-who"><h3>待送达</h3><span>' + escape(order.drop.short) + '</span></div>' +
          '<p class="ticket-note">这一单还没有送出。<span class="ticket-locked-line"></span><span class="ticket-locked-line" style="width:38%"></span></p>' +
          '<span class="ticket-locked-mark" aria-hidden="true">未送达</span>' +
          '<div class="ticket-foot"><span>—</span><span>' + escape(order.id === "o4" ? "最后一单" : "今夜") + '</span></div>' +
          '</article>';
      }
      var after = ticketAfter(order, ticket);
      var afterId = "after-" + order.id;
      return '<article class="ticket" data-order="' + escape(order.id) + '" tabindex="-1">' +
        '<div class="ticket-top"><span class="ticket-no">' + escape(ticket.no) + '</span><span class="ticket-stamp">' + escape(ticket.stamp) + '</span></div>' +
        '<div class="ticket-who"><h3>' + escape(ticket.customer) + '</h3><span>' + escape(ticket.place) + '</span></div>' +
        '<p class="ticket-note">' + escape(ticket.note) + '</p>' +
        (ticket.choice ? '<button class="ticket-choice" type="button" aria-expanded="false" aria-controls="' + afterId + '"><i>你</i><span class="tc-label">' + escape(ticket.choice) + '</span><span class="tc-cue" aria-hidden="true">后来 +</span></button>' : '') +
        (after ? '<div class="ticket-after" id="' + afterId + '" hidden><p>' + escape(after) + '</p></div>' : '') +
        '<div class="ticket-foot"><span>' + escape(ticket.time) + '</span><span>' + escape(ticket.items) + '</span></div>' +
        '</article>';
    }).join("");

    if (el.reopenNotes) el.reopenNotes.hidden = tickets.length !== 4;

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
  // 把 330×64 的路网存根画进任意尺寸的暗色条带；无 Path2D 时只留底色。
  function drawReceiptRoute(ctx, x, y, w, h) {
    var geo = routeMapGeometry(330, 64, 7);
    var k = Math.min(w / 330, h / 64);
    var ox = x + (w - 330 * k) / 2;
    var oy = y + (h - 64 * k) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "#0a151f";
    ctx.fillRect(x, y, w, h);

    if (window.Path2D) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(k, k);
      ctx.translate(geo.tx, geo.ty);
      ctx.scale(geo.scale, geo.scale);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#173b4b";
      ctx.lineWidth = 26;
      ctx.stroke(new Path2D(MINI_RIVER));
      geo.segments.forEach(function (s) {
        ctx.strokeStyle = s.final ? "rgba(255,107,69,.82)" : "rgba(255,180,92,.58)";
        ctx.lineWidth = 2.2;
        ctx.stroke(new Path2D(s.d));
      });
      ctx.restore();
    }

    geo.stops.forEach(function (s) {
      var sx = ox + s.sx * k;
      var sy = oy + s.sy * k;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = "#0a151f";
      ctx.fill();
      ctx.strokeStyle = s.final ? "#ff6b45" : "#ffb45c";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#ffd9a8";
      ctx.font = '9px "SFMono-Regular", Consolas, monospace';
      ctx.textAlign = "left";
      ctx.fillText(s.no, sx + (s.final ? -17 : 6), sy + 3);
    });
    ctx.restore();
  }

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

    // 小票上的路网存根：和页面里的 mini map 共用同一份路径数据。
    ctx.fillStyle = "#8a6a45";
    ctx.font = '9px "SFMono-Regular", Consolas, monospace';
    ctx.textAlign = "left";
    ctx.fillText("这一夜的路 / 01 — 04", 50, 322);
    ctx.textAlign = "right";
    ctx.fillText(DATA.summary.distance + " 公里", W - 50, 322);
    ctx.textAlign = "left";
    drawReceiptRoute(ctx, 48, 334, W - 96, 90);
    ctx.fillStyle = "#8a6a45";
    ctx.font = '9px "SFMono-Regular", Consolas, monospace';
    ctx.fillText("每一单都从取餐点出发，最后一段回到自己家。", 50, 440);

    ctx.strokeStyle = "rgba(70,48,25,.3)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(50, 460);
    ctx.lineTo(W - 50, 460);
    ctx.stroke();
    ctx.setLineDash([]);

    var cursor = 498;
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
    ctx.fillText(DATA.summary.line, W / 2, cursor + 52);
    ctx.fillStyle = "#a33a2b";
    ctx.font = '600 10px "SFMono-Regular", Consolas, monospace';
    ctx.fillText(closingLine(), W / 2, cursor + 78);

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
    var ledger = store.total || { orders: 0, distance: 0 };
    ctx.fillStyle = "#a08363";
    ctx.font = '8px "SFMono-Regular", Consolas, monospace';
    ctx.fillText("累计 " + ledger.orders + " 单 / " + Number(ledger.distance).toFixed(1) + " KM", W - 50, H - 36);

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

  // 链接只带「第几夜 + 四个门口选择」，打开即还原同一张小票与同一条路网。
  function copyNightLink() {
    if (!el.copyNight) return;
    var url = shareUrl();
    function finish(text) {
      el.copyNight.textContent = text;
      setTimeout(function () { el.copyNight.textContent = "分享 ↗"; }, 2400);
    }
    // 剪贴板不可用时给出真实链接：地址栏里没有 ?night & c，不能让人去复制地址栏。
    function manual() {
      window.prompt("复制这一夜的链接（只含第几夜与四个选择）", url);
      finish("链接已给出");
    }
    function legacyCopy() {
      var area = document.createElement("textarea");
      area.value = url;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(area);
      if (ok) finish("已复制"); else manual();
    }
    function copy() {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () { finish("已复制"); }, legacyCopy);
      } else {
        legacyCopy();
      }
    }
    // 手机优先系统分享面板；用户取消（AbortError）不再重复复制。
    if (navigator.share && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      navigator.share({
        title: "最后一单 · 今夜小票",
        text: "我在《最后一单》跑了一夜，这是今夜的四个选择。",
        url: url
      }).then(function () { finish("已分享"); }, function (err) {
        if (!err || err.name !== "AbortError") copy();
      });
      return;
    }
    copy();
  }

  function wrapText(ctx, text, maxWidth) {    var lines = [];
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
    if (el.soundToggle) el.soundToggle.addEventListener("click", toggleAmbience);
    el.acceptBtn.addEventListener("click", function () {
      if (!state.started && store.last) { resetRun(); return; }   // 存档态：真正清空上一夜
      if (state.phase === "done") { openSummary(el.orderCard); return; }
      acceptOrder();
    });
    if (el.reopenNotes) el.reopenNotes.addEventListener("click", function () { openSummary(document.getElementById("notes")); });
    function skipRideNow() {
      state.skip = true;
      el.skipRide.disabled = true;
      el.mapSkip.disabled = true;
      el.rideStatus.textContent = "正在加速…";
    }
    el.skipRide.addEventListener("click", skipRideNow);
    el.mapSkip.addEventListener("click", skipRideNow);
    el.ticketRow.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest(".ticket-choice") : null;
      if (!btn || !el.ticketRow.contains(btn)) return;
      var open = btn.getAttribute("aria-expanded") === "true";
      $$(".ticket-choice", el.ticketRow).forEach(function (other) {
        var panel = document.getElementById(other.getAttribute("aria-controls"));
        other.setAttribute("aria-expanded", "false");
        var cue = $(".tc-cue", other);
        if (cue) cue.textContent = "后来 +";
        if (panel) panel.hidden = true;
      });
      if (!open) {
        btn.setAttribute("aria-expanded", "true");
        var cue = $(".tc-cue", btn);
        if (cue) cue.textContent = "收起 −";
        var panel = document.getElementById(btn.getAttribute("aria-controls"));
        if (panel) panel.hidden = false;
      }
    });
    el.sceneNext.addEventListener("click", nextScene);
    el.saveReceipt.addEventListener("click", saveReceiptImage);
    el.replayBtn.addEventListener("click", replayNight);
    el.closeSummary.addEventListener("click", closeSummary);
    el.summaryTickets.addEventListener("click", function (ev) {
      var row = ev.target.closest ? ev.target.closest(".r-row") : null;
      if (!row || !el.summaryTickets.contains(row)) return;
      closeSummary(row.getAttribute("data-order"));
    });
    if (el.copyNight) el.copyNight.addEventListener("click", copyNightLink);
    if (el.replayRoute) el.replayRoute.addEventListener("click", playRoute);
    if (el.mapTrail) {
      el.mapTrail.addEventListener("click", function (e) {
        var stop = e.target.closest ? e.target.closest(".trail-stop") : null;
        if (stop) revealTicket(stop.getAttribute("data-order"));
      });
      el.mapTrail.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var stop = e.target.closest ? e.target.closest(".trail-stop") : null;
        if (!stop) return;
        e.preventDefault();
        revealTicket(stop.getAttribute("data-order"));
      });
    }

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

  function setMapLive(mode) {
    if (!el.mapLive) return;
    var label = mode === "shared" ? "SHARED · 武昌" : mode ? "ARCHIVE · 武昌" : "LIVE · 武昌";
    el.mapLive.innerHTML = '<i aria-hidden="true"></i>' + label;
  }

  function renderArchive() {
    if (state.started || !store.last) return;
    renderOrder(finale, { focus: false });
    el.mapPins.innerHTML = "";
    if (el.scooter) el.scooter.style.display = "none";
    renderStoredTrail();
    setMapLive(state.shared ? "shared" : true);
    el.logEmpty.textContent = "上一夜已收工。";
    el.mapClock.textContent = DATA.meta.endTime;
    el.dispatchState.textContent = "已收工";
    el.dispatchCount.textContent = "4 / 4";
    el.dispatchTime.textContent = DATA.meta.endTime;
    el.orderKicker.textContent = state.shared ? "朋友的一夜 / SHARED NIGHT" : "上一夜 / LAST NIGHT";
    el.acceptBtn.innerHTML = "再跑一夜" + '<span class="arrow" aria-hidden="true">→</span>';
    el.dispatchHint.textContent = state.shared
      ? "这是朋友分享的一夜。点「再跑一夜」开始你自己的。"
      : "上一夜留在了浏览器里。点「再跑一夜」清空路网，重新上线。";
  }

  function init() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    var shared = readSharedNight();
    if (shared) {
      store.last = shared.last;
      store.nights = shared.night;
      state.shared = true;
    }
    renderOrder(orders[0], { focus: false });
    renderArchive();
    renderNotes();
    renderTimeline();
    initCamera();
    setTimeout(function () {
      if (state.phase === "idle") focusOrder(orders[0]);
    }, 380);
    bind();
    initReveal();
    updateChrome();
    syncHeroCta();
  }

  init();
})();
