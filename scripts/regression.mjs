#!/usr/bin/env node
/* 等一碗 · 无依赖回归脚本（Node 22+ 内置 WebSocket + Chromium CDP）
 *
 * 用法：
 *   python3 -m http.server 8080 --directory . &
 *   node scripts/regression.mjs
 *
 * 环境变量：
 *   BASE_URL   默认 http://localhost:8080/
 *   CHROME     默认 Playwright 缓存的 Chromium，可指向本机 Chrome
 *   SHOTS_DIR  默认 /tmp/dengyi-shots
 *
 * 检查项：四种宽度无横向溢出、无控制台报错、完整跑通一轮排队到过早签、
 * 重排后本轮状态归零且到店次数累加、键盘 Tab 可到达首屏操作。
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
const SHOTS = process.env.SHOTS_DIR || "/tmp/dengyi-shots";
const PORT = 9333;
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
    this.events = [];
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
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
  const r = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression);
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
  await sleep(500); // 等 reveal 入场与字体落位
}

async function screenshot(cdp, name) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(SHOTS + "/" + name + ".png", Buffer.from(r.data, "base64"));
}

async function overflowReport(cdp, width, label) {
  const data = await evalJS(cdp, `(() => {
    const vw = window.innerWidth;
    const out = [];
    document.querySelectorAll("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") return;
      if (el.closest(".price-track, .strip-wrap")) return; // 跑马灯与横向票根是有意滚动
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

async function click(cdp, selector) {
  const ok = await evalJS(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error("找不到可点击元素: " + selector);
  await sleep(180);
}

async function runSize(cdp, cfg) {
  console.log("\n▶ " + cfg.label + "×" + cfg.h);
  await goto(cdp, cfg.w, cfg.h, cfg.mobile);
  await overflowReport(cdp, cfg.w, cfg.label);
  await screenshot(cdp, "home-" + cfg.label);
  const title = await evalJS(cdp, "document.querySelector('h1').textContent.trim()");
  assert(title === "等一碗", `${cfg.label}: 首屏标题为「等一碗」`);
  return cfg;
}

async function runFlow(cdp) {
  console.log("\n▶ 完整核心循环（1440）");
  await goto(cdp, 1440, 900, false);
  await evalJS(cdp, "localStorage.clear()");
  await goto(cdp, 1440, 900, false);
  await evalJS(cdp, "document.querySelector('#queue').scrollIntoView({block:'start'})");
  await sleep(250);
  for (let i = 0; i < 5; i++) {
    const hasListen = await evalJS(cdp, "!!document.querySelector('[data-act=listen]')");
    if (!hasListen) { fail(`第 ${i + 1} 位: 未出现听两句按钮`); break; }
    await click(cdp, "[data-act=listen]");
    await click(cdp, "[data-act=next]");
  }
  const phase = await evalJS(cdp, "window.DENGYI_APP.state.phase");
  assert(phase === "order", "五个人之后进入点单 phase=order");
  const clock = await evalJS(cdp, "document.querySelector('#clock').textContent");
  assert(clock === "06:37", "全听路线 06:37 到达（迟到线 06:35 之后）");
  await click(cdp, "[data-act=order]");
  await sleep(700);
  const ticketTop = await evalJS(cdp, "Math.round(document.querySelector('.receipt-wrap').getBoundingClientRect().top)");
  assert(ticketTop >= 60 && ticketTop <= 140, "点单后过早签自动滚入视口（top " + ticketTop + "）");
  const receipt = await evalJS(cdp, "(() => { const r = document.querySelector('.receipt'); return r ? r.textContent.replace(/\\s+/g,' ').trim() : ''; })()");
  assert(receipt.includes("过早签") && receipt.includes("第 1 次来"), "生成过早签并盖章「第 1 次来」");
  assert(receipt.includes("这一轮听过") && receipt.includes("5 段"), "过早签记录本轮 5 段故事");
  const stored = await evalJS(cdp, "JSON.parse(localStorage.getItem('dengyiawan.v1'))");
  assert(stored && stored.visits === 1 && stored.heard.length === 5, "localStorage 持久化到店次数与 5 位街坊");
  assert(stored && stored.endings && stored.endings["5"] && Object.keys(stored.endings).length === 1, "结局收集册持久化「听 5 段」这一格");
  const album1 = await evalJS(cdp, "({ open: document.querySelectorAll('.album-slot.is-open').length, locked: document.querySelectorAll('.album-slot.is-locked').length, count: document.querySelector('#endingCount').textContent })");
  assert(album1.open === 1 && album1.locked === 5 && album1.count === "1", "街坊区显影 1 格收尾、其余 5 格未拆");
  await evalJS(cdp, "document.querySelector('.ending-album').scrollIntoView({ block: 'center', behavior: 'instant' })");
  await sleep(300);
  await screenshot(cdp, "album-1440");
  await evalJS(cdp, "document.querySelector('.receipt-wrap').scrollIntoView({ block: 'start', behavior: 'instant' })");
  await sleep(300);
  await screenshot(cdp, "ticket-1440");
  await click(cdp, "[data-act=restart]");
  const after = await evalJS(cdp, "({ clock: document.querySelector('#clock').textContent, phase: window.DENGYI_APP.state.phase, visits: window.DENGYI_APP.store.visits })");
  assert(after.clock === "06:12" && after.phase === "person", "再排一次后时钟与 phase 归零");
  assert(after.visits === 1, "重排保留历史到店次数");
  for (let i = 0; i < 5; i++) {
    await click(cdp, i < 3 ? "[data-act=listen]" : "[data-act=skip]");
    await click(cdp, "[data-act=next]");
  }
  await click(cdp, "[data-act=order]");
  const second = await evalJS(cdp, "document.querySelector('.receipt-visit').textContent");
  assert(second.includes("第 2 次来"), "第二轮再过早签显示「第 2 次来」");
  const album2 = await evalJS(cdp, "({ open: document.querySelectorAll('.album-slot.is-open').length, count: document.querySelector('#endingCount').textContent, note: document.querySelector('.receipt-album').textContent })");
  assert(album2.open === 2 && album2.count === "2" && album2.note.includes("听 3 段"), "第二轮把「听 3 段」收入同一本收集册");
  const lastRun = await evalJS(cdp, "(() => { const el = document.querySelector('#lastRun'); return { hidden: el.hidden, text: el.textContent.replace(/\\s+/g,' ').trim() }; })()");
  assert(!lastRun.hidden && lastRun.text.includes("上一回") && lastRun.text.includes("听了 3 段") && lastRun.text.includes("赶上了"), "排队区出现「上一回」存根：" + lastRun.text);
  await evalJS(cdp, "document.querySelector('#queue').scrollIntoView({ block: 'start', behavior: 'instant' })");
  await sleep(300);
  await screenshot(cdp, "queue-last-run-1440");
  await evalJS(cdp, "document.querySelector('.receipt-wrap').scrollIntoView({ block: 'start', behavior: 'instant' })");
  await sleep(300);
  await screenshot(cdp, "ticket-1440-round2");
}

async function runKeyboard(cdp) {
  console.log("\n▶ 键盘 Tab 走查（390）");
  await goto(cdp, 390, 844, true);
  await evalJS(cdp, "document.body.focus(); window.scrollTo(0,0)");
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await sleep(40);
    const info = await evalJS(cdp, `(() => { const a = document.activeElement; if (!a) return null; const r = a.getBoundingClientRect(); return { tag: a.tagName.toLowerCase(), text: (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 24), visible: r.width > 0 && r.height > 0, top: Math.round(r.top), right: Math.round(r.right) }; })()`);
    if (info) seen.push(info);
  }
  assert(seen.some((s) => s.text.includes("取号")), "Tab 可到达「取号，排到队尾」");
  assert(seen.some((s) => s.tag === "a" && s.text.includes("排队")), "Tab 可到达主导航");
  const offscreen = seen.filter((s) => s.right > 391);
  assert(offscreen.length === 0, "聚焦元素均在视口内" + (offscreen.length ? "：" + offscreen.map((s) => s.text).join(" / ") : ""));
}

(async () => {
  await mkdir(SHOTS, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--remote-allow-origins=*",
    "--user-data-dir=/tmp/dengyi-regression-profile", BASE
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

    console.log("等一碗 · 回归检查");
    for (const cfg of WIDTHS) await runSize(cdp, cfg);
    await runFlow(cdp);
    await runKeyboard(cdp);

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
