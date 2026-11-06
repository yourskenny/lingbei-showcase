#!/usr/bin/env node
/* 最后一单 · 无依赖回归脚本（Node 22+ 内置 WebSocket + Chromium CDP）
 *
 * 用法：
 *   python3 -m http.server 8080 --directory . &
 *   node scripts/regression.mjs
 *
 * 环境变量：
 *   BASE_URL   默认 http://localhost:8080/
 *   CHROME     默认 Playwright 缓存的 Chromium，可指向本机 Chrome
 *   SHOTS_DIR  默认 /tmp/lastorder-shots
 *   ONLY       mobile 只跑移动端
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const BASE = process.env.BASE_URL || "http://localhost:8080/";
const CHROME = process.env.CHROME || [
  "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].find(existsSync) || "google-chrome";
const SHOTS = process.env.SHOTS_DIR || "/tmp/lastorder-shots";
const ONLY = process.env.ONLY || "";
const PORT = 9334;
const WIDTHS = [
  { w: 1920, h: 1080, label: "1920" },
  { w: 1440, h: 900, label: "1440" },
  { w: 720, h: 900, label: "720" },
  { w: 390, h: 844, label: "390", mobile: true }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const pass = (m) => console.log("  ✓ " + m);
const fail = (m) => { failures.push(m); console.log("  ✗ " + m); };
const assert = (ok, m) => (ok ? pass(m) : fail(m));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
  }
  ready() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error("CDP WebSocket 连接失败"));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function getJSON(path) {
  const res = await fetch("http://127.0.0.1:" + PORT + path);
  return res.json();
}

async function evalJS(cdp, expression, awaitPromise = true) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception;
    throw new Error((ex && (ex.description || ex.value)) || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function goto(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: !!mobile
  });
  await cdp.send("Page.navigate", { url: BASE + "?t=" + Date.now() });
  for (let i = 0; i < 60; i++) {
    const ready = await evalJS(cdp, "document.readyState").catch(() => "");
    if (ready === "complete") break;
    await sleep(100);
  }
  await sleep(550);
}

async function screenshot(cdp, name) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(SHOTS + "/" + name + ".png", Buffer.from(r.data, "base64"));
}

async function click(cdp, selector) {
  const ok = await evalJS(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error("找不到可点击元素: " + selector);
  await sleep(200);
}

async function overflowReport(cdp, width, label) {
  const data = await evalJS(cdp, `(() => {
    const vw = window.innerWidth;
    const out = [];
    document.querySelectorAll("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") return;
      if (el.closest(".hero-scene, .map-frame, .scene, .summary")) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (r.right > vw + 1 || r.left < -1) {
        out.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || "", left: Math.round(r.left), right: Math.round(r.right) });
      }
    });
    return { vw, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, out: out.slice(0, 12) };
  })()`);
  assert(data.scrollWidth <= width + 1, `${label}: 无横向滚动（scrollWidth ${data.scrollWidth} / vw ${data.vw}）`);
  if (data.out.length) {
    fail(`${label}: ${data.out.length} 个元素越界 ` + data.out.map((o) => o.tag + "." + String(o.cls).split(" ")[0] + "[" + o.left + "," + o.right + "]").join(" "));
  } else {
    pass(`${label}: 无元素越界`);
  }
}

async function waitScene(cdp, timeout = 5000) {
  for (let i = 0; i < timeout / 100; i++) {
    const open = await evalJS(cdp, "!document.querySelector('#scene').hidden");
    if (open) return true;
    await sleep(100);
  }
  return false;
}

async function deliver(cdp, index, label = "1440") {
  await click(cdp, "#acceptBtn");
  await sleep(480);
  const riding = await evalJS(cdp, "({skip: !document.querySelector('#skipRide').hidden, progress: !document.querySelector('#rideProgress').hidden, kicker: document.querySelector('#orderKicker').textContent})");
  assert(riding.skip && riding.progress, `${label}: 第 ${index + 1} 单进入骑行态`);
  assert(riding.kicker.includes("配送中") || riding.kicker.includes("回家"), `${label}: 第 ${index + 1} 单订单牌切到配送中`);
  if (index === 0) await screenshot(cdp, "riding-" + label);
  await click(cdp, "#skipRide");
  const opened = await waitScene(cdp);
  assert(opened, `${label}: 第 ${index + 1} 单到达场景`);
  if (!opened) throw new Error("场景未打开");
  const scene = await evalJS(cdp, `(() => {
    const shell = document.querySelector('.scene-shell').getBoundingClientRect();
    return {
      place: document.querySelector('#scenePlace').textContent,
      time: document.querySelector('#sceneTime').textContent,
      choices: document.querySelectorAll('#sceneChoices .choice').length,
      shell: { left: Math.round(shell.left), right: Math.round(shell.right), top: Math.round(shell.top), bottom: Math.round(shell.bottom) },
      visual: !!document.querySelector('#sceneVisual svg')
    };
  })()`);
  assert(scene.choices === 2, `${label}: 第 ${index + 1} 单给出两个选择`);
  assert(scene.visual, `${label}: 第 ${index + 1} 单场景插画已插入`);
  assert(scene.shell.left >= 0 && scene.shell.right <= (label === "390" ? 390 : 1440), `${label}: 场景层不越界`);
  const sceneDetails = [
    [["shared-umbrella", "两人共伞"]],
    [["bridge-smoke", "桥下热气"]],
    [["door-gap", "门开一条缝"], ["doorstep", "门口的鞋与垃圾袋"]],
    [["mother-ladle", "妈妈手里的汤勺"], ["second-setting", "第二副碗筷"]]
  ][index] || [];
  for (const [key, desc] of sceneDetails) {
    const detail = await evalJS(cdp, `!!document.querySelector('#sceneVisual [data-detail="${key}"]')`);
    assert(detail, `${label}: 场景 0${index + 1} 的「${desc}」细部在画面中`);
  }
  await sleep(600);
  if (index === 0) await screenshot(cdp, "scene-" + label);
  else await screenshot(cdp, `scene-0${index + 1}-${label}`);
  await click(cdp, "#sceneChoices .choice");
  await sleep(420);
  const result = await evalJS(cdp, `(() => ({
    visible: !document.querySelector('#sceneResult').hidden,
    note: document.querySelector('#miniTicketNote').textContent,
    stamp: document.querySelector('#miniTicketStamp').textContent,
    choice: document.querySelector('#miniTicketChoice').textContent,
    after: document.querySelector('#sceneAfter').textContent
  }))()`);
  assert(result.visible && result.note.length > 4 && result.stamp.length > 0, `${label}: 第 ${index + 1} 单结果与小票出现`);
  assert(result.choice.startsWith("你 · ") && result.choice.length > 4, `${label}: 第 ${index + 1} 单的选择留在小票上（${result.choice}）`);
  assert(result.after.length > 4, `${label}: 第 ${index + 1} 单收尾文案出现`);
  if (index === 0) await screenshot(cdp, "scene-result-" + label);
  await click(cdp, "#sceneNext");
  await sleep(650);

  const trail = await evalJS(cdp, `(() => ({
    paths: document.querySelectorAll('#mapTrail .trail').length,
    stops: document.querySelectorAll('#mapTrail .trail-stop').length,
    labels: Array.from(document.querySelectorAll('#mapTrail .trail-stop text')).map((t) => t.textContent).join(',')
  }))()`);
  const expectedPaths = [1, 3, 5, 6][index];
  assert(trail.paths === expectedPaths, `${label}: 第 ${index + 1} 单的 ${expectedPaths} 段轨迹留在地图上（${trail.paths}）`);
  assert(trail.stops === index + 1, `${label}: 地图留下 ${index + 1} 个已送达点（${trail.labels}）`);
}

async function runDesktop(cdp) {
  console.log("\n▶ 1440 完整一夜");
  await goto(cdp, 1440, 900, false);
  await evalJS(cdp, "localStorage.clear()");
  await goto(cdp, 1440, 900, false);
  const title = await evalJS(cdp, "document.querySelector('h1').textContent.trim()");
  assert(title === "最后一单", "首屏标题为「最后一单」");
  await screenshot(cdp, "home-1440");

  await click(cdp, "#startBtn");
  await sleep(1200);
  const started = await evalJS(cdp, "({y: Math.round(window.scrollY), accept: !document.querySelector('#acceptBtn').hidden, card: document.querySelector('#orderTitle').textContent})");
  assert(started.y > 300, "首屏入口滚动到送单区（scrollY " + started.y + "）");
  assert(started.accept && started.card.includes("户部巷"), "接单面板送出第一单：" + started.card);
  await screenshot(cdp, "ride-1440");
  const carto = await evalJS(cdp, `(() => {
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; };
    return { frame: box('.map-frame'), compass: box('.map-compass'), scale: box('.map-scale') };
  })()`);
  const inside = (r) => r.left >= carto.frame.left && r.right <= carto.frame.right && r.top >= carto.frame.top && r.bottom <= carto.frame.bottom;
  assert(carto.compass.width > 8 && inside(carto.compass), "地图右上留白处的指北针在画框内");
  assert(inside(carto.scale), "比例尺在画框内");

  for (let i = 0; i < 3; i++) await deliver(cdp, i, "1440");

  const headAfterThree = await evalJS(cdp, `(() => ({
    clock: document.querySelector('#headClock').textContent,
    battery: document.querySelector('#headBattery').textContent,
    on: document.querySelectorAll('#headOrders i.is-on').length,
    now: document.querySelectorAll('#headOrders i.is-now').length,
    label: document.querySelector('#headStatus').getAttribute('aria-label')
  }))()`);
  assert(headAfterThree.clock === "02:41" && headAfterThree.battery === "9%", "顶栏时间与电量随送单推进（" + headAfterThree.clock + " / " + headAfterThree.battery + "）");
  assert(headAfterThree.on === 3 && headAfterThree.now === 1, "顶栏四格进度点亮 3 单并标出加单");
  assert(headAfterThree.label.includes("已送达 3 单"), "顶栏状态有无障碍文本");

  const finale = await evalJS(cdp, "(() => ({card: document.querySelector('#orderTitle').textContent, state: document.querySelector('#dispatchState').textContent, note: document.querySelector('#orderNote').textContent}))()");
  assert(finale.card.includes("积玉桥") && finale.note.includes("给我儿子"), "三单之后出现「回家」加单：" + finale.card);
  await screenshot(cdp, "finale-1440");

  await deliver(cdp, 3, "1440");
  await sleep(700);
  const summary = await evalJS(cdp, `(() => {
    const s = document.querySelector('#summary');
    const r = document.querySelector('.receipt').getBoundingClientRect();
    return {
      open: !s.hidden,
      orders: document.querySelector('#sumOrders').textContent,
      distance: document.querySelector('#sumDistance').textContent,
      night: document.querySelector('#summaryNight').textContent,
      tickets: document.querySelectorAll('#summaryTickets li').length,
      choices: document.querySelectorAll('#summaryTickets .r-choice').length,
      choiceText: (document.querySelector('#summaryTickets .r-choice') || {}).textContent || '',
      subline: document.querySelector('#summarySubline').textContent,
      personal: document.querySelector('#summarySubline').classList.contains('is-personal'),
      routes: document.querySelectorAll('#summaryRoute .mini-route').length,
      stops: document.querySelectorAll('#summaryRoute .mini-stop').length,
      lastAction: Math.round(document.querySelector('#closeSummary').getBoundingClientRect().bottom),
      head: {
        clock: document.querySelector('#headClock').textContent,
        battery: document.querySelector('#headBattery').textContent,
        on: document.querySelectorAll('#headOrders i.is-on').length,
        now: document.querySelectorAll('#headOrders i.is-now').length
      },
      receipt: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
      stored: JSON.parse(localStorage.getItem('lastorder.v1') || 'null')
    };
  })()`);
  assert(summary.open, "第四单后打开收工小票");
  assert(summary.orders === "4" && summary.distance === "19.5", "小票统计为 4 单 / 19.5 公里");
  assert(summary.tickets === 4, "小票列出四张顾客留言");
  assert(summary.choices === 4 && summary.choiceText.startsWith("你 · "), "收工小票记下四次选择（" + summary.choiceText + "）");
  assert(summary.personal && summary.subline === "最后一单，是妈下的。", "最后一次选择写进小票落款（" + summary.subline + "）");
  assert(summary.routes === 6 && summary.stops === 4, "小票上的路网存根含 6 段路与 01–04 四个点");
  assert(summary.lastAction <= 900, "收工三颗按钮都在首屏内（底 " + summary.lastAction + "）");
  assert(summary.head.clock === "02:52" && summary.head.battery === "9%", "收工时顶栏走到 02:52 / 9%");
  assert(summary.head.on === 4 && summary.head.now === 0, "收工时顶栏四格全部点亮");
  assert(summary.receipt.left >= 0 && summary.receipt.right <= 1440 && summary.receipt.top >= 0, "收工小票在视口内");
  assert(summary.stored && summary.stored.nights === 1 && summary.stored.last.tickets.length === 4, "localStorage 写入第 1 夜与四张小票");
  assert(summary.stored.last.tickets.every((t) => t.choice && t.choice.length > 1), "localStorage 保存每单的选择");
  await screenshot(cdp, "summary-1440");
  await click(cdp, "#saveReceipt");
  await sleep(400);
  const saveText = await evalJS(cdp, "document.querySelector('#saveReceipt').textContent");
  assert(saveText === "已存下", "「存下这张小票」可执行并给出反馈");

  const notes = await evalJS(cdp, `(() => ({
    open: document.querySelectorAll('#ticketRow .ticket:not(.is-locked)').length,
    locked: document.querySelectorAll('#ticketRow .ticket.is-locked').length,
    choices: document.querySelectorAll('#ticketRow .ticket-choice').length,
    timeline: document.querySelectorAll('#nightTimeline li.is-on').length,
    night: document.querySelector('#nightCount').textContent
  }))()`);
  assert(notes.open === 4 && notes.locked === 0, "小票区四张全部显影");
  assert(notes.choices === 4, "小票区四张都留有自己的选择");
  assert(notes.timeline === 5 && notes.night === "1", "夜班日志五段点亮，第 1 夜");

  const later = await evalJS(cdp, `(() => {
    const b = document.querySelector('#ticketRow .ticket-choice');
    b.click();
    const panel = document.getElementById(b.getAttribute('aria-controls'));
    return {
      expanded: b.getAttribute('aria-expanded'),
      open: !panel.hidden,
      visible: document.querySelectorAll('#ticketRow .ticket-after:not([hidden])').length,
      text: panel.textContent
    };
  })()`);
  assert(later.expanded === "true" && later.open && later.visible === 1 && later.text.length > 8, "小票上的选择可展开「后来」");

  await click(cdp, "#replayBtn");
  await sleep(800);
  const replay = await evalJS(cdp, "({summary: document.querySelector('#summary').hidden, card: document.querySelector('#orderTitle').textContent, locked: document.querySelectorAll('#ticketRow .ticket.is-locked').length, trails: document.querySelectorAll('#mapTrail > *').length})");
  assert(replay.summary && replay.card.includes("户部巷") && replay.locked === 4, "「再跑一夜」回到第一单，小票重新盖上未送达");
  assert(replay.trails === 0, "「再跑一夜」清掉上一夜的轨迹与送达点");

  await goto(cdp, 1440, 900, false);
  await evalJS(cdp, "document.querySelector('#notes').scrollIntoView({ block: 'start' })");
  await sleep(900);
  const storedNotes = await evalJS(cdp, `(() => ({
    choices: document.querySelectorAll('#ticketRow .ticket-choice').length,
    first: (document.querySelector('#ticketRow .ticket-choice') || {}).textContent || '',
    paperHead: document.querySelector('#siteHead').classList.contains('is-paper'),
    notesTop: Math.round(document.querySelector('#notes').getBoundingClientRect().top),
    headClock: document.querySelector('#headClock').textContent,
    headBattery: document.querySelector('#headBattery').textContent,
    headOn: document.querySelectorAll('#headOrders i.is-on').length,
    trails: document.querySelectorAll('#mapTrail .trail').length,
    stops: document.querySelectorAll('#mapTrail .trail-stop').length,
    stopLabels: Array.from(document.querySelectorAll('#mapTrail .trail-stop text')).map((t) => t.textContent).join(''),
    mapClock: document.querySelector('#mapClock').textContent,
    dispatchState: document.querySelector('#dispatchState').textContent,
    accept: document.querySelector('#acceptBtn').textContent
  }))()`);
  assert(storedNotes.choices === 4 && storedNotes.first.includes("会好的"), "刷新后四张存档小票仍带着自己的选择");
  assert(storedNotes.paperHead, `锚点落到小票区时顶栏切换纸色（notes top ${storedNotes.notesTop}）`);
  assert(storedNotes.headClock === "02:52" && storedNotes.headBattery === "9%" && storedNotes.headOn === 4, "刷新后顶栏停在第 1 夜的收工状态");
  assert(storedNotes.trails === 6 && storedNotes.stops === 4 && /01.*02.*03.*04/.test(storedNotes.stopLabels), "刷新后上一夜的 6 段路与 01–04 送达点仍在图上");
  assert(storedNotes.mapClock === "02:52" && storedNotes.dispatchState === "已收工" && storedNotes.accept.includes("再跑一夜"), "刷新后地图时间与接单面板同步切到收工态");
  await screenshot(cdp, "notes-1440");

  await click(cdp, "#startBtn");
  await sleep(900);
  const fresh = await evalJS(cdp, `(() => ({
    trails: document.querySelectorAll('#mapTrail > *').length,
    clock: document.querySelector('#mapClock').textContent,
    card: document.querySelector('#orderTitle').textContent,
    state: document.querySelector('#dispatchState').textContent
  }))()`);
  assert(fresh.trails === 0 && fresh.clock === "00:47" && fresh.card.includes("户部巷") && fresh.state === "待接单", "点「再跑一夜」清空上一夜路网并回到第一单");
}

async function runMobile(cdp) {
  console.log("\n▶ 390 完整一夜");
  await goto(cdp, 390, 844, true);
  await evalJS(cdp, "localStorage.clear()");
  await goto(cdp, 390, 844, true);
  await screenshot(cdp, "home-390");
  await overflowReport(cdp, 390, "390");
  await click(cdp, "#startBtn");
  await sleep(1100);
  await screenshot(cdp, "ride-390");
  const map = await evalJS(cdp, `(() => {
    const r = document.querySelector('.map-frame').getBoundingClientRect();
    const p = document.querySelector('#orderCard').getBoundingClientRect();
    const d = document.querySelector('.dispatch').getBoundingClientRect();
    return { map: { left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height), top: Math.round(r.top) }, card: { left: Math.round(p.left), right: Math.round(p.right) }, dispatchTop: Math.round(d.top) };
  })()`);
  assert(map.map.left >= 0 && map.map.right <= 390 && map.map.height >= 300, "390: 地图面板完整可见（高 " + map.map.height + "）");
  assert(map.card.left >= 0 && map.card.right <= 390, "390: 接单卡片不越界");
  assert(map.dispatchTop < map.map.top, "390: 接单面板在地图之前，接单按钮先出现");

  for (let i = 0; i < 3; i++) await deliver(cdp, i, "390");
  const finale = await evalJS(cdp, "document.querySelector('#orderTitle').textContent");
  assert(finale.includes("积玉桥"), "390: 三单之后出现回家加单");
  await deliver(cdp, 3, "390");
  await sleep(650);
  const summary = await evalJS(cdp, `(() => {
    const open = !document.querySelector('#summary').hidden;
    const r = document.querySelector('.receipt').getBoundingClientRect();
    return { open, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), tickets: document.querySelectorAll('#summaryTickets li').length };
  })()`);
  assert(summary.open && summary.tickets === 4, "390: 收工小票出现并列出四张");
  assert(summary.left >= 0 && summary.right <= 390, "390: 小票不越界");
  await screenshot(cdp, "summary-390");
  await click(cdp, "#closeSummary");
  await sleep(700);
  const top = await evalJS(cdp, "Math.round(window.scrollY)");
  assert(top < 40, "390: 回到开头");
}

async function runShort(cdp) {
  console.log("\n▶ 1440×720 矮横屏首屏");
  await goto(cdp, 1440, 720, false);
  const hero = await evalJS(cdp, `(() => {
    const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const h1 = document.querySelector('h1');
    return {
      titleSize: parseFloat(getComputedStyle(h1).fontSize),
      title: box('h1'), meta: box('.hero-meta'), foot: box('.hero-foot'),
      route: box('.route-strip'), start: box('#startBtn'), vh: innerHeight,
      scrollWidth: document.documentElement.scrollWidth
    };
  })()`);
  assert(hero.scrollWidth <= 1440, `1440×720: 无横向滚动（${hero.scrollWidth}）`);
  assert(hero.titleSize >= 96, `1440×720: 标题仍有 ${Math.round(hero.titleSize)}px 的量级`);
  assert(hero.start.bottom <= 720 && hero.start.top > 0, "1440×720: 「接单，出发」在第一屏内");
  assert(hero.meta.bottom <= 720, `1440×720: 形式 / 时长 / 声音在第一屏内（底 ${hero.meta.bottom}）`);
  assert(hero.route.bottom <= 720 && hero.route.top >= hero.meta.bottom + 8, `1440×720: 路线条在第一屏内且不与信息行相压（${hero.meta.bottom} → ${hero.route.top}）`);
  assert(hero.foot.bottom <= hero.vh + 1, "1440×720: 首屏页脚不越出视口");
  await sleep(500);
  await screenshot(cdp, "home-1440x720");
}

(async () => {
  await mkdir(SHOTS, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--remote-allow-origins=*",
    "--user-data-dir=/tmp/lastorder-regression-profile", BASE
  ], { stdio: "ignore" });

  let cdp;
  try {
    let page;
    for (let i = 0; i < 80; i++) {
      try {
        const list = await getJSON("/json/list");
        page = list.find((t) => t.type === "page");
        if (page) break;
      } catch (e) { /* 浏览器还没起来 */ }
      await sleep(150);
    }
    if (!page) throw new Error("Chromium 未就绪，请检查 CHROME 路径");

    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready();
    const errors = [];
    cdp.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        errors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
      }
    });
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    console.log("最后一单 · 回归检查");
    if (ONLY !== "mobile") {
      for (const cfg of WIDTHS.filter((c) => c.label === "1920" || c.label === "720")) {
        await goto(cdp, cfg.w, cfg.h, cfg.mobile);
        await overflowReport(cdp, cfg.w, cfg.label);
      }
      await runDesktop(cdp);
      await runShort(cdp);
    }
    if (ONLY !== "desktop") await runMobile(cdp);

    console.log("\n▶ 控制台");
    assert(errors.length === 0, "无 JS 异常 / console.error" + (errors.length ? "：" + errors.slice(0, 3).join(" | ") : ""));
  } catch (err) {
    fail("脚本异常：" + err.message);
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGKILL");
  }

  console.log("\n截图目录：" + SHOTS);
  if (failures.length) {
    console.log("\n结果：失败 " + failures.length + " 项");
    failures.forEach((f) => console.log(" - " + f));
    process.exit(1);
  }
  console.log("\n结果：全部通过");
})();
