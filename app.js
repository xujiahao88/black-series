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
    { id: "facts",     name: "已核实消息", index: "06" },
    { id: "seasonal",  name: "季节性图谱", index: "07" }
  ];

  /* 季节性数据（seasonal.js 提供，缺失时该模块自动隐藏） */
  const SEASONAL = (window.SEASONAL_DATA && typeof window.SEASONAL_DATA === "object")
    ? window.SEASONAL_DATA : {};

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

    const se = SEASONAL[p.id] || null;

    const chips = SECTIONS
      .filter((s) => s.id !== "seasonal" || se)
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

      ${se ? seasonalSection(se) : ""}

      <div class="disclaimer">${esc(D.meta.disclaimer)}</div>`;

    bindChips();
  }

  /* ============================================================
   * 季节性图谱（原生 SVG，无外部依赖）
   * ============================================================ */
  const YEAR_STYLE = [
    { year: "2024", color: "#c2ccd6", width: 1.2, dash: "5 4" },
    { year: "2025", color: "#7aa7c7", width: 1.4, dash: "5 4" },
    { year: "2026", color: "#1f5673", width: 2.1, dash: "" }
  ];

  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
    if (a >= 100) return v.toFixed(1);
    return v.toFixed(2);
  }

  function signedNum(v, unit) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const s = v > 0 ? "+" : "";
    return s + fmtNum(v) + (unit ? "" : "");
  }

  function seasonalChart(ch, axis) {
    const W = 900, H = 208, PADL = 62, PADR = 18, PADT = 18, PADB = 28;
    const n = axis.length;
    const x = (i) => PADL + (i / (n - 1)) * (W - PADL - PADR);

    let min = Infinity, max = -Infinity;
    ch.series.forEach((s) => s.data.forEach((v) => {
      if (v !== null && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    }));
    if (!isFinite(min) || !isFinite(max)) return "";
    if (min === max) { min -= 1; max += 1; }
    const gap = (max - min) * 0.08;
    min -= gap; max += gap;
    const y = (v) => PADT + (1 - (v - min) / (max - min)) * (H - PADT - PADB);

    /* 网格与 Y 轴刻度 */
    let grid = "", yTicks = "";
    for (let g = 0; g <= 4; g++) {
      const v = min + ((max - min) * g) / 4;
      const yy = y(v);
      grid += `<line x1="${PADL}" y1="${yy}" x2="${W - PADR}" y2="${yy}"
                 stroke="#eceff2" stroke-width="1"/>`;
      yTicks += `<text x="${PADL - 8}" y="${yy + 4}" fill="#7b8794" font-size="10.5"
                   text-anchor="end" font-family="sans-serif">${fmtNum(v)}</text>`;
    }

    /* X 轴月份刻度 */
    let xTicks = "";
    let lastM = "";
    for (let i = 0; i < n; i++) {
      const m = String(axis[i]).slice(0, 2);
      if (m !== lastM) {
        lastM = m;
        const xx = x(i);
        xTicks += `<text x="${xx}" y="${H - 8}" fill="#7b8794" font-size="10.5"
                     text-anchor="middle" font-family="sans-serif">${Number(m)}月</text>`;
      }
    }

    /* 曲线：遇到 null 断开 */
    let paths = "";
    ch.series.forEach((s) => {
      const st = YEAR_STYLE.find((k) => k.year === s.year) ||
        { color: "#9aa7b4", width: 1.2, dash: "4 3" };
      /* 注意：周度数据在日度轴上是稀疏的（相邻点之间隔着 null）。
         这里跨过 null 直接连线（相当于源站的「连断点」），
         若遇到 null 就断开，整条线会退化成互不相连的孤立点。 */
      let d = "", pen = false;
      for (let i = 0; i < s.data.length; i++) {
        const v = s.data[i];
        if (v === null || isNaN(v)) continue;
        d += (pen ? " L " : " M ") + x(i).toFixed(1) + " " + y(v).toFixed(1);
        pen = true;
      }
      if (!d) return;
      paths += `<path d="${d.trim()}" fill="none" stroke="${st.color}"
                  stroke-width="${st.width}" stroke-linejoin="round" stroke-linecap="round"
                  ${st.dash ? 'stroke-dasharray="' + st.dash + '"' : ""}/>`;
    });

    /* 最新值摘要 */
    const items = [];
    items.push(`<span class="se-kv"><b>本期</b>${fmtNum(ch.cur)} ${esc(ch.unit)}</span>`);
    if (ch.prev !== null && ch.prev !== undefined) {
      items.push(`<span class="se-kv"><b>上期</b>${fmtNum(ch.prev)}</span>`);
    }
    if (ch.mom !== null && ch.mom !== undefined) {
      const cls = ch.mom > 0 ? "up" : (ch.mom < 0 ? "down" : "neutral");
      items.push(`<span class="se-kv"><b>环比</b><span class="${cls}">${signedNum(ch.mom)}</span></span>`);
    }
    if (ch.yoy !== null && ch.yoy !== undefined) {
      const cls = ch.yoy > 0 ? "up" : (ch.yoy < 0 ? "down" : "neutral");
      items.push(`<span class="se-kv"><b>同比</b><span class="${cls}">${signedNum(ch.yoy)}</span></span>`);
    }
    if (ch.cumPct !== null && ch.cumPct !== undefined) {
      const cls = ch.cumPct > 0 ? "up" : (ch.cumPct < 0 ? "down" : "neutral");
      items.push(`<span class="se-kv"><b>累计同比</b><span class="${cls}">${signedNum(ch.cumPct)}%</span></span>`);
    }

    const legend = YEAR_STYLE.map((k) =>
      `<span class="se-lg"><i style="background:${k.color}"></i>${k.year}</span>`).join("");

    return `
      <div class="se-chart">
        <div class="se-head">
          <div class="se-title">${esc(ch.title)}</div>
          <div class="se-meta">截至 ${esc(ch.asOf)} · ${esc(ch.source)}</div>
        </div>
        <div class="se-vals">${items.join("")}</div>
        <div class="se-legend">${legend}</div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"
             preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          ${grid}${yTicks}${xTicks}${paths}
        </svg>
      </div>`;
  }

  function seasonalSection(se) {
    if (!se || !se.charts || !se.charts.length) return "";
    const charts = se.charts.map((c) => seasonalChart(c, se.axis)).join("");
    const src = (SEASONAL.meta && SEASONAL.meta.sources) || [];
    const srcHtml = src.map((s) =>
      `<li>${esc(s.name)}（数据日期 ${esc(s.asOf)}）</li>`).join("");

    return `
      <div class="card section-anchor" id="s-seasonal">
        <div class="card-head"><div class="card-title">季节性图谱</div>
          <span class="card-index">07</span>
          <span class="badge accent" style="margin-left:auto">${se.charts.length} 张图</span>
        </div>
        <div class="note-line">
          ${esc((SEASONAL.meta && SEASONAL.meta.note) || "")}
          深蓝实线为 2026 年，浅色虚线为 2024／2025 年同期。数据缺失处曲线断开。
        </div>
        <div class="se-grid">${charts}</div>
        <div class="se-src">
          <div class="se-src-t">数据来源</div>
          <ul>${srcHtml}</ul>
          <div class="note-line" style="margin-top:6px">
            季节性数据由站点自动抓取整理，更新频率与源站一致；品种持仓与交易决策请以交易所及资讯商实时数据为准。
          </div>
        </div>
      </div>`;
  }

  /* ---------- 价格定位条 ---------- */
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

  /* ============================================================
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
