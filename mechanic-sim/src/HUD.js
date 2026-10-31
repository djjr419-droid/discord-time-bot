// HUD.js — DOM heads-up display: stats, job card & objectives, hotbar, diagnostics, fluids,
// parts-out list, part inspection card, tooltips, toasts and the job board / shop / invoice modals.
import { TOOLS, UPGRADES, COSMETICS, CONSUMABLES, PART_CATALOG } from './Economy.js';

const $ = (s) => document.querySelector(s);
const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const pct = (x) => Math.round(x * 100);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.toastsEl = $('#toasts');
    this.tooltipEl = $('#tooltip');
    this.partCardFor = null;
    this.shopTab = 'tools';
    $('#btn-jobs').onclick = () => game.openJobBoard();
    $('#btn-shop').onclick = () => this.openShop();
    $('#btn-help').onclick = () => this.openHelp();
    $('#btn-mute').onclick = () => { const m = game.audio.toggleMute(); $('#btn-mute').textContent = m ? '🔇' : '🔊'; };
    $('#btn-lift').onclick = () => game.toggleLift();
    $('#btn-lamp').onclick = () => game.toggleLamp();
    $('#btn-back').onclick = () => game.cam.stepBack();
    $('#btn-test').onclick = () => game.runTest();
    $('#btn-handover').onclick = () => game.handOver();
    $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && this.modalClosable) this.closeModal(); });
    document.querySelectorAll('.sp-tabs button').forEach((b) => {
      b.onclick = () => this.sideTab(b.dataset.tab);
    });
  }

  show() { this.el.classList.remove('hidden'); }

  // ---------------------------------------------------------------- stats
  refreshStats() {
    const e = this.game.economy;
    $('#cash').textContent = money(e.cash);
    $('#day').textContent = e.state.day;
    $('#level').textContent = e.level;
    const stars = e.repStars;
    let s = '';
    for (let i = 0; i < 5; i++) s += stars >= i + 0.75 ? '★' : stars >= i + 0.25 ? '⯪' : '<span class="off">★</span>';
    $('#rep').innerHTML = s;
  }

  setClock(min, book) {
    const el = $('#clock');
    if (min == null) { el.textContent = '--:--'; $('#book').textContent = ''; el.parentElement.classList.remove('over'); return; }
    const h = Math.floor(min / 60), m = Math.floor(min % 60);
    el.textContent = `${h}:${String(m).padStart(2, '0')}`;
    $('#book').textContent = `/ ${book.toFixed(1)}h book`;
    el.parentElement.classList.toggle('over', min > book * 60);
  }

  // ---------------------------------------------------------------- hotbar & views
  renderHotbar(current) {
    const e = this.game.economy;
    const ids = ['hand', 'socket', 'lug_wrench', 'screwdriver', 'drain_pan', 'impact', 'torque', 'multimeter', 'floor_jack'];
    $('#hotbar').innerHTML = ids.map((id, i) => {
      const t = TOOLS.find((x) => x.id === id);
      const owned = e.hasTool(id);
      return `<button class="slot ${id === current ? 'active' : ''} ${owned ? '' : 'locked'}" data-tool="${id}" title="${t.name}${owned ? '' : ' (locked — buy in shop)'}">
        <span class="key">${i + 1}</span>${t.icon}<small>${t.name}</small></button>`;
    }).join('');
    $('#hotbar').querySelectorAll('.slot').forEach((b) => { b.onclick = () => this.game.tools.equip(b.dataset.tool); });
  }

  renderViews(views, current) {
    $('#views').innerHTML = Object.entries(views).map(([k, v]) => `<button class="chip ${k === current ? 'on' : ''}" data-view="${k}">${v.label}</button>`).join('');
    $('#views').querySelectorAll('button').forEach((b) => { b.onclick = () => this.game.setView(b.dataset.view); });
  }

  setToggles({ lift, lamp }) {
    $('#btn-lift').classList.toggle('on', !!lift);
    $('#btn-lift').textContent = lift ? '⬇ Lower lift' : '⬆ Raise lift';
    $('#btn-lamp').classList.toggle('on', !!lamp);
  }

  // ---------------------------------------------------------------- job card
  showJob(job) {
    $('#jobcard').classList.remove('hidden');
    $('#sidepanel').classList.remove('hidden');
    $('#jc-model').textContent = job.model;
    $('#jc-customer').textContent = job.customer;
    $('#jc-complaint').textContent = `“${job.complaint}”`;
    $('#diag-codes').innerHTML = '<p class="muted">Run a scan at the diagnostic cart laptop, or inspect parts by hand.</p>';
    $('#diag-live').innerHTML = '';
    $('#diag-meter').innerHTML = '';
  }

  hideJob() {
    $('#jobcard').classList.add('hidden');
    $('#sidepanel').classList.add('hidden');
    this.closePartCard();
  }

  setObjectives(list) {
    $('#jc-objectives').innerHTML = list.map((o) => `<li class="${o.state}">${o.text}</li>`).join('');
  }

  sideTab(tab) {
    document.querySelectorAll('.sp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.sp-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== tab));
  }

  // ---------------------------------------------------------------- diagnostics
  showScan(scan) {
    const codes = scan.codes.length
      ? scan.codes.map(([c, d]) => `<div class="code"><b>${c}</b><span>${d}</span></div>`).join('')
      : '<div class="code ok"><b>OK</b><span>No stored trouble codes. Fault may be mechanical — inspect by hand.</span></div>';
    $('#diag-codes').innerHTML = codes;
    const L = scan.live;
    $('#diag-live').innerHTML = `<div class="live">
      <div>Idle RPM<b>${L.rpm}</b></div><div>Coolant<b>${L.coolant}°C</b></div>
      <div>Battery<b>${L.voltage.toFixed ? L.voltage.toFixed(1) : L.voltage} V</b></div><div>Oil life<b>${L.oilLife}%</b></div>
      ${L.boost != null ? `<div>Boost<b>${L.boost.toFixed(1)} bar</b></div>` : ''}
    </div>`;
    this.sideTab('diag');
  }

  showReading(part, r) {
    $('#diag-meter').innerHTML = `<div class="meter">📟 ${part.name}: <b>${r.value} ${r.unit}</b><br>${r.verdict}</div>`;
    this.sideTab('diag');
    this.toast(`${part.name}: ${r.value} ${r.unit} — ${r.verdict}`, r.verdict.startsWith('PASS') ? 'ok' : 'bad', 3500);
  }

  renderFluids(v) {
    if (!v) return;
    const row = (label, lvl, quality, kind, extra = '') => {
      const cls = lvl < 0.5 ? 'bad' : lvl < 0.9 || quality < 0.5 ? 'warn' : '';
      return `<div class="fluid"><span>${label}</span><div class="bar ${cls}"><i style="width:${pct(lvl)}%"></i></div>
        <button data-fill="${kind}" ${lvl > 0.95 ? 'disabled' : ''}>Refill${extra}</button></div>`;
    };
    let h = row('Oil', v.fluids.oil.level, v.fluids.oil.quality, 'oil', ` $${CONSUMABLES.oil.price}`);
    if (v.fluids.oil.level > 0.5) h += `<div class="muted" style="font-size:11.5px;margin:-2px 0 6px 78px">Condition: ${v.fluids.oil.quality < 0.5 ? 'black & sludgy' : 'clean amber'}</div>`;
    if (!v.fluids.coolant.none) h += row('Coolant', v.fluids.coolant.level, 1, 'coolant', ` $${CONSUMABLES.coolant.price}`);
    $('#fluids').innerHTML = h;
    $('#fluids').querySelectorAll('button[data-fill]').forEach((b) => { b.onclick = () => this.game.tools.pourFluid(b.dataset.fill); });
  }

  renderParts(v) {
    const list = v ? [...v.parts.values()].filter((p) => p.state === 'removed') : [];
    $('#parts-count').textContent = list.length;
    $('#parts-list').innerHTML = list.length
      ? list.map((p) => {
        const g = this.gradeFor(p);
        return `<div class="part-row"><span class="nm">${p.name}</span><button data-open="${p.id}">Inspect</button>
          <span class="gr ${g.cls}">${g.label}${p.replaced ? ' · NEW' : ''}</span><button data-install="${p.id}">Install</button></div>`;
      }).join('')
      : '<p class="muted">Nothing on the bench. Removed parts land here.</p>';
    $('#parts-list').querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => this.openPartCard(v.parts.get(b.dataset.open)); });
    $('#parts-list').querySelectorAll('[data-install]').forEach((b) => { b.onclick = () => this.game.partAction(v.parts.get(b.dataset.install), 'install'); });
  }

  gradeFor(p) {
    if (!p.inspected && p.state === 'installed') return { label: 'Not inspected', cls: '' };
    return p.conditionGrade();
  }

  // ---------------------------------------------------------------- part card
  openPartCard(part) {
    if (!part) return;
    part.inspected = true;
    this.partCardFor = part;
    const c = part.condition;
    const e = this.game.economy;
    const cost = e.partCost(part.kind);
    const g = part.conditionGrade();
    const bar = (label, val, invert = false) => {
      const bad = invert ? 1 - val : val;
      const cls = bad > 0.7 ? 'bad' : bad > 0.45 ? 'warn' : '';
      return `<div class="cond"><span>${label}</span><div class="bar ${cls}"><i style="width:${pct(val)}%"></i></div><span>${pct(val)}%</span></div>`;
    };
    const removed = part.state === 'removed';
    const isWheel = part.isWheel;
    $('#partcard').innerHTML = `
      <button class="pc-close" title="Close">×</button>
      <h3>${part.name}</h3>
      <div class="sub">${PART_CATALOG[part.kind]?.name || part.kind} · ${removed ? 'On the bench' : 'Installed'}${part.replaced ? ' · <b style="color:var(--good)">NEW</b>' : ''}</div>
      ${bar('Wear', c.wearLevel)}
      ${bar('Rust', c.rust)}
      ${bar('Heat damage', c.heatDamage)}
      ${bar('Cleanliness', c.isClean ? 1 : Math.max(0, 1 - c.grease), true)}
      ${isWheel ? `<div class="cond"><span>Balance</span><span class="gr ${part.balanced ? 'good' : 'bad'}">${part.balanced ? 'Within 5 g' : 'Out by 45 g'}</span><span></span></div>` : ''}
      <div class="verdict"><span class="gr ${g.cls}">${g.label}</span></div>
      ${part.measured ? `<div class="meter">📟 ${part.measured.value} ${part.measured.unit} — ${part.measured.verdict}</div>` : ''}
      <div class="pc-actions">
        ${removed ? `<button class="ghost" data-a="clean">🧽 Brush clean</button>` : ''}
        ${removed ? `<button class="ghost" data-a="ultrasonic" ${e.hasTool('ultrasonic') ? '' : 'disabled title="Buy the ultrasonic cleaner"'}>🫧 Ultrasonic</button>` : ''}
        ${removed && isWheel ? `<button class="ghost" data-a="balance" ${e.hasTool('balancer') ? '' : 'disabled title="Buy the laser balancer"'}>🎯 Balance</button>` : ''}
        ${removed ? `<button class="primary" data-a="replace" ${part.replaced ? 'disabled' : ''}>🛒 New part $${cost}</button>` : ''}
        ${removed ? `<button class="good" data-a="install">⤴ Install</button>` : ''}
        ${!removed && part.electrical ? `<button class="ghost" data-a="measure">📟 Measure</button>` : ''}
      </div>`;
    $('#partcard').classList.remove('hidden');
    $('#partcard .pc-close').onclick = () => this.closePartCard();
    $('#partcard').querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => this.game.partAction(part, b.dataset.a); });
  }

  refreshPartCard() { if (this.partCardFor && !$('#partcard').classList.contains('hidden')) this.openPartCard(this.partCardFor); }

  closePartCard() { $('#partcard').classList.add('hidden'); this.partCardFor = null; }

  inspectHint(part) {
    const c = part.condition;
    const notes = [];
    if (c.rust > 0.4) notes.push('heavy surface rust');
    if (c.heatDamage > 0.5) notes.push('blue/straw heat discolouration');
    if (!c.isClean && c.grease > 0.6) notes.push('caked in grime');
    if (c.wearLevel > 0.75) notes.push('looks worn out');
    if (part.isWheel && !part.balanced) notes.push('missing a balance weight');
    if (notes.length) setTimeout(() => this.toast(`Visual check — ${part.name}: ${notes.join(', ')}.`, '', 3200), 300);
  }

  // ---------------------------------------------------------------- tooltip / toasts / flash
  tooltip(html, x, y) {
    if (!html) { this.tooltipEl.classList.add('hidden'); return; }
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.left = `${Math.min(x, innerWidth - 300)}px`;
    this.tooltipEl.style.top = `${Math.min(y, innerHeight - 120)}px`;
    this.tooltipEl.classList.remove('hidden');
  }

  toast(msg, type = '', ms = 2400) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
  }

  flash(color) {
    const f = $('#flash');
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = '1';
    requestAnimationFrame(() => { f.style.transition = 'opacity .8s'; f.style.opacity = '0'; });
  }

  // ---------------------------------------------------------------- modals
  modal(html, closable = true) {
    this.modalClosable = closable;
    $('#modal-box').innerHTML = (closable ? '<button class="modal-close">×</button>' : '') + html;
    $('#modal').classList.remove('hidden');
    const c = $('#modal-box .modal-close');
    if (c) c.onclick = () => this.closeModal();
    this.game.onModal(true);
  }

  closeModal() {
    $('#modal').classList.add('hidden');
    this.game.onModal(false);
  }

  get modalOpen() { return !$('#modal').classList.contains('hidden'); }

  openJobBoard(jobs, busy) {
    const e = this.game.economy;
    const icon = { sports: '🏎', truck: '🛻', moto: '🏍' };
    const html = `<h2>Job Board</h2><p class="lead">${busy ? 'Finish the current job before taking another.' : 'Pick a repair order. Flat-rate labor pays book hours — beat the clock for a bonus.'}</p>
      <div class="jobs">${jobs.map((j) => {
        const can = e.canAccept(j);
        return `<div class="job"><div class="veh">${icon[j.vehicle]} ${j.model}<small>${j.customer}</small></div>
          <div class="complaint">“${j.complaint}”</div>
          <div class="meta"><span>Book <b>${j.bookHours.toFixed(1)} h</b></span><span>Labor <b>$${j.laborRate}/h</b></span><span>Est. <b>${money(j.quote)}+</b></span></div>
          <div>${j.arrivedHot ? '<span class="tag">🔥 driven in hot</span> ' : ''}${j.tools.map((t) => `<span class="tag">needs ${TOOLS.find((x) => x.id === t).name}</span>`).join(' ')}</div>
          ${can.ok ? '' : `<div class="req">${can.reason}</div>`}
          <button class="primary" data-job="${j.id}" ${busy || !can.ok ? 'disabled' : ''}>Accept job</button></div>`;
      }).join('')}</div>`;
    this.modal(html);
    $('#modal-box').querySelectorAll('[data-job]').forEach((b) => { b.onclick = () => { this.closeModal(); this.game.acceptJob(+b.dataset.job); }; });
  }

  openShop(tab = this.shopTab) {
    this.shopTab = tab;
    const e = this.game.economy;
    const tabs = [['tools', 'Tools'], ['upgrades', 'Upgrades'], ['cosmetics', 'Garage style'], ['supplies', 'Supplies'], ['ledger', 'Ledger']];
    let body = '';
    if (tab === 'tools') {
      body = `<div class="items">${TOOLS.filter((t) => t.tier > 0).map((t) => {
        const owned = e.hasTool(t.id);
        const need = t.tier === 3 ? 3 : t.tier === 2 ? 2 : 1;
        return `<div class="item ${owned ? 'owned' : ''}"><div class="ic">${t.icon}</div><div class="nm">${t.name} <span class="tag">Tier ${t.tier}</span></div>
          <div class="ds">${t.desc}</div><div class="row"><span class="price">${t.price ? money(t.price) : 'Starter'}</span>
          ${owned ? '<span class="tag">Owned</span>' : `<button class="primary" data-buy-tool="${t.id}" ${e.level < need ? `disabled title="Shop level ${need}"` : ''}>${e.level < need ? `Lv ${need}` : 'Buy'}</button>`}</div></div>`;
      }).join('')}</div>`;
    } else if (tab === 'upgrades') {
      body = `<div class="items">${UPGRADES.map((u) => {
        const owned = e.hasUpgrade(u.id);
        return `<div class="item ${owned ? 'owned' : ''}"><div class="nm">${u.name}</div><div class="ds">${u.desc}</div>
          <div class="row"><span class="price">${money(u.price)}</span>${owned ? '<span class="tag">Installed</span>' : `<button class="primary" data-buy-up="${u.id}" ${e.level < u.level ? 'disabled' : ''}>${e.level < u.level ? `Lv ${u.level}` : 'Buy'}</button>`}</div></div>`;
      }).join('')}</div>`;
    } else if (tab === 'cosmetics') {
      const cats = [['wall', 'Wall paint'], ['floor', 'Floor'], ['lighting', 'Lighting'], ['wrap', 'Tool chest & lift wrap']];
      body = cats.map(([cat, label]) => `<h4 style="margin:14px 0 8px;color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.08em">${label}</h4>
        <div class="items">${COSMETICS[cat].map((c) => {
          const owned = e.state.ownedCosmetics.includes(`${cat}:${c.id}`);
          const active = e.state.cosmetics[cat] === c.id;
          const sw = c.color || c.tint || (c.id === 'checker' ? 'repeating-conic-gradient(#111 0 25%, #ddd 0 50%) 0 0/16px 16px' : '#444');
          return `<div class="item ${active ? 'owned' : ''}"><div class="swatch" style="background:${sw}${c.accent ? `;box-shadow: inset 0 -6px 0 ${c.accent}` : ''}"></div>
            <div class="nm">${c.name}</div><div class="row"><span class="price">${owned ? '' : money(c.price)}</span>
            ${active ? '<span class="tag">Active</span>' : `<button class="${owned ? 'ghost' : 'primary'}" data-cos="${cat}:${c.id}">${owned ? 'Apply' : 'Buy'}</button>`}</div></div>`;
        }).join('')}</div>`).join('');
    } else if (tab === 'supplies') {
      body = `<div class="items">${Object.entries(CONSUMABLES).map(([id, c]) => `<div class="item"><div class="nm">${c.name}</div>
        <div class="ds">In stock: ${e.state.stock[id] || 0}. Used for refills; billed to the customer with markup.</div>
        <div class="row"><span class="price">${money(c.price)}</span><button class="primary" data-sup="${id}">Buy</button></div></div>`).join('')}</div>`;
    } else {
      body = `<table class="ledger">${e.state.ledger.map((l) => `<tr><td>Day ${l.day}</td><td>${l.label}</td><td style="color:${l.amount < 0 ? 'var(--bad)' : 'var(--good)'}">${money(l.amount)}</td></tr>`).join('') || '<tr><td class="muted">No transactions yet.</td></tr>'}</table>`;
    }
    this.modal(`<h2>Shop Terminal</h2><p class="lead">Balance <b style="color:var(--good)">${money(e.cash)}</b> · Shop level ${e.level} · ${e.state.jobsDone} jobs completed</p>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>${body}`);
    const box = $('#modal-box');
    box.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => this.openShop(b.dataset.tab); });
    box.querySelectorAll('[data-buy-tool]').forEach((b) => { b.onclick = () => this._result(e.buyTool(b.dataset.buyTool)); });
    box.querySelectorAll('[data-buy-up]').forEach((b) => { b.onclick = () => this._result(e.buyUpgrade(b.dataset.buyUp)); });
    box.querySelectorAll('[data-cos]').forEach((b) => { b.onclick = () => { const [c, id] = b.dataset.cos.split(':'); this._result(e.buyCosmetic(c, id)); }; });
    box.querySelectorAll('[data-sup]').forEach((b) => { b.onclick = () => this._result(e.buyConsumable(b.dataset.sup)); });
  }

  _result(r) {
    if (r.ok) { this.game.audio.play('cash'); this.toast('Purchased!', 'ok'); }
    else { this.game.audio.play('error'); this.toast(r.reason, 'bad'); }
    this.refreshStats();
    this.renderHotbar(this.game.tools.current);
    this.openShop(this.shopTab);
  }

  openInvoice(job, inv, onCollect) {
    const stars = '★'.repeat(Math.round(inv.stars)) + '<span class="off" style="color:rgba(255,255,255,.18)">' + '★'.repeat(5 - Math.round(inv.stars)) + '</span>';
    const rows = inv.lines.map((l) => `<tr class="${l.amount < 0 ? 'neg' : ''} ${l.note ? 'note' : ''}"><td>${l.label}</td><td>${l.note ? '—' : money(l.amount)}</td></tr>`).join('');
    const html = `<div class="invoice-head"><div><h2>Invoice #${String(job.id).padStart(4, '0')}</h2>
      <p class="lead" style="margin:0">${job.customer} · ${job.model} — “${job.complaint}”</p></div>
      <div style="text-align:right"><div class="big-stars">${stars}</div><div class="muted">Reputation ${inv.repDelta >= 0 ? '+' : ''}${inv.repDelta}</div></div></div>
      <table class="invoice">${rows}
        <tr class="total"><td>Customer pays</td><td>${money(inv.gross)}</td></tr>
        <tr class="neg"><td>Shop electricity</td><td>${money(-inv.electricity)}</td></tr>
        ${inv.partsAbsorbed ? `<tr class="neg"><td>Unbilled parts you bought (already paid)</td><td>${money(-inv.partsAbsorbed)}</td></tr>` : ''}
        <tr class="total"><td>Net to the shop</td><td style="color:${inv.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(inv.net)}</td></tr>
      </table>
      <div class="actions"><button class="good big" id="collect">Collect payment</button></div>`;
    this.modal(html, false);
    $('#collect').onclick = () => { this.closeModal(); onCollect(); };
  }

  openTest(state) {
    const html = `<h2>Road test</h2><p class="lead">${state.title}</p>
      <div class="test-gauge"><div class="rpm" id="test-rpm">0</div><div class="muted">RPM</div></div>
      <ul class="symptoms" id="test-sym">${state.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="actions"><button class="ghost" id="test-close" disabled>Close</button></div>`;
    this.modal(html, false);
  }

  updateTest(rpm, lines, done) {
    const r = $('#test-rpm');
    if (r) r.textContent = Math.round(rpm);
    if (lines) $('#test-sym').innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
    if (done) {
      const c = $('#test-close');
      c.disabled = false;
      c.onclick = () => this.closeModal();
    }
  }

  openHelp() {
    this.modal(`<h2>Shop manual</h2><p class="lead">You work from one service bay. The camera moves between work positions; your hands do the rest.</p>
      <div class="help-grid">
        <div><kbd>Left-click</kbd> fastener / part / equipment</div><div><kbd>Right-drag</kbd> look around</div>
        <div><kbd>Mouse wheel</kbd> focus zoom</div><div><kbd>Space</kbd> / right-click: step back</div>
        <div><kbd>1–9</kbd> select tool</div><div><kbd>Q</kbd> / <kbd>E</kbd> cycle work positions</div>
        <div><kbd>L</kbd> raise / lower lift</div><div><kbd>F</kbd> work lamp</div>
        <div><kbd>J</kbd> job board · <kbd>B</kbd> shop</div><div><kbd>M</kbd> mute · <kbd>H</kbd> this help</div>
      </div>
      <div class="help-flow">
        <b>Workflow:</b> accept a job at the board → the vehicle rolls in → scan codes at the diagnostic laptop or inspect parts →
        open the hood / raise the lift → loosen every fastener on a part (and anything mounted on top of it) → pull it, inspect it on the bench →
        clean, balance or buy a new one → install it and tighten every fastener (lug nuts in a <b>star pattern</b>) → refill fluids →
        <b>Start &amp; test</b> → <b>Hand over</b> for payment.<br>
        <b>Tips:</b> put the drain pan under the plug before pulling it · open the radiator petcock before pulling coolant hoses on a hot engine ·
        a torque wrench earns a quality bonus · impact guns can strip small bolts · don't grab exhaust parts right after a test run.
      </div>`);
  }

  // ---------------------------------------------------------------- title
  setLoading(p) { $('#loading-bar').style.width = `${Math.round(p * 100)}%`; }

  ready(onStart) {
    const b = $('#btn-start');
    b.disabled = false;
    b.textContent = 'Open the shop';
    b.onclick = () => { $('#title').classList.add('hidden'); onStart($('#quality').value); };
    $('#btn-wipe').onclick = () => { if (confirm('Reset all progress?')) { this.game.economy.wipe(); this.toast('Save reset.'); } };
  }
}
