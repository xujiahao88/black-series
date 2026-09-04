/* ============================================================
 * 黑色系产业数据看板 — 渲染层（公开版）
 * 含页面内 JSON 更新能力，更新内容存 localStorage
 * ============================================================ */

(function () {
  "use strict";

  const STORE_KEY = "blackSeriesDashboardData";

  /* 价格区间（用于定位条）。价格区间变动时同步调整。 */
  const RANGES = {
    iron:  { low: 690,  high: 745,  costLine: null, costLabel: "" },
    coke:  { low: 1550, high: 1790, costLine: null, costLabel: "" },
    steel: { low: 3050, high: 3280, costLine: 3312, costLabel: "电弧炉成本 3312" },
    glass: { low: 900,  high: 1020, costLine: null, costLabel: "" },
    soda:  { low: 880,  high: 1120, costLine: 880,  costLabel: "天然碱完全成本 880" }
  };

  /* 品种页模块 */
  const SECTIONS = [
    { id: "price",     name: "价格与基差", index: "01" },
    { id: "supply",    name: "供给端",     index: "02" },
    { id: "demand",    name: "需求端",     index: "03" },
    { id: "inventory", name: "库存",       index: "04" },
    { id: "profit",    name: "利润与成本", index: "05" },
    { id: "facts",     name: "已核实消息", index: "06" }
  ];

  /* 外部数据源链接：从工作台一键跳转至原始站点（不抓取、不内嵌数据） */
  const SOURCE_LINKS = {
    iron: { name: "铁矿周度图表 · iron-ore-charts", url: "https://iron-ore-charts.pages.dev/" },
    coke: { name: "双焦周度图表（汾渭）· fenwei",   url: "https://fenwei.pages.dev/" }
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s);

  function tone(chg) {
    if (chg > 0) return "up";
    if (chg < 0) return "down";
    return "neutral";
  }
  function signed(chg) {
    const v = Number(chg);
    return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  }

  /* ---------- 数据加载：localStorage 优先 ---------- */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.meta && Array.isArray(parsed.products)) return parsed;
      }
    } catch (e) { /* 解析失败则回退默认 */ }
    return window.WORKSPACE_DATA;
  }

  let D = loadData();

  /* ============================================================
   * 侧边栏
   * ============================================================ */
  function renderSidebar() {
    let html = `
      <div class="brand">
        <div class="brand-title"><span class="brand-dot"></span>${esc(D.meta.title)}</div>
        <div class="brand-sub">${esc(D.meta.subtitle)}</div>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">总览</div>
        <div class="nav-item" data-route="overview">数据总览</div>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">宏观</div>
        <div class="nav-item" data-route="macro">宏观监测<span class="nav-code">4 项</span></div>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">产业</div>`;

    D.products.forEach((p) => {
      const t = tone(p.chg);
      html += `<div class="nav-item" data-route="${esc(p.id)}">
        ${esc(p.name)}<span class="nav-price ${t}">${esc(p.price)}</span>
      </div>`;
    });

    html += `</div>
      <div class="nav-group">
        <div class="nav-group-title">外部数据源</div>`;
    Object.keys(SOURCE_LINKS).forEach((k) => {
      const l = SOURCE_LINKS[k];
      html += `<a class="nav-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`;
    });
    html += `</div>
      <div style="padding:0 20px;margin-top:14px">
        <button class="update-btn" id="btnUpdate">数据更新</button>
      </div>
      <div class="sidebar-footer">
        数据截止<br>${esc(D.meta.dataAsOf)}<br><br>
        更新于 ${esc(D.meta.updated)}
        <span id="customFlag"></span>
      </div>`;

    $("sidebar").innerHTML = html;

    document.querySelectorAll(".nav-item").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.route));
    });
    $("btnUpdate").addEventListener("click", openUpdatePanel);
    markCustom();
  }

  function markCustom() {
    let custom = false;
    try { custom = !!localStorage.getItem(STORE_KEY); } catch (e) {}
    const f = $("customFlag");
    if (f && custom) {
      f.innerHTML = `<br><span style="color:var(--warn);font-weight:600">● 已载入自定义数据</span>`;
    }
  }

  /* ============================================================
   * 总览
   * ============================================================ */
  function renderOverview() {
    let rows = "";
    D.products.forEach((p) => {
      const t = tone(p.chg);
      const dims = ["supply", "demand", "inventory", "profit"]
        .map((k) => (p[k] && p[k].rows) ? p[k].rows.length : 0)
        .reduce((a, b) => a + b, 0);
      rows += `<tr data-route="${esc(p.id)}">
        <td><span class="ov-name">${esc(p.name)}</span><span class="ov-code">${esc(p.contract)}</span></td>
        <td><span class="ov-price ${t}">${esc(p.price)}</span><span class="ov-chg ${t}">${signed(p.chg)}</span></td>
        <td><span class="badge neutral">${dims} 项指标</span></td>
        <td class="ov-core">供给 / 需求 / 库存 / 利润 / 价格 五维数据</td>
      </tr>`;
    });

    let macroCards = "";
    D.macro.modules.forEach((m) => {
      macroCards += `<tr data-route="macro">
        <td><span class="ov-name">${esc(m.name)}</span></td>
        <td colspan="2"><span class="badge neutral">${m.metrics.length} 项指标</span></td>
        <td class="ov-core">${esc(m.facts[0] || "")}</td>
      </tr>`;
    });

    let caveats = "";
    (D.caveats || []).forEach((c) => {
      caveats += `<div class="caveat">
        <div class="caveat-t">⚠ ${esc(c.item)}</div>
        <div class="caveat-d">${esc(c.detail)}</div>
      </div>`;
    });

    $("main").innerHTML = `
      <div class="page-head">
        <div class="page-title">数据总览</div>
        <div class="page-meta">
          <span>数据截止：${esc(D.meta.dataAsOf)}</span>
          <span>更新于：${esc(D.meta.updated)}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">关于本看板</div>
          <span class="badge accent">客观数据</span></div>
        <div class="comment" style="margin-top:0">
          ${esc(D.macro.summary)}<br>
          品种页按 <b>供给 / 需求 / 库存 / 利润 / 价格</b> 五维组织，仅收录可核实的公开数据。
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">宏观监测</div></div>
        <table class="ov-table">
          <thead><tr><th style="width:150px">变量</th><th style="width:180px">指标数</th><th></th><th>最新动态</th></tr></thead>
          <tbody>${macroCards}</tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">产业品种</div>
          <span class="badge neutral">点击进入品种明细</span></div>
        <table class="ov-table">
          <thead><tr><th style="width:190px">品种</th><th style="width:150px">主力</th><th style="width:160px">指标</th><th>数据维度</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">数据口径说明</div>
          <span class="badge warn">使用前请阅读</span></div>
        ${caveats || "<div class='caveat-d'>暂无</div>"}
      </div>

      <div class="disclaimer">${esc(D.meta.disclaimer)}</div>`;

    bindTableRoutes();
  }

  /* ============================================================
   * 宏观页
   * ============================================================ */
  function renderMacro() {
    let chips = D.macro.modules
      .map((m) => `<div class="chip" data-scroll="${esc(m.id)}">${esc(m.name)}</div>`).join("");

    let blocks = D.macro.modules.map((m) => {
      const metrics = m.metrics.map((x) => `
        <div class="metric">
          <div class="metric-k">${esc(x.k)}</div>
          <div class="metric-v">${esc(x.v)}</div>
          <div class="metric-d">${esc(x.d)}</div>
        </div>`).join("");

      const facts = m.facts.map((f) => `<li>${esc(f)}</li>`).join("");
      const watch = m.watch.map((w) => `<span class="watch-item">${esc(w)}</span>`).join("");

      return `
        <div class="card section-anchor" id="m-${esc(m.id)}">
          <div class="card-head"><div class="card-title">${esc(m.name)}</div>
            <span class="tag" style="margin-left:auto">${m.metrics.length} 项指标 · ${m.facts.length} 条动态</span>
          </div>
          <div class="metrics">${metrics}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-3);margin:16px 0 8px">最新动态</div>
          <ul class="bullets">${facts}</ul>
          <div style="margin-top:16px">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-3);margin-bottom:7px">后续关注</div>
            <div class="watch">${watch}</div>
          </div>
        </div>`;
    }).join("");

    $("main").innerHTML = `
      <div class="page-head">
        <div class="page-title">宏观监测<span class="page-code">MACRO</span></div>
        <div class="page-meta"><span>${esc(D.macro.headline)}</span></div>
      </div>
      <div class="chipbar">${chips}</div>
      ${blocks}
      <div class="disclaimer">${esc(D.meta.disclaimer)}</div>`;

    bindChips();
  }

  /* ============================================================
   * 品种页
   * ============================================================ */
  function renderProduct(id) {
    const p = D.products.find((x) => x.id === id);
    if (!p) return;
    const t = tone(p.chg);
    const R = RANGES[p.id] || null;

    const chips = SECTIONS
      .map((s) => `<div class="chip" data-scroll="${s.id}">${esc(s.name)}</div>`).join("");

    /* 五维数据块 */
    const dims = ["supply", "demand", "inventory", "profit"].map((key, i) => {
      const blk = p[key];
      if (!blk || !blk.rows || !blk.rows.length) return "";
      const meta = [
        { code: "02", name: "供给端" }, { code: "03", name: "需求端" },
        { code: "04", name: "库存" },   { code: "05", name: "利润与成本" }
      ][i];
      const rows = blk.rows.map((r) =>
        `<tr><td>${esc(r.k)}</td><td>${esc(r.v)}</td><td>${esc(r.d)}</td></tr>`).join("");
      return `
        <div class="card section-anchor" id="s-${key}">
          <div class="card-head"><div class="card-title">${meta.name}</div>
            <span class="card-index">${meta.code}</span>
            <span class="badge neutral" style="margin-left:auto">${blk.rows.length} 项</span>
          </div>
          <table class="table">${rows}</table>
        </div>`;
    }).join("");

    /* 价格与基差 */
    const priceRows = (p.pricing && p.pricing.rows || []).map((r) =>
      `<tr><td>${esc(r.k)}</td><td>${esc(r.v)}</td><td>${esc(r.d)}</td></tr>`).join("");

    /* 已核实消息 */
    const factsHtml = (p.facts && p.facts.length)
      ? p.facts.map((f) => `
          <div class="rumor" style="grid-template-columns:1fr">
            <div>
              <div class="rumor-t">${esc(f.t)}</div>
              <div class="rumor-d">${esc(f.d)}</div>
            </div>
          </div>`).join("")
      : "<div class='caveat-d'>暂无</div>";

    $("main").innerHTML = `
      <div class="page-head">
        <div class="page-title">${esc(p.name)}<span class="page-code">${esc(p.contract)}</span></div>
        <div class="page-meta">
          <span>主力：<b class="${t}" style="font-family:'SF Mono',Consolas,monospace">${esc(p.price)}</b>
            <span class="${t}" style="font-family:'SF Mono',Consolas,monospace">${signed(p.chg)}</span></span>
          <span>数据截止：${esc(D.meta.dataAsOf)}</span>
        </div>
      </div>

      <div class="chipbar">${chips}</div>

      <div class="card section-anchor" id="s-price">
        <div class="card-head"><div class="card-title">价格与基差</div>
          <span class="card-index">01</span>
          <span class="badge neutral" style="margin-left:auto">${(p.pricing.rows || []).length} 项</span>
        </div>
        ${R ? priceBar(p, R) : ""}
        <table class="table">${priceRows}</table>
      </div>

      ${dims}

      <div class="card section-anchor" id="s-facts">
        <div class="card-head"><div class="card-title">已核实消息</div>
          <span class="card-index">06</span>
          <span class="badge accent" style="margin-left:auto">仅收录公开证实信息</span>
        </div>
        <div class="note-line">本模块仅列示已由公开渠道证实的信息，不含市场传闻与未经落地的预期。</div>
        ${factsHtml}
      </div>

      ${srcLinkCard(p)}

      <div class="disclaimer">${esc(D.meta.disclaimer)}</div>`;

    bindChips();
  }

  /* 外部数据源链接卡片（品种页底部，对应品种有 SOURCE_LINKS 时显示） */
  function srcLinkCard(p) {
    const l = SOURCE_LINKS[p.id];
    if (!l) return "";
    return `
      <div class="card section-anchor" id="s-source">
        <div class="card-head"><div class="card-title">外部数据源</div>
          <span class="card-index">08</span></div>
        <div class="note-line">本品种的原始周度数据来源，点击在新标签页打开。</div>
        <a class="src-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>
      </div>`;
  }
  /* ============================================================
   * 数据更新面板
   * ============================================================ */
  function openUpdatePanel() {
    const box = document.createElement("div");
    box.className = "modal-mask";
    box.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">数据更新</div>
          <span class="modal-close" id="mClose">✕</span>
        </div>
        <div class="modal-body">
          <p class="modal-tip">
            粘贴 JSON 数据覆盖当前内容，更新结果<b>仅保存在本机浏览器</b>，
            不会影响线上默认数据，也不会上传到任何服务器。<br>
            建议先点「导出当前数据」，在导出的文件基础上修改，避免结构出错。
          </p>
          <textarea id="mText" class="modal-text"
            placeholder='在此粘贴 JSON，格式：{"meta":{...},"macro":{...},"products":[...]}'></textarea>
          <div class="modal-msg" id="mMsg"></div>
        </div>
        <div class="modal-foot">
          <button class="mbtn" id="mExport">导出当前数据</button>
          <button class="mbtn" id="mReset">恢复默认</button>
          <span style="flex:1"></span>
          <button class="mbtn" id="mCancel">取消</button>
          <button class="mbtn primary" id="mApply">应用更新</button>
        </div>
      </div>`;
    document.body.appendChild(box);

    const close = () => document.body.removeChild(box);
    $("mClose").onclick = close;
    $("mCancel").onclick = close;
    box.onclick = (e) => { if (e.target === box) close(); };

    $("mExport").onclick = () => {
      const blob = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "黑色系数据看板_" + (D.meta.updated || "").replace(/[^\d]/g, "") + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      msg("已导出当前数据", "ok");
    };

    $("mReset").onclick = () => {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      D = window.WORKSPACE_DATA;
      renderSidebar();
      refresh();
      close();
    };

    $("mApply").onclick = () => {
      const raw = $("mText").value.trim();
      if (!raw) return msg("请先粘贴 JSON 内容", "err");
      let obj;
      try { obj = JSON.parse(raw); }
      catch (e) { return msg("JSON 解析失败：" + e.message, "err"); }

      const err = validate(obj);
      if (err) return msg("数据结构校验失败：" + err, "err");

      try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }
      catch (e) { return msg("本地存储写入失败：" + e.message, "err"); }

      D = obj;
      renderSidebar();
      refresh();
      close();
    };

    function msg(text, kind) {
      const el = $("mMsg");
      el.textContent = text;
      el.className = "modal-msg " + (kind === "err" ? "err" : "ok");
    }
  }

  /* 基本结构校验，防止脏数据把页面搞崩 */
  function validate(o) {
    if (!o || typeof o !== "object") return "不是合法对象";
    if (!o.meta) return "缺少 meta 字段";
    if (!Array.isArray(o.products) || !o.products.length) return "products 必须是非空数组";
    for (let i = 0; i < o.products.length; i++) {
      const p = o.products[i];
      if (!p.id) return "products[" + i + "] 缺少 id";
      if (!p.name) return "products[" + i + "] 缺少 name";
      if (!p.pricing || !Array.isArray(p.pricing.rows)) return p.name + " 缺少 pricing.rows";
    }
    if (o.macro && (!Array.isArray(o.macro.modules) || !o.macro.modules.length)) {
      return "macro.modules 必须是非空数组";
    }
    return null;
  }


function priceBar(p, R) {
    const W = 880, H = 92, PAD = 54;
    const x = (v) => PAD + ((v - R.low) / (R.high - R.low)) * (W - PAD * 2);
    const y = 48;
    const cx = x(Math.max(R.low, Math.min(R.high, p.price)));

    let costSvg = "";
    if (R.costLine && R.costLine >= R.low && R.costLine <= R.high) {
      const kx = x(R.costLine);
      costSvg = `
        <line x1="${kx}" y1="${y - 22}" x2="${kx}" y2="${y + 10}"
              stroke="#c0392b" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="${kx}" y="${y - 28}" fill="#c0392b" font-size="11" font-weight="600"
              text-anchor="middle" font-family="sans-serif">${esc(R.costLabel)}</text>`;
    }

    return `
      <div style="margin-bottom:20px; overflow-x:auto">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">
          <line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"
                stroke="#d6dce2" stroke-width="3" stroke-linecap="round"/>
          <circle cx="${PAD}" cy="${y}" r="4" fill="#8b98a6"/>
          <circle cx="${W - PAD}" cy="${y}" r="4" fill="#8b98a6"/>
          <text x="${PAD}" y="${y + 24}" fill="#7b8794" font-size="11.5"
                text-anchor="middle" font-family="sans-serif">支撑 ${R.low}</text>
          <text x="${W - PAD}" y="${y + 24}" fill="#7b8794" font-size="11.5"
                text-anchor="middle" font-family="sans-serif">压力 ${R.high}</text>
          ${costSvg}
          <polygon points="${cx},${y - 12} ${cx - 7},${y - 24} ${cx + 7},${y - 24}" fill="#1f5673"/>
          <text x="${cx}" y="${y - 30}" fill="#1f5673" font-size="12.5" font-weight="700"
                text-anchor="middle" font-family="sans-serif">现价 ${esc(p.price)}</text>
        </svg>
        <div style="text-align:center;font-size:11px;color:var(--text-3);margin-top:2px">
          当前价在区间中的相对位置（区间为参考值，非预测）
        </div>
      </div>`;
  }  /* ============================================================
   * 路由
   * ============================================================ */
  let current = "";

  function go(route) {
    current = route;
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.route === route);
    });
    if (route === "overview") renderOverview();
    else if (route === "macro") renderMacro();
    else renderProduct(route);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (location.hash !== "#/" + route) history.replaceState(null, "", "#/" + route);
  }

  function refresh() {
    if (current === "overview") renderOverview();
    else if (current === "macro") renderMacro();
    else renderProduct(current);
  }

  function bindTableRoutes() {
    document.querySelectorAll("[data-route]").forEach((el) => {
      if (el.classList.contains("nav-item")) return;
      el.addEventListener("click", () => go(el.dataset.route));
    });
  }

  function bindChips() {
    document.querySelectorAll(".chip[data-scroll]").forEach((el) => {
      el.addEventListener("click", () => {
        const t = document.getElementById("s-" + el.dataset.scroll)
               || document.getElementById("m-" + el.dataset.scroll);
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    document.title = D.meta.title;
    renderSidebar();
    const hash = (location.hash || "").replace("#/", "");
    const valid = ["overview", "macro"].concat(D.products.map((p) => p.id));
    go(valid.indexOf(hash) >= 0 ? hash : "overview");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
