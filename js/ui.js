/* Sugar Burst — screens, HUD, map, popups, boosters, progress */
(function () {
  'use strict';
  var SB = window.SB, Levels = window.Levels, Model = window.Model;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var DPR = SB.DPR;
  var TAU = Math.PI * 2;
  function snd(name, o) { try { window.Snd && Snd.play(name, o || {}); } catch (e) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ---------------- save ----------------
  var KEY = 'sugarburst.v1';
  function fresh() {
    return { unlocked: 1, stars: {}, best: {}, coins: 600, boosters: { hammer: 3, swap: 3, shuffle: 2, wand: 1 }, pre: { bomb: 1, sw: 2, moves: 2 },
      set: { music: true, sfx: true, vib: true }, seen: {}, daily: '', fogLevel: 1, adDay: '', adCount: 0 };
  }
  var S = fresh();
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { var o = JSON.parse(raw); for (var k in o) S[k] = o[k]; }
  } catch (e) {}
  if (!S.fogLevel) S.fogLevel = S.unlocked;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ---------------- icons ----------------
  // icon URLs (files under assets/images, see assets/ASSETS.md)
  var IC = {
    star: function () { return Assets.url('ui/star'); },
    starE: function () { return Assets.url('ui/star_empty'); },
    coin: function () { return Assets.url('ui/coin'); },
    mascot: function () { return Assets.url('ui/mascot'); },
    booster: function (n) { return Assets.url('booster/' + n); },
    decor: function (n) { return Assets.url('decor/' + n); },
    goal: function (t) { return Assets.url('goal/' + t); }
  };
  var SVG = {
    play: '<svg class="play-ic" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>'
  };

  // draws a goal icon into a canvas
  function goalCanvas(g, px) {
    var c = document.createElement('canvas');
    c.width = c.height = px * DPR;
    var x = c.getContext('2d');
    x.translate(px * DPR / 2, px * DPR / 2); x.scale(DPR, DPR);
    if (g.type === 'collect') SB.drawAsset(x, SB.candyKey(g.color, 'normal'), px * 0.95);
    else if (g.type === 'kind') {
      var map = { stripe: 'sh', wrap: 'wrap', bomb: 'bomb', fish: 'fish' };
      SB.drawAsset(x, SB.candyKey(g.kind === 'bomb' ? -1 : 4 - (g.kind === 'wrap' ? 3 : g.kind === 'fish' ? 1 : 0), map[g.kind]), px * 0.95);
    } else SB.drawAsset(x, 'goal/' + g.type, px);
    return c;
  }
  function goalText(g) {
    var cn = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    switch (g.type) {
      case 'score': return 'Score ' + g.n + ' points';
      case 'collect': return 'Collect ' + cn[g.color] + ' candies';
      case 'kind': return 'Fire ' + { stripe: 'Striped Candies', wrap: 'Wrapped Candies', bomb: 'Rainbow Candies', fish: 'Gummy Fish' }[g.kind];
      case 'jelly': return 'Clear all the jelly';
      case 'frost': return 'Break all the frosting';
      case 'lock': return 'Open all the candy cages';
      case 'ingr': return 'Bring the cherries & nuts down';
    }
    return '';
  }

  // ---------------- DOM refs ----------------
  var app = $('#app');
  var screens = { loading: $('#screen-loading'), title: $('#screen-title'), map: $('#screen-map'), game: $('#screen-game') };
  var cur = 'loading';
  var board, game = null, level = null, levelN = 1;
  var disp = { score: 0, left: {}, moves: 0 };
  var W = 0, H = 0;

  // ---------------- screens ----------------
  function show(name) {
    for (var k in screens) screens[k].classList.toggle('on', k === name);
    cur = name;
    if (name === 'map') { buildMap(); if (window.Snd) Snd.music('map'); setTimeout(mapAfterShow, 450); }
    if (name === 'title' && window.Snd) Snd.music('map');
    if (name !== 'game' && board) { board.active = false; clearFx(); }
    resize();
  }
  async function transition(name, mid) {
    var cv = $('#cover');
    cv.classList.add('on');
    await sleep(360);
    if (mid) await mid();
    show(name);
    await sleep(60);
    cv.classList.remove('on');
  }
  function clearFx() {
    var fx = $('#fx'), x = fx.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, fx.width, fx.height);
  }

  // ---------------- toast / modal ----------------
  var toastT = 0;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 1900);
  }
  var modalClose = null;
  function modal(build, opts) {
    opts = opts || {};
    var m = $('#modal');
    m.innerHTML = '';
    var p = h('div', 'panel' + (opts.cls ? ' ' + opts.cls : ''));
    if (opts.ribbon) p.appendChild(h('div', 'ribbon ' + (opts.ribbonCls || ''), opts.ribbon));
    if (opts.close !== false) {
      var x = h('button', 'close-x', '✕');
      x.onclick = function () { snd('tap'); closeModal(); if (opts.onClose) opts.onClose(); };
      p.appendChild(x);
    }
    var body = h('div', 'p-body');
    p.appendChild(body);
    build(body);
    if (opts.footer) { var foot = h('div', 'p-foot'); opts.footer(foot); p.appendChild(foot); }
    m.appendChild(p);
    m.classList.add('on');
    snd('popup');
    modalClose = opts.onClose || null;
    return body;
  }
  function closeModal() { var m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
  function btn(text, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), text);
    b.onclick = function (e) { if (window.Snd) Snd.unlock(); snd('tap'); fn(e); };
    return b;
  }

  // ---------------- title ----------------
  var titleCandies = [];
  function initTitle() {
    for (var i = 0; i < 16; i++) titleCandies.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, v: 0.02 + Math.random() * 0.04, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 1.2, c: i % 6, k: ['normal', 'normal', 'sh', 'wrap', 'normal', 'bomb', 'fish'][i % 7] });
    var b = btn('Play', 'big pink', function () {
      if (window.Snd) { Snd.unlock(); Snd.music('map'); }
      transition('map');
    });
    $('.title-wrap').appendChild(b);
  }
  function drawTitle(dt) {
    var cv = $('#title-canvas'), x = cv.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    SB.Bg.draw(x, performance.now(), dt);
    var cs = Math.min(W, H) * 0.12;
    titleCandies.forEach(function (c) {
      c.y -= c.v * dt; c.r += c.vr * dt;
      if (c.y < -0.1) { c.y = 1.1; c.x = Math.random(); }
      var img = SB.candyImg(c.c, c.k, null, Math.round(cs));
      var s = cs * 1.3 * c.s;
      x.save(); x.globalAlpha = 0.9; x.translate(c.x * W, c.y * H); x.rotate(c.r); x.drawImage(img, -s / 2, -s / 2, s, s); x.restore();
    });
  }

  // ---------------- map ----------------
  var ZONES = [
    { name: 'Strawberry Fields', c: ['#ffe3f0', '#ffb6d6'], h: '#ff94c6', sign: 'linear-gradient(180deg,#ff8cc4,#e8267a)', deco: ['lollipop', 'cupcake', 'gumtree', 'candycane', 'cloud'] },
    { name: 'Lemon Valley', c: ['#fff8d0', '#ffe07a'], h: '#ffc94a', sign: 'linear-gradient(180deg,#ffd35c,#f08c00)', deco: ['icecream', 'donut', 'lollipop', 'mushroom', 'cloud'] },
    { name: 'Mint Lake', c: ['#dcfff3', '#8fe8cc'], h: '#55d6ad', sign: 'linear-gradient(180deg,#5ee8c0,#13a882)', deco: ['gumtree', 'mushroom', 'candycane', 'cupcake', 'cloud'] },
    { name: 'Choco Mountain', c: ['#f6e3d2', '#dcae8a'], h: '#c18660', sign: 'linear-gradient(180deg,#c98a5e,#7a4424)', deco: ['donut', 'cupcake', 'mushroom', 'icecream', 'cloud'] },
    { name: 'Grape Castle', c: ['#efe2ff', '#c9a8ff'], h: '#a97dff', sign: 'linear-gradient(180deg,#b98cff,#6a2fd6)', deco: ['lollipop', 'gumtree', 'candycane', 'icecream', 'cloud'] },
    { name: 'Rainbow Sky', c: ['#e3f6ff', '#a8dcff'], h: '#7cc2ff', sign: 'linear-gradient(180deg,#7fd0ff,#2b7fe0)', deco: ['cloud', 'lollipop', 'donut', 'cupcake', 'cloud'] }
  ];
  var MAP = { built: false, nodes: [], w: 0, fresh: 0, pendingOpen: 0, revealing: false };
  var GAP = 118, SEAM = 180, FOG_EDGE = 150;
  function nodePos(i, w, total) { // i: 1-based
    var y = total - 270 - (i - 1) * GAP;
    var x = w / 2 + Math.sin(i * 0.82) * w * 0.27;
    return [x, y];
  }
  function seamY(z) { return nodePos(z * 10 + 0.5, MAP.w, MAP.total)[1]; } // border between world z-1 and world z
  function mapVU() { return Math.max(1, Math.min(S.fogLevel || S.unlocked, S.unlocked)); }

  function ensureMap() {
    var scroll = $('#map-scroll'), inner = $('#map-inner');
    var w = scroll.clientWidth || W;
    var N = Levels.COUNT, total = 270 + (N - 1) * GAP + 260;
    if (MAP.built && MAP.w === w) return;
    MAP.built = true; MAP.w = w; MAP.total = total;
    inner.innerHTML = '';
    inner.style.height = total + 'px';
    var zN = Math.ceil(N / 10), z, i;
    // one continuous gradient; colors hand over inside each seam strip
    var stops = [];
    for (z = 0; z < zN; z++) {
      var Z = ZONES[z % ZONES.length];
      var yBottom = z === 0 ? total : seamY(z) - SEAM / 2;
      var yTop = z === zN - 1 ? 0 : seamY(z + 1) + SEAM / 2;
      stops.push(Z.c[0] + ' ' + Math.round(total - yBottom) + 'px', Z.c[1] + ' ' + Math.round(total - yTop) + 'px');
    }
    inner.style.backgroundImage = 'radial-gradient(rgba(255,255,255,.34) 2px, transparent 2.6px), linear-gradient(to top, ' + stops.join(', ') + ')';
    inner.style.backgroundSize = '30px 30px, 100% 100%';
    for (z = 0; z < zN; z++) {
      Z = ZONES[z % ZONES.length];
      if (z > 0) {
        var seam = h('img', 'seam');
        seam.src = Assets.url('map/seam_' + z);
        seam.style.top = (seamY(z) - SEAM / 2) + 'px';
        inner.appendChild(seam);
      }
      // scenery along the world, kept clear of the path and the seams
      for (var d = 0; d < 9; d++) {
        var np = nodePos(z * 10 + 1 + d + Math.random(), w, total);
        var nearSeam = (z > 0 && Math.abs(np[1] - seamY(z)) < 120) || (z < zN - 1 && Math.abs(np[1] - seamY(z + 1)) < 120);
        if (nearSeam) continue;
        var side = np[0] > w / 2 ? -1 : 1;
        var dx = w / 2 + side * w * (0.3 + Math.random() * 0.12);
        var size = 56 + Math.random() * 40;
        var im = h('img', 'decor');
        im.src = IC.decor(Z.deco[d % Z.deco.length]);
        im.style.left = (dx - size / 2) + 'px'; im.style.top = (np[1] - size / 2 + (Math.random() - 0.5) * 50) + 'px';
        im.style.width = im.style.height = size + 'px';
        if (Z.deco[d % Z.deco.length] === 'cloud') im.style.opacity = 0.8;
        inner.appendChild(im);
      }
      var sp = nodePos(z * 10 + 0.5, w, total);
      var sign = h('div', 'zone-sign', Z.name + '<small>WORLD ' + (z + 1) + '</small>');
      sign.style.top = (z === 0 ? total - 182 : sp[1] - 26) + 'px';
      if (z > 0) sign.style.left = (sp[0] > w / 2 ? 26 : 74) + '%';
      sign.style.background = Z.sign;
      inner.appendChild(sign);
    }
    // path
    var pts = [];
    for (i = 1; i <= N; i++) pts.push(nodePos(i, w, total));
    var d2 = 'M' + pts[0][0] + ',' + pts[0][1];
    for (i = 1; i < pts.length; i++) {
      var p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i], p3 = pts[i + 1] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d2 += ' C' + c1[0].toFixed(1) + ',' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ',' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    inner.insertAdjacentHTML('beforeend', '<svg id="map-path" width="' + w + '" height="' + total + '" viewBox="0 0 ' + w + ' ' + total + '">' +
      '<path d="' + d2 + '" fill="none" stroke="rgba(120,30,80,.18)" stroke-width="30" stroke-linecap="round" transform="translate(0,6)"/>' +
      '<path d="' + d2 + '" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round"/>' +
      '<path d="' + d2 + '" fill="none" stroke="#ff7ab8" stroke-width="16" stroke-linecap="butt" stroke-dasharray="14 14"/></svg>');
    MAP.nodes = [];
    for (i = 1; i <= N; i++) {
      var nd = h('div', 'node');
      nd.style.left = pts[i - 1][0] + 'px'; nd.style.top = pts[i - 1][1] + 'px';
      (function (n) { nd.onclick = function () { if (window.Snd) Snd.unlock(); if (n <= S.unlocked) { snd('tap'); levelPopup(n); } else { snd('invalid'); toast('Beat the earlier levels first!'); } }; })(i);
      inner.appendChild(nd);
      MAP.nodes.push(nd);
    }
    MAP.mascot = h('img', 'mascot instant');
    MAP.mascot.src = IC.mascot();
    inner.appendChild(MAP.mascot);
    // fog over the levels still ahead
    var fill = h('div', 'fog-fill instant');
    for (var yy = 120; yy < total; yy += 330) {
      var mc = h('img', 'fog-cloud');
      var cw = 120 + Math.random() * 90;
      mc.src = IC.decor('cloud');
      mc.style.cssText = 'left:' + (Math.random() * (w - cw * 0.6) - cw * 0.2) + 'px;top:' + yy + 'px;width:' + cw + 'px;height:' + cw + 'px;opacity:.6;animation-duration:' + (6 + Math.random() * 5) + 's';
      fill.appendChild(mc);
    }
    var edge = h('div', 'fog-edge instant');
    for (i = 0; i < 7; i++) {
      var cl = h('img', 'fog-cloud');
      var sz = 120 + Math.random() * 60;
      cl.src = IC.decor('cloud');
      cl.style.cssText = 'left:' + (i / 6 * (w + 40) - sz / 2 - 20) + 'px;bottom:' + (8 + Math.random() * 46 - sz * 0.35) + 'px;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + (5 + Math.random() * 4) + 's;animation-delay:-' + (Math.random() * 4) + 's';
      edge.appendChild(cl);
    }
    MAP.fogTip = h('div', 'fog-tip');
    edge.appendChild(MAP.fogTip);
    inner.appendChild(fill); inner.appendChild(edge);
    MAP.fogFill = fill; MAP.fogEdge = edge;
  }
  function setFog(y, instant) {
    [MAP.fogFill, MAP.fogEdge].forEach(function (e) { e.classList.toggle('instant', !!instant); });
    MAP.fogFill.style.height = Math.max(0, y - FOG_EDGE) + 'px';
    MAP.fogEdge.style.top = (y - FOG_EDGE) + 'px';
    if (instant) { void MAP.fogFill.offsetHeight; [MAP.fogFill, MAP.fogEdge].forEach(function (e) { e.classList.remove('instant'); }); }
  }
  function placeMascot(i, instant) {
    var cp = nodePos(i, MAP.w, MAP.total), side = cp[0] > MAP.w / 2 ? -1 : 1;
    MAP.mascot.classList.toggle('instant', !!instant);
    MAP.mascot.style.left = (cp[0] + side * 62) + 'px'; MAP.mascot.style.top = (cp[1] + 70) + 'px';
    if (instant) { void MAP.mascot.offsetWidth; MAP.mascot.classList.remove('instant'); }
  }
  function scrollToNode(i, smooth) {
    var scroll = $('#map-scroll');
    var top = Math.max(0, nodePos(i, MAP.w, MAP.total)[1] - scroll.clientHeight * 0.62);
    try { scroll.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { scroll.scrollTop = top; }
  }
  // paint nodes, mascot and fog as if the player had reached level `vu`
  function refreshMap(vu, instant) {
    var N = Levels.COUNT;
    vu = vu || mapVU();
    for (var i = 1; i <= N; i++) {
      var node = MAP.nodes[i - 1], st = S.stars[i] || 0;
      node.className = 'node' + (i < vu || st ? ' done' : '') + (i === vu && !(i === N && st) ? ' cur' : '') + (i > vu ? ' locked' : '') + (MAP.fresh === i ? ' fresh' : '');
      var html = i > vu ? '<img class="lock-ic" src="' + IC.goal('lock') + '">' : String(i);
      if (st) {
        html += '<div class="stars">';
        for (var s = 0; s < 3; s++) html += '<img src="' + (s < st ? IC.star() : IC.starE()) + '">';
        html += '</div>';
      }
      node.innerHTML = html;
    }
    MAP.fresh = 0;
    var allDone = vu === N && S.stars[N];
    setFog(allDone ? -400 : nodePos(vu, MAP.w, MAP.total)[1] - 64, instant);
    MAP.fogTip.textContent = 'Beat Level ' + vu + ' to clear the fog';
    MAP.fogTip.hidden = !!allDone;
    placeMascot(vu, instant);
    updatePills();
    refreshAdUI();
  }
  function buildMap() {
    ensureMap();
    var vu = mapVU();
    refreshMap(vu, true);
    requestAnimationFrame(function () { scrollToNode(vu, false); });
  }
  function worldBanner(z) {
    var Z = ZONES[z % ZONES.length];
    var b = h('div', 'goal-banner world-banner', '<div class="t">New World Unlocked!</div><div class="wn" style="background:' + Z.sign + '">' + Z.name + '</div><div class="ws">WORLD ' + (z + 1) + '</div>');
    screens.map.appendChild(b);
    snd('level_start');
    setTimeout(function () { b.remove(); }, 2300);
  }
  function starBurst(container, x, y, n) {
    for (var i = 0; i < n; i++) {
      var im = h('img', 'burst'), a = i / n * TAU + Math.random() * 0.4, d = 46 + Math.random() * 44, s = 12 + Math.random() * 12;
      im.src = IC.star();
      im.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (x - s / 2) + 'px;top:' + (y - s / 2) + 'px';
      container.appendChild(im);
      var an = im.animate([{ transform: 'translate(0,0) scale(.3)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(1) rotate(200deg)', opacity: 0 }],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
      an.onfinish = (function (el) { return function () { el.remove(); }; })(im);
    }
  }
  // after a win: fog rolls back, the next node unlocks and the mascot hops over
  async function revealProgress() {
    if (MAP.revealing) return;
    var from = mapVU(), to = S.unlocked, N = Levels.COUNT;
    if (to <= from) { S.fogLevel = to; persist(); return; }
    MAP.revealing = true;
    S.fogLevel = to; persist();
    refreshMap(from, true);
    scrollToNode(from, false);
    await sleep(650);
    scrollToNode(to, true);
    snd('booster');
    var allDone = to === N && S.stars[N];
    MAP.fogTip.textContent = 'Beat Level ' + to + ' to clear the fog';
    setFog(allDone ? -400 : nodePos(to, MAP.w, MAP.total)[1] - 64, false);
    await sleep(1150);
    if (cur !== 'map') { MAP.revealing = false; return; }
    refreshMap(to, false);
    if (to > from) {
      var nd = MAP.nodes[to - 1], p = nodePos(to, MAP.w, MAP.total);
      nd.classList.add('unlocking');
      starBurst($('#map-inner'), p[0], p[1], 12);
      snd('unlock');
      await sleep(350);
      snd('select');
      if ((to - 1) % 10 === 0) { await sleep(500); worldBanner((to - 1) / 10); await sleep(1600); }
    }
    await sleep(500);
    MAP.revealing = false;
  }
  async function mapAfterShow() {
    var open = MAP.pendingOpen;
    MAP.pendingOpen = 0;
    if (mapVU() < S.unlocked) await revealProgress();
    if (open && open <= S.unlocked && cur === 'map') setTimeout(function () { levelPopup(open); }, 250);
  }
  function totalStars() { var t = 0; for (var k in S.stars) t += S.stars[k]; return t; }
  function updatePills() {
    $('#pill-coins span').textContent = S.coins;
    $('#pill-stars span').textContent = totalStars() + '/' + Levels.COUNT * 3;
  }

  // ---------------- tips ----------------
  var TIPS = {
    basic: ['Swap & Match', 'Swipe to swap neighbors. Line up 3 of a color to clear them!'],
    striped: ['Striped Candy', 'Match 4 in a row. It clears a whole row or column!'],
    wrapped: ['Wrapped Candy', 'Match 5 in an L or T shape. It explodes twice!'],
    bomb: ['Rainbow Candy', 'Match 5 in a row. Swap it to clear a whole color!'],
    fish: ['Gummy Fish', 'Match a 2×2 square. It swims off to hit a target!'],
    jelly: ['Jelly', 'Match on top of jelly to clear it. Double jelly takes two.'],
    frost: ['Frosting', 'Match next to frosting, or blast it, to break it.'],
    ingr: ['Ingredients', 'Bring cherries and nuts to the bottom to collect them!'],
    lock: ['Candy Cage', 'Caged candies can’t move. Match one to free it.'],
    combo: ['Super Combo', 'Swap two special candies together for a mega effect!']
  };
  // ---------------- boosters ----------------
  var BOOSTERS = [
    { id: 'hammer', name: 'Lolly Mallet', desc: 'Smash any one candy or blocker', price: 90, tip: 'Tap a candy or blocker to smash it' },
    { id: 'swap', name: 'Free Swap', desc: 'Swap any two neighbors, no move used', price: 70, tip: 'Swipe any two neighbors to swap them' },
    { id: 'shuffle', name: 'Magic Shuffle', desc: 'Mix up all the candies on the board', price: 50 },
    { id: 'wand', name: 'Rainbow Wand', desc: 'Turn one candy into a Rainbow Candy', price: 150, tip: 'Tap a candy to make it a Rainbow Candy' }
  ];
  var PRES = [
    { id: 'bomb', icon: 'pre_bomb', name: 'Rainbow Start', desc: 'Start with a Rainbow Candy', price: 100 },
    { id: 'sw', icon: 'pre_sw', name: 'Special Start', desc: 'Start with a Striped + a Wrapped Candy', price: 80 },
    { id: 'moves', icon: 'pre_moves', name: '+3 Moves', desc: 'Get 3 extra moves this level', price: 60 }
  ];
  function buildBoosterBar() {
    var bar = $('#boosters');
    bar.innerHTML = '';
    BOOSTERS.forEach(function (b) {
      var el = h('button', 'boost');
      el.dataset.id = b.id;
      el.innerHTML = '<img src="' + IC.booster(b.id) + '"><span class="badge"></span>';
      el.onclick = function () { if (window.Snd) Snd.unlock(); useBooster(b); };
      bar.appendChild(el);
    });
    refreshBoosters();
  }
  function refreshBoosters() {
    Array.prototype.forEach.call(document.querySelectorAll('.boost'), function (el) {
      var n = S.boosters[el.dataset.id] || 0, badge = el.querySelector('.badge');
      badge.textContent = n > 0 ? n : '+';
      badge.className = 'badge' + (n > 0 ? '' : ' buy');
      el.classList.toggle('active', board && board.mode === el.dataset.id);
    });
  }
  function setMode(mode, b) {
    board.mode = mode;
    board.sel = null;
    var tip = $('#boost-tip');
    if (mode) {
      tip.innerHTML = '<span>' + b.tip + '</span>';
      var cancel = h('button', '', 'Cancel');
      cancel.onclick = function () { snd('tap'); setMode(null); };
      tip.appendChild(cancel);
      tip.classList.add('on');
      tip.style.bottom = (board.botH + 6) + 'px';
      if (board.hint) { board.hint = null; hideHand(); }
    } else tip.classList.remove('on');
    refreshBoosters();
  }
  function buy(item, isPre, cb) {
    modal(function (p) {
      var ic = isPre ? IC.booster(item.icon) : IC.booster(item.id);
      p.appendChild(h('div', 'p-text', '<img src="' + ic + '" style="width:90px;height:90px;display:block;margin:0 auto 6px">' + item.desc));
      var b = btn('<img class="coin-ic" src="' + IC.coin() + '">' + item.price + '  Buy ×1', 'orange', function () {
        if (S.coins < item.price) { toast('Not enough coins — watch an ad for free coins!'); snd('invalid'); return; }
        S.coins -= item.price;
        if (isPre) S.pre[item.id] = (S.pre[item.id] || 0) + 1; else S.boosters[item.id] = (S.boosters[item.id] || 0) + 1;
        persist(); snd('coin'); closeModal(); if (cb) cb();
      });
      p.appendChild(h('div', 'p-row')).appendChild(b);
      var ar = h('div', 'p-row'); ar.style.marginTop = '12px';
      ar.appendChild(adButton('Free +' + ADS.reward + ' coins'));
      p.appendChild(ar);
      p.appendChild(balLine());
    }, { ribbon: item.name, ribbonCls: 'purple' });
  }
  function useBooster(b) {
    if (!board || board.busy || !game || game.state !== 'play') return;
    snd('tap');
    if (board.mode === b.id) { setMode(null); return; }
    if (!(S.boosters[b.id] > 0)) { buy(b, false, refreshBoosters); return; }
    if (b.id === 'shuffle') {
      var ph = game.shuffleBooster();
      if (!ph) return;
      S.boosters.shuffle--; persist(); refreshBoosters();
      snd('booster');
      runPhases(ph, true);
      return;
    }
    snd('booster');
    setMode(b.id, b);
  }
  function boosterCell(mode, cell) {
    var ph = mode === 'hammer' ? game.hammer(cell[0], cell[1]) : game.wand(cell[0], cell[1]);
    if (!ph) { board.nudge(cell); toast(mode === 'wand' ? 'Pick a regular candy' : 'That can’t be smashed'); return; }
    S.boosters[mode]--; persist();
    setMode(null);
    runPhases(ph, true);
  }

  // ---------------- HUD ----------------
  var warned = false;
  function buildHud() {
    $('#lvl-tag').textContent = 'Level ' + levelN;
    var gl = $('#goals');
    gl.innerHTML = '';
    disp.left = {};
    game.goals.forEach(function (g) {
      var el = h('div', 'goal');
      el.dataset.key = g.key;
      el.appendChild(goalCanvas(g, 38));
      var cnt = h('div', 'cnt o-text', String(g.n));
      el.appendChild(cnt);
      el.appendChild(h('div', 'chk', '✓'));
      gl.appendChild(el);
      disp.left[g.key] = g.n;
    });
    disp.score = 0;
    $('#score-num').textContent = '0';
    var st = level.stars, bar = $('#sbar');
    bar.querySelectorAll('img').forEach(function (e) { e.remove(); });
    for (var i = 0; i < 3; i++) {
      var im = h('img');
      im.src = IC.star();
      im.style.left = Math.min(96, st[i] / st[2] * 100) + '%';
      bar.appendChild(im);
    }
    warned = false;
    setMoves(game.moves);
    updateScore();
  }
  function setMoves(n) {
    disp.moves = n;
    var mb = $('#moves-box');
    $('#moves-num').textContent = n;
    mb.classList.toggle('warn', n <= 5 && game && game.state === 'play');
    if (n === 5 && !warned && game && game.state === 'play') {
      warned = true;
      snd('warning');
      toast('Only 5 moves left — you can do it!');
    }
  }
  function updateScore() {
    $('#score-num').textContent = disp.score;
    var st = level.stars;
    $('#sbar .fill').style.width = Math.min(100, disp.score / st[2] * 100) + '%';
    var imgs = $('#sbar').querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var on = disp.score >= st[i];
      if (on && !imgs[i].classList.contains('on')) { imgs[i].classList.add('on'); }
    }
    if (disp.left.score !== undefined) {
      var n = Math.max(0, game.goalN('score') - disp.score);
      setGoalCount('score', n);
    }
  }
  function goalEl(key) { return $('.goal[data-key="' + key + '"]'); }
  function setGoalCount(key, n) {
    disp.left[key] = n;
    var el = goalEl(key);
    if (!el) return;
    el.querySelector('.cnt').textContent = n;
    if (n <= 0 && !el.classList.contains('done')) { el.classList.add('done'); snd('collect', { i: 8 }); }
  }
  var collectI = 0;
  var UI = {
    requestSwap: function (a, b) {
      if (board.busy || !game || game.state !== 'play') return;
      var free = board.mode === 'swap';
      var res = game.swap(a, b, free);
      if (!res.phases) { board.nudge(a); return; }
      if (res.ok && free) { S.boosters.swap--; persist(); setMode(null); }
      if (res.ok && !free) setMoves(game.moves);
      runPhases(res.phases, res.ok);
    },
    boosterCell: boosterCell,
    toast: toast,
    setMoves: setMoves,
    movesPos: function () { return centerOf($('#moves-num')); },
    addScore: function (v) { disp.score += v; updateScore(); },
    goalPos: function (key) {
      var el = goalEl(key);
      if (!el || disp.left[key] <= 0) return null;
      return centerOf(el.querySelector('canvas'));
    },
    goalHit: function (key) {
      if (disp.left[key] === undefined) return;
      setGoalCount(key, Math.max(0, disp.left[key] - 1));
      var el = goalEl(key);
      if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      snd('collect', { i: (collectI++) % 8 });
    },
    onHint: function (hint) { if (hint && tutorial) showHand(hint); },
    vibrate: function () { return S.set.vib; }
  };
  function centerOf(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect(), ar = app.getBoundingClientRect();
    return [r.left - ar.left + r.width / 2, r.top - ar.top + r.height / 2];
  }

  // ---------------- turn flow ----------------
  async function runPhases(phases, counted) {
    board.busy = true;
    hideHand();
    tutorial = false;
    await board.play(phases);
    board.sync();
    await afterTurn();
  }
  async function afterTurn() {
    setMoves(game.moves);
    if (game.state === 'won') { await winFlow(); return; }
    if (game.state === 'lost') { await board.waitFlights(); await sleep(300); loseFlow(); return; }
    // make sure displayed goals match the model
    for (var k in game.left) if (k !== 'score' && disp.left[k] !== game.left[k] && board.flights === 0) setGoalCount(k, game.left[k]);
    board.busy = false;
    board.idle = 0;
  }
  async function winFlow() {
    board.busy = true;
    await board.waitFlights();
    for (var k in game.left) if (k !== 'score') setGoalCount(k, 0);
    board.word('Goals Complete!', 1);
    snd('sugar');
    await sleep(1100);
    var hasSpecial = false;
    game.eachCell(function (cl) { if (cl.candy && Model.isSpecial(cl.candy)) hasSpecial = true; });
    if (game.moves > 0 || hasSpecial) {
      board.word('Candy Party!', 3);
      await sleep(700);
      var ph = game.bonus();
      board.bonus = true;
      await board.play(ph);
      board.bonus = false;
      board.sync();
      await board.waitFlights();
    } else game.state = 'won';
    setMoves(0);
    await sleep(400);
    var stars = game.stars();
    var prev = S.stars[levelN] || 0;
    var reward = prev ? (stars > prev ? (stars - prev) * 15 : 5) : 20 + stars * 10;
    S.stars[levelN] = Math.max(prev, stars);
    S.best[levelN] = Math.max(S.best[levelN] || 0, game.score);
    if (S.unlocked === levelN && levelN < Levels.COUNT) S.unlocked = levelN + 1;
    S.coins += reward;
    MAP.fresh = levelN;
    persist();
    if (window.Snd) { Snd.duck(3); }
    snd('win');
    board.confetti(110);
    winPopup(stars, game.score, reward);
  }
  function winPopup(stars, score, reward) {
    var p = modal(function (p) {
      var row = h('div', 'win-stars');
      var cvs = [];
      for (var i = 0; i < 3; i++) {
        var c = document.createElement('canvas');
        var px = i === 1 ? 92 : 76;
        c.width = c.height = px * DPR;
        var x = c.getContext('2d'); x.translate(px * DPR / 2, px * DPR / 2); x.scale(DPR, DPR);
        SB.drawAsset(x, 'ui/star_empty', px * 0.97);
        row.appendChild(c); cvs.push([c, px]);
      }
      p.appendChild(row);
      var sc = h('div', 'win-score o-text', '0');
      p.appendChild(sc);
      var rrow = h('div', 'reward-row');
      var rw = h('div', 'win-reward', '<img src="' + IC.coin() + '">+<span class="rw">' + reward + '</span>');
      rrow.appendChild(rw);
      if (adsLeft() > 0) {
        var dbl = btn(SVG.play + 'Double it', 'ad-btn purple small dbl', function () {
          showRewardedAd(function () {
            addCoins(reward, centerOf(dbl));
            rw.querySelector('.rw').textContent = reward * 2;
            dbl.remove();
            toast('Reward doubled!');
          });
        });
        rrow.appendChild(dbl);
      }
      p.appendChild(rrow);
      var r = h('div', 'p-row');
      if (levelN < Levels.COUNT) r.appendChild(btn('Next Level', 'big', function () { closeModal(); MAP.pendingOpen = levelN + 1; transition('map'); }));
      else r.appendChild(btn('All Clear!', 'big', function () { closeModal(); transition('map'); }));
      p.appendChild(r);
      var r2 = h('div', 'p-row');
      r2.style.marginTop = '14px';
      r2.appendChild(btn('Replay', 'orange small', function () { closeModal(); startLevel(levelN); }));
      r2.appendChild(btn('Back to Map', 'blue small', function () { closeModal(); transition('map'); }));
      p.appendChild(r2);
      // animate stars & score
      cvs.forEach(function (cc, i) {
        if (i >= stars) return;
        setTimeout(function () {
          var c = cc[0], px = cc[1], x = c.getContext('2d');
          x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
          x.translate(px * DPR / 2, px * DPR / 2); x.scale(DPR, DPR);
          SB.drawAsset(x, 'ui/star', px * 0.97);
          c.animate([{ transform: 'scale(2.2) rotate(-30deg)', opacity: 0 }, { transform: 'scale(.9)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
          snd('star', { i: i });
          var pos = centerOf(c);
          if (pos) board.fireworks(pos[0], pos[1]);
        }, 450 + i * 480);
      });
      var t0 = performance.now() + 300;
      function tick() {
        var k = Math.max(0, Math.min(1, (performance.now() - t0) / 1300));
        sc.textContent = Math.round(score * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && document.body.contains(sc)) requestAnimationFrame(tick);
      }
      setTimeout(tick, 0);
    }, { ribbon: 'Level Clear!', close: false });
  }
  function loseFlow() {
    snd('lose');
    var price = 120;
    modal(function (p) {
      p.appendChild(h('div', 'p-sub', 'So close!'));
      var gl = h('div', 'p-goals');
      game.goals.forEach(function (g) {
        var d = h('div', 'p-goal');
        d.appendChild(goalCanvas(g, 54));
        var left = g.key === 'score' ? Math.max(0, g.n - game.score) : game.left[g.key];
        d.appendChild(h('span', left > 0 ? 'o-text' : 'done', left > 0 ? String(left) : '✓'));
        gl.appendChild(d);
      });
      p.appendChild(gl);
      var more = btn('<img class="coin-ic" src="' + IC.coin() + '">' + price + '  +5 Moves', 'orange', function () {
        if (S.coins < price) { toast('Not enough coins'); snd('invalid'); return; }
        S.coins -= price; persist(); snd('coin');
        closeModal();
        game.addMoves(5);
        setMoves(game.moves);
        warned = true;
        if (!game.hasMove()) runPhases([game.shuffle()]);
        else { board.busy = false; board.idle = 0; }
      });
      if (S.coins < price) more.disabled = true;
      p.appendChild(h('div', 'p-row')).appendChild(more);
      var ar = h('div', 'p-row'); ar.style.marginTop = '10px';
      ar.appendChild(adButton('Free +' + ADS.reward + ' coins', 'purple small', function () { setTimeout(function () { more.disabled = S.coins < price; }, 750); }));
      p.appendChild(ar);
      var r = h('div', 'p-row');
      r.appendChild(btn('Restart', 'small', function () { closeModal(); startLevel(levelN); }));
      r.appendChild(btn('Back to Map', 'blue small', function () { closeModal(); transition('map'); }));
      p.appendChild(r);
      var cc = balLine(); cc.style.marginTop = '12px';
      p.appendChild(cc);
    }, { ribbon: 'Out of Moves', ribbonCls: 'gray', close: false });
  }

  // ---------------- level start ----------------
  function levelPopup(n) {
    var lv = Levels.get(n);
    var sel = {};
    modal(function (p) {
      p.appendChild(h('div', 'p-sub', 'Goals'));
      var gl = h('div', 'p-goals');
      var tmp = new Model.Game(lv, 1, { record: false });
      tmp.goals.forEach(function (g) {
        var d = h('div', 'p-goal');
        d.appendChild(goalCanvas(g, 54));
        d.appendChild(h('span', 'o-text', String(g.n)));
        d.title = goalText(g);
        gl.appendChild(d);
      });
      p.appendChild(gl);
      p.appendChild(h('div', 'p-text', tmp.goals.map(goalText).join(' · ') + '<br>in <b style="color:#e8267a">' + lv.moves + '</b> moves'));
      if (lv.tip && TIPS[lv.tip]) {
        var card = h('div', 'tip-card');
        var tipImg = h('img');
        tipImg.src = Assets.url('tip/' + lv.tip); tipImg.alt = '';
        card.appendChild(tipImg);
        card.appendChild(h('div', 'tt', '<b><span class="tip-new">NEW</span>' + TIPS[lv.tip][0] + '</b>' + TIPS[lv.tip][1]));
        p.appendChild(card);
      }
      if (n >= 3) {
        p.appendChild(h('div', 'pre-lbl', '— BOOSTERS —'));
        var row = h('div', 'pre-row');
        PRES.forEach(function (it) {
          var b = h('button', 'pre');
          function paint() {
            var cnt = S.pre[it.id] || 0;
            b.innerHTML = '<img src="' + IC.booster(it.icon) + '"><span class="badge' + (cnt ? '' : ' buy') + '">' + (cnt ? cnt : '+') + '</span>';
            b.classList.toggle('sel', !!sel[it.id]);
          }
          b.onclick = function () {
            snd('tap');
            if (sel[it.id]) { sel[it.id] = false; paint(); return; }
            if (!(S.pre[it.id] > 0)) { buy(it, true, function () { levelPopup(n); }); return; }
            sel[it.id] = true; snd('booster'); paint();
          };
          b.title = it.desc;
          paint();
          row.appendChild(b);
        });
        p.appendChild(row);
      }
    }, { ribbon: 'Level ' + n, footer: function (f) {
      f.appendChild(btn('Play!', 'big', function () {
        closeModal();
        var pre = [];
        for (var k in sel) if (sel[k] && S.pre[k] > 0) { S.pre[k]--; pre.push(k); }
        persist();
        startLevel(n, pre);
      }));
      if (S.best[n]) f.appendChild(h('div', 'p-sub', 'Best score ' + S.best[n]));
    } });
  }

  var tutorial = false;
  async function startLevel(n, pre) {
    levelN = n;
    level = Levels.get(n);
    await transition('game', function () {
      game = new Model.Game(level, (Math.random() * 4294967296) >>> 0);
      (pre || []).forEach(function (k) { game.applyPre(k); });
      if (!game.hasMove()) game.shuffle();
      board.busy = true;
      board.active = true;
      board.fx.ps = []; board.top.ps = []; board.topEffects = [];
      measureHud();
      board.load(game).then(function () {});
      buildHud();
      setMode(null);
      buildBoosterBar();
    });
    if (window.Snd) Snd.music('game');
    snd('level_start');
    await sleep(750);
    goalBanner();
    await sleep(1500);
    if (pre && pre.length) toast('Boosters ready!');
    board.busy = false;
    board.idle = 0;
    if ((n === 1 && !S.seen.tut1) || level.tip === 'basic') {
      tutorial = true;
      S.seen.tut1 = 1; persist();
      board.hint = game.findHint();
      if (board.hint) showHand(board.hint);
    }
  }
  function goalBanner() {
    var b = h('div', 'goal-banner');
    b.appendChild(h('div', 't', game.goals.map(goalText).join('<br>')));
    var gl = h('div', 'p-goals');
    game.goals.forEach(function (g) {
      var d = h('div', 'p-goal');
      d.appendChild(goalCanvas(g, 54));
      d.appendChild(h('span', 'o-text', String(g.n)));
      gl.appendChild(d);
    });
    b.appendChild(gl);
    screens.game.appendChild(b);
    setTimeout(function () { b.remove(); }, 2300);
  }

  // tutorial hand
  var handAnim = null;
  function showHand(hint) {
    var el = $('#hand');
    var a = [board.cx(hint[0][1]), board.cy(hint[0][0])], b = [board.cx(hint[1][1]), board.cy(hint[1][0])];
    el.classList.add('on');
    if (handAnim) handAnim.cancel();
    var off = [-29, -3];
    handAnim = el.animate([
      { transform: 'translate(' + (a[0] + off[0]) + 'px,' + (a[1] + off[1]) + 'px) scale(1)', offset: 0 },
      { transform: 'translate(' + (a[0] + off[0]) + 'px,' + (a[1] + off[1]) + 'px) scale(.85)', offset: 0.2 },
      { transform: 'translate(' + (b[0] + off[0]) + 'px,' + (b[1] + off[1]) + 'px) scale(.85)', offset: 0.65 },
      { transform: 'translate(' + (b[0] + off[0]) + 'px,' + (b[1] + off[1]) + 'px) scale(1)', offset: 0.85 },
      { transform: 'translate(' + (b[0] + off[0]) + 'px,' + (b[1] + off[1]) + 'px) scale(1)', opacity: 0, offset: 1 }
    ], { duration: 1500, iterations: Infinity, easing: 'ease-in-out' });
  }
  function hideHand() { $('#hand').classList.remove('on'); if (handAnim) { handAnim.cancel(); handAnim = null; } }

  // ---------------- pause / settings / shop ----------------
  function toggleRow(label, key, apply) {
    var r = h('div', 'set-row', '<span>' + label + '</span>');
    var t = h('button', 'toggle' + (S.set[key] ? ' on' : ''));
    t.onclick = function () {
      S.set[key] = !S.set[key]; t.classList.toggle('on', S.set[key]); persist(); if (apply) apply(S.set[key]); snd('tap');
    };
    r.appendChild(t);
    return r;
  }
  function applyAudio() {
    if (!window.Snd) return;
    Snd.setMusic(!!S.set.music);
    Snd.setSfx(!!S.set.sfx);
  }
  function soundRows(p) {
    p.appendChild(toggleRow('Music', 'music', applyAudio));
    p.appendChild(toggleRow('Sound Effects', 'sfx', applyAudio));
    p.appendChild(toggleRow('Vibration', 'vib'));
  }
  function pauseMenu() {
    if (!game || board.busy) return;
    modal(function (p) {
      soundRows(p);
      var r = h('div', 'p-row');
      r.style.marginTop = '16px';
      r.appendChild(btn('Resume', 'big', function () { closeModal(); }));
      p.appendChild(r);
      var r2 = h('div', 'p-row');
      r2.appendChild(btn('Restart', 'orange small', function () { closeModal(); startLevel(levelN); }));
      r2.appendChild(btn('Back to Map', 'blue small', function () { closeModal(); transition('map'); }));
      p.appendChild(r2);
    }, { ribbon: 'Paused', ribbonCls: 'purple' });
  }
  function settings() {
    modal(function (p) {
      soundRows(p);
      var r = h('div', 'p-row');
      r.style.marginTop = '16px';
      r.appendChild(btn('Reset Progress', 'pink small', function () {
        modal(function (q) {
          q.appendChild(h('div', 'p-text', 'Clear all level progress, stars and coins?<br>This can’t be undone.'));
          var rr = h('div', 'p-row');
          rr.appendChild(btn('Yes, Reset', 'pink small', function () {
            var keep = S.set; S = fresh(); S.set = keep; persist(); closeModal(); buildMap(); toast('Progress reset');
          }));
          rr.appendChild(btn('Cancel', 'small', function () { closeModal(); settings(); }));
          q.appendChild(rr);
        }, { ribbon: 'Reset Progress', ribbonCls: 'gray', onClose: settings });
      }));
      r.appendChild(btn('OK', 'small', function () { closeModal(); }));
      p.appendChild(r);
      p.appendChild(h('div', 'p-text', '<span style="font-size:12px;opacity:.7">Sugar Burst · All art and audio are generated in code</span>'));
    }, { ribbon: 'Settings', ribbonCls: 'purple' });
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // ---------------- coins ----------------
  function refreshCoins() {
    Array.prototype.forEach.call(document.querySelectorAll('.coin-val'), function (e) { e.textContent = S.coins; });
    updatePills();
  }
  function balLine() {
    return h('div', 'bal-line', '<img src="' + IC.coin() + '"><span class="coin-val">' + S.coins + '</span>');
  }
  function coinTarget() {
    var m = $('#modal.on .bal-line img') || $('#modal.on .win-reward img');
    if (m) return m;
    return cur === 'map' ? $('#pill-coins img') : null;
  }
  function coinFly(from, toEl, n) {
    var to = toEl && centerOf(toEl);
    if (!from || !to) return;
    for (var i = 0; i < n; i++) (function (i) {
      var im = h('img', 'coin-fly');
      im.src = IC.coin();
      im.style.left = (from[0] - 15) + 'px'; im.style.top = (from[1] - 15) + 'px';
      app.appendChild(im);
      var dx = to[0] - from[0], dy = to[1] - from[1], ox = (Math.random() - 0.5) * 140, oy = -30 - Math.random() * 90;
      var an = im.animate([
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: 'translate(' + ox + 'px,' + oy + 'px) scale(1.15)', opacity: 1, offset: 0.35 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.75)', opacity: 1 }
      ], { duration: 820, delay: i * 60, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'backwards' });
      an.onfinish = function () {
        im.remove();
        snd('coin');
        if (toEl.isConnected) toEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 220 });
      };
    })(i);
  }
  function addCoins(n, from) {
    S.coins += n; persist();
    var t = coinTarget();
    coinFly(from || [W / 2, H / 2], t, Math.min(10, 3 + Math.round(n / 40)));
    setTimeout(refreshCoins, 700);
  }

  // ---------------- rewarded ads ----------------
  // Hooks for a real ad network, checked in order:
  //   window.SugarAds.showRewarded(cb)  -> call cb(true) when the reward is earned
  //   window.adBreak({type:'reward'})   -> Google H5 Games Ads (Ad Placement API)
  // Without either, a built-in demo ad plays so the flow can be tested end to end.
  var ADS = { reward: 100, perDay: 8, secs: 10 };
  function adsLeft() {
    var d = today();
    if (S.adDay !== d) { S.adDay = d; S.adCount = 0; }
    return Math.max(0, ADS.perDay - S.adCount);
  }
  function refreshAdUI() {
    var left = adsLeft();
    var b = $('#map-ad');
    if (b) b.hidden = left <= 0;
    Array.prototype.forEach.call(document.querySelectorAll('.ad-left'), function (e) { e.textContent = left + '/' + ADS.perDay + ' left today'; });
    Array.prototype.forEach.call(document.querySelectorAll('.ad-btn'), function (e) { e.disabled = left <= 0; });
  }
  function showRewardedAd(onReward) {
    if (adsLeft() <= 0) { toast('No more ads today — come back tomorrow!'); snd('invalid'); return; }
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      applyAudio();
      if (!ok) return;
      S.adCount++; persist();
      refreshAdUI();
      onReward();
    }
    try {
      if (window.SugarAds && typeof window.SugarAds.showRewarded === 'function') { window.SugarAds.showRewarded(function (ok) { finish(!!ok); }); return; }
      if (typeof window.adBreak === 'function') {
        var viewed = false;
        window.adBreak({
          type: 'reward', name: 'free_coins',
          beforeAd: function () { if (window.Snd) Snd.setMusic(false); },
          afterAd: function () { applyAudio(); },
          beforeReward: function (showAdFn) { showAdFn(); },
          adDismissed: function () { toast('Watch the whole ad to earn the reward'); },
          adViewed: function () { viewed = true; },
          adBreakDone: function (info) {
            if (viewed) finish(true);
            else { if (!info || info.breakStatus !== 'dismissed') toast('No ad available right now — try again later'); finish(false); }
          }
        });
        return;
      }
    } catch (e) { console.warn('ad sdk error', e); }
    demoAd(finish);
  }
  function demoAd(finish) {
    var secs = ADS.secs, t = 0, ready = false, paused = false, alive = true, last = performance.now();
    var ov = h('div', 'ad-ov');
    ov.innerHTML = '<canvas class="ad-cv"></canvas>' +
      '<div class="ad-top"><span class="ad-badge">AD</span><span class="ad-timer">Reward in ' + secs + 's</span><button class="ad-x" aria-label="Close ad">✕</button></div>' +
      '<div class="ad-bottom"><button class="btn big ad-claim" hidden>Collect +' + ADS.reward + '</button><div class="ad-bar"><i></i></div></div>';
    app.appendChild(ov);
    if (window.Snd) Snd.setMusic(false);
    var cv = ov.querySelector('.ad-cv'), x = cv.getContext('2d');
    var w = app.clientWidth, hh = app.clientHeight;
    cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(hh * DPR);
    cv.style.width = w + 'px'; cv.style.height = hh + 'px';
    var timer = ov.querySelector('.ad-timer'), bar = ov.querySelector('.ad-bar i'), claim = ov.querySelector('.ad-claim'), xb = ov.querySelector('.ad-x');
    var drops = [];
    for (var i = 0; i < 26; i++) drops.push({ x: Math.random() * w, y: Math.random() * hh, v: 40 + Math.random() * 90, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, c: i % 6, k: ['normal', 'sh', 'wrap', 'normal', 'bomb', 'fish'][i % 6], s: 0.7 + Math.random() * 0.7 });
    var mascot = new Image(); mascot.src = IC.mascot();
    var star = new Image(); star.src = IC.star();
    function close(ok) {
      if (!alive) return;
      alive = false;
      ov.classList.add('out');
      setTimeout(function () { ov.remove(); }, 250);
      finish(ok);
    }
    xb.onclick = function () {
      snd('tap');
      if (ready) { close(true); return; }
      paused = true;
      var cf = h('div', 'ad-confirm', '<div class="box"><b>Close this ad?</b><p>You will lose your reward.</p></div>');
      var row = h('div', 'p-row');
      row.appendChild(btn('Keep Watching', 'small', function () { cf.remove(); paused = false; last = performance.now(); }));
      row.appendChild(btn('Close Ad', 'pink small', function () { cf.remove(); close(false); }));
      cf.querySelector('.box').appendChild(row);
      ov.appendChild(cf);
    };
    claim.onclick = function () { snd('tap'); close(true); };
    function frame(now) {
      if (!alive) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!paused && !document.hidden) t += dt;
      if (!ready && t >= secs) {
        ready = true;
        timer.textContent = 'Reward earned!';
        xb.classList.add('ready');
        claim.hidden = false;
        snd('star', { i: 2 });
      } else if (!ready) timer.textContent = 'Reward in ' + Math.max(1, Math.ceil(secs - t)) + 's';
      bar.style.width = Math.min(100, t / secs * 100) + '%';
      // in-house promo creative
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      var g = x.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, '#ff8cc4'); g.addColorStop(0.55, '#b04dff'); g.addColorStop(1, '#4b1f9e');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
      x.save(); x.translate(w / 2, hh * 0.36); x.rotate(now / 4000); x.globalAlpha = 0.14; x.fillStyle = '#fff';
      for (var k = 0; k < 14; k++) { x.rotate(TAU / 14); x.beginPath(); x.moveTo(0, 0); x.lineTo(hh, -hh * 0.09); x.lineTo(hh, hh * 0.09); x.fill(); }
      x.restore();
      var cs = Math.round(Math.min(w, hh) * 0.11);
      drops.forEach(function (d) {
        d.y += d.v * dt; d.r += d.vr * dt;
        if (d.y > hh + 40) { d.y = -40; d.x = Math.random() * w; }
        var img = SB.candyImg(d.c, d.k, null, cs), sz = cs * 1.3 * d.s;
        x.save(); x.globalAlpha = 0.85; x.translate(d.x, d.y); x.rotate(d.r); x.drawImage(img, -sz / 2, -sz / 2, sz, sz); x.restore();
      });
      var fs = Math.min(w * 0.19, 88), cy = hh * 0.34;
      x.save(); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.font = '900 ' + fs + 'px "Arial Rounded MT Bold","PingFang SC",sans-serif';
      var sc = 1 + Math.sin(now / 300) * 0.03;
      x.translate(w / 2, cy); x.scale(sc, sc);
      ['Sugar', 'Burst'].forEach(function (word, j) {
        var yy = (j - 0.5) * fs * 0.95;
        x.lineWidth = fs * 0.22; x.strokeStyle = '#5a1040'; x.strokeText(word, 0, yy);
        var tg = x.createLinearGradient(0, yy - fs / 2, 0, yy + fs / 2);
        tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#ffd6ec'); tg.addColorStop(1, '#ff5fa2');
        x.fillStyle = tg; x.fillText(word, 0, yy);
      });
      x.restore();
      var ms = Math.min(w, hh) * 0.26, bob = Math.abs(Math.sin(now / 280)) * 16;
      if (mascot.complete) x.drawImage(mascot, w / 2 - ms / 2, hh * 0.56 - ms / 2 - bob, ms, ms);
      x.save(); x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 ' + Math.round(fs * 0.3) + 'px "Arial Rounded MT Bold",sans-serif';
      x.shadowColor = 'rgba(60,0,60,.5)'; x.shadowBlur = 6; x.shadowOffsetY = 2;
      x.fillText('Swap · Match · Blast!', w / 2, hh * 0.72);
      x.restore();
      if (star.complete) for (k = 0; k < 5; k++) x.drawImage(star, w / 2 - 70 + k * 28, hh * 0.76, 24, 24);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function adButton(label, cls, onDone) {
    var b = btn(SVG.play + label, 'ad-btn ' + (cls || 'purple small'), function () {
      showRewardedAd(function () {
        addCoins(ADS.reward, centerOf(b));
        toast('+' + ADS.reward + ' coins!');
        if (onDone) onDone();
      });
    });
    b.disabled = adsLeft() <= 0;
    return b;
  }

  function shop() {
    modal(function (p) {
      p.appendChild(balLine());
      p.appendChild(h('div', 'shop-h', 'FREE COINS'));
      var free = h('div', 'free-grid');
      var daily = h('div', 'free-card', '<img class="ic" src="' + IC.coin() + '"><div class="t">Daily Bonus</div><div class="v">+300</div><div class="s">Once a day</div>');
      var claimed = S.daily === today();
      var db = btn(claimed ? 'Claimed' : 'Claim', 'pink small', function () {
        if (S.daily === today()) return;
        S.daily = today();
        addCoins(300, centerOf(db));
        db.textContent = 'Claimed'; db.disabled = true;
        toast('You got 300 coins!');
      });
      db.disabled = claimed;
      daily.appendChild(db);
      var ad = h('div', 'free-card ad', '<div class="ic play-bubble">' + SVG.play + '</div><div class="t">Watch an Ad</div><div class="v">+' + ADS.reward + '</div><div class="s ad-left"></div>');
      ad.appendChild(adButton('Watch', 'purple small', refreshShopRows));
      free.appendChild(daily); free.appendChild(ad);
      p.appendChild(free);
      var rows = [];
      function section(title, list, isPre) {
        p.appendChild(h('div', 'shop-h', title));
        list.forEach(function (it) {
          var r = h('div', 'shop-row');
          r.innerHTML = '<div class="ic-wrap"><img src="' + IC.booster(isPre ? it.icon : it.id) + '"><span class="own"></span></div><div class="info"><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div></div>';
          var b = btn('<img class="coin-ic" src="' + IC.coin() + '">' + it.price, 'orange small', function () {
            if (S.coins < it.price) { toast('Not enough coins — watch an ad for free coins!'); snd('invalid'); return; }
            S.coins -= it.price;
            if (isPre) S.pre[it.id] = (S.pre[it.id] || 0) + 1; else S.boosters[it.id] = (S.boosters[it.id] || 0) + 1;
            persist(); snd('coin'); refreshCoins(); refreshShopRows();
            r.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 220 });
          });
          r.appendChild(b);
          p.appendChild(r);
          rows.push({ it: it, isPre: isPre, own: r.querySelector('.own'), b: b });
        });
      }
      section('BOOSTERS', BOOSTERS, false);
      section('PRE-LEVEL BOOSTERS', PRES, true);
      function refreshShopRows() {
        rows.forEach(function (x) {
          x.own.textContent = (x.isPre ? S.pre[x.it.id] : S.boosters[x.it.id]) || 0;
          x.b.classList.toggle('poor', S.coins < x.it.price);
        });
      }
      refreshShopRows();
      setTimeout(refreshAdUI, 0);
      shop.refresh = refreshShopRows;
    }, { ribbon: 'Candy Shop', ribbonCls: 'purple', cls: 'shop' });
  }

  // ---------------- layout ----------------
  function measureHud() {
    var top = $('.hud-top'), bot = $('.hud-bottom');
    var th = top.offsetHeight || 130, bh = bot.offsetHeight || 84;
    board.resize(W, H, th + 4, bh + 6);
  }
  function resize() {
    W = app.clientWidth; H = app.clientHeight;
    var tc = $('#title-canvas');
    tc.width = Math.ceil(W * DPR); tc.height = Math.ceil(H * DPR);
    tc.style.width = W + 'px'; tc.style.height = H + 'px';
    if (board) {
      if (cur === 'game') measureHud(); else board.resize(W, H, 130, 84);
    }
    if (cur === 'map' && MAP.built && MAP.w !== ($('#map-scroll').clientWidth || W)) buildMap();
  }

  // ---------------- boot ----------------
  function boot() {
    var bar = $('#load-bar i'), pct = $('#load-pct');
    W = app.clientWidth; H = app.clientHeight;
    Assets.load(function (p) {
      bar.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.round(p * 100) + '%';
    }).then(function () {
      pct.textContent = '100%';
      setTimeout(start, 250);
    }).catch(function (e) {
      console.error(e);
      $('#load-msg').textContent = location.protocol === 'file:'
        ? 'Open the game through a web server (for example: npm run dev). Browsers block loading game files straight from disk.'
        : 'Could not load the game files. Check your connection and reload the page.';
      $('#load-msg').hidden = false;
    });
  }
  function start() {
    board = new SB.Board($('#board'), $('#fx'), UI);
    $('#btn-pause').innerHTML = SVG.pause;
    $('#btn-pause').onclick = function () { snd('tap'); pauseMenu(); };
    $('#btn-set').innerHTML = SVG.gear;
    $('#btn-set').onclick = function () { if (window.Snd) Snd.unlock(); snd('tap'); settings(); };
    $('#pill-coins img').src = IC.coin();
    $('#pill-stars img').src = IC.star();
    $('#pill-coins').onclick = function () { if (window.Snd) Snd.unlock(); snd('tap'); shop(); };
    $('#map-ad').innerHTML = SVG.play + '<span><img src="' + IC.coin() + '">+' + ADS.reward + '</span>';
    $('#map-ad').onclick = function () {
      if (window.Snd) Snd.unlock();
      snd('tap');
      var from = centerOf($('#map-ad'));
      showRewardedAd(function () { addCoins(ADS.reward, from); toast('+' + ADS.reward + ' coins!'); });
    };
    $('#hand').src = Assets.url('ui/hand');
    initTitle();
    resize();
    applyAudio();
    window.addEventListener('resize', function () { resize(); });
    document.addEventListener('pointerdown', function () { if (window.Snd) Snd.unlock(); }, true);
    document.addEventListener('touchend', function () { if (window.Snd) Snd.unlock(); }, true);
    // favicon
    try {
      var fav = document.createElement('link'); fav.rel = 'icon'; fav.href = Assets.url('candy/red_normal');
      document.head.appendChild(fav);
    } catch (e) {}
    var last = performance.now();
    function frame(t) {
      var dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      if (cur === 'game') { board.update(dt); board.draw(); }
      else if (cur === 'title') drawTitle(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // debug hooks
    window.SUGAR = { S: S, start: startLevel, board: function () { return board; }, game: function () { return game; }, show: show, levelPopup: levelPopup, unlockAll: function () { S.unlocked = Levels.COUNT; S.fogLevel = Levels.COUNT; persist(); buildMap(); }, reveal: revealProgress, shop: shop, ad: showRewardedAd };
    show('title');
    window.SUGAR.ready = true;
    var q = location.hash.match(/level=(\d+)/);
    if (q) { show('map'); startLevel(+q[1]); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
