/* Sugar Burst — canvas renderer, effects & phase playback */
(function () {
  'use strict';
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var TAU = Math.PI * 2;
  var COLORS = [
    { base: '#ff3b5c', light: '#ffa3b5', dark: '#b0002a', glow: '#ff6b86' },
    { base: '#ff8a1f', light: '#ffc98a', dark: '#c04a00', glow: '#ffab5c' },
    { base: '#ffd21f', light: '#fff3a0', dark: '#c28e00', glow: '#ffe46b' },
    { base: '#34d058', light: '#adf7bd', dark: '#11823a', glow: '#6be38a' },
    { base: '#2fa8ff', light: '#a8dcff', dark: '#0a5cc0', glow: '#6cc4ff' },
    { base: '#b04dff', light: '#dfb3ff', dark: '#6614b3', glow: '#c985ff' }
  ];
  var RAINBOW = COLORS.map(function (c) { return c.glow; });
  function colGlow(color) { return color >= 0 ? COLORS[color].glow : color === -2 ? '#ff7ac8' : color === -3 ? '#bdf3ff' : '#ffe98a'; }
  function colBase(color) { return color >= 0 ? COLORS[color].base : color === -2 ? '#ff4fa8' : color === -3 ? '#7fe0ff' : '#ffc21f'; }
  function colLight(color) { return color >= 0 ? COLORS[color].light : '#fff6c0'; }

  var E = {
    lin: function (t) { return t; },
    outQ: function (t) { return 1 - (1 - t) * (1 - t); },
    inQ: function (t) { return t * t; },
    io: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    outBack: function (t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1; }
  };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------------- sprite cache ----------------
  var Cache = {
    map: {},
    get: function (key, box, draw) {
      var k = key + '@' + box;
      var c = this.map[k];
      if (c) return c;
      c = document.createElement('canvas');
      var px = Math.max(2, Math.ceil(box * DPR));
      c.width = c.height = px;
      var x = c.getContext('2d');
      x.translate(px / 2, px / 2);
      x.scale(DPR, DPR);
      try { draw(x, box); } catch (e) { console.warn('draw fail', key, e); }
      this.map[k] = c;
      return c;
    },
    clear: function () { this.map = {}; }
  };
  function fallbackCandy(x, color, kind, s) {
    x.fillStyle = color >= 0 ? COLORS[color].base : '#6b3a1f';
    x.beginPath(); x.arc(0, 0, s * 0.4, 0, TAU); x.fill();
  }
  // ---------------- image assets (assets/images, loaded by assets.js) ----------------
  var COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  var KIND_FILE = { normal: 'normal', sh: 'stripe_h', sv: 'stripe_v', wrap: 'wrapped', fish: 'fish' };
  function candyKey(color, kind) {
    if (kind === 'bomb') return 'candy/color_bomb';
    if (kind === 'cherry') return 'candy/cherry';
    if (kind === 'nut') return 'candy/hazelnut';
    return 'candy/' + COLOR_NAMES[color] + '_' + (KIND_FILE[kind] || 'normal');
  }
  // draws an image asset centred at (0,0) in a size x size square; false if it is missing
  function drawAsset(x, key, size) {
    var im = window.Assets && Assets.img(key);
    if (!im) return false;
    x.drawImage(im, -size / 2, -size / 2, size, size);
    return true;
  }
  function candyImg(color, kind, ingr, cs) {
    var box = Math.round(cs * 1.3);
    var k = kind === 'ingr' ? ingr : kind;
    return Cache.get('c' + color + k, box, function (x) {
      if (!drawAsset(x, candyKey(color, k), cs)) fallbackCandy(x, color, k, cs);
    });
  }
  function glowImg(hex) {
    return Cache.get('glow' + hex, 64, function (x) {
      var g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, hex);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(-32, -32, 64, 64);
    });
  }
  function sparkImg(hex) {
    return Cache.get('spark' + hex, 48, function (x) {
      var g = x.createRadialGradient(0, 0, 0, 0, 0, 20);
      g.addColorStop(0, hex); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.8; x.fillStyle = g; x.fillRect(-24, -24, 48, 48);
      x.globalAlpha = 1; x.fillStyle = '#fff';
      x.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4, r = i % 2 ? 3.2 : 20;
        x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.closePath(); x.fill();
    });
  }

  // ---------------- particles ----------------
  function FX() { this.ps = []; }
  FX.prototype.add = function (p) {
    if (this.ps.length > 1100) this.ps.splice(0, 100);
    p.t = 0;
    p.life = p.life || 0.6;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.g = p.g || 0; p.rot = p.rot || 0; p.vr = p.vr || 0;
    p.s = p.s == null ? 1 : p.s;
    this.ps.push(p);
    return p;
  };
  FX.prototype.update = function (dt) {
    var ps = this.ps, j = 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { if (p.done) p.done(); continue; }
      if (p.drag) { var d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.upd) p.upd(p, dt);
      ps[j++] = p;
    }
    ps.length = j;
  };
  FX.prototype.draw = function (x) {
    var ps = this.ps;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], k = p.t / p.life, a = p.fade === false ? 1 : 1 - k * k;
      switch (p.type) {
        case 'shard':
          x.save(); x.globalAlpha = a; x.translate(p.x, p.y); x.rotate(p.rot); x.scale(p.s, p.s);
          x.fillStyle = p.color; x.beginPath(); x.moveTo(0, -p.r); x.lineTo(p.r * 0.8, p.r * 0.5); x.lineTo(-p.r * 0.7, p.r * 0.6); x.closePath(); x.fill();
          x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc(-p.r * 0.1, -p.r * 0.2, p.r * 0.22, 0, TAU); x.fill();
          x.restore();
          break;
        case 'dot':
          x.globalAlpha = a; x.fillStyle = p.color; x.beginPath(); x.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU); x.fill(); x.globalAlpha = 1;
          break;
        case 'drop':
          x.globalAlpha = a; x.fillStyle = p.color; x.beginPath(); x.arc(p.x, p.y, p.r, 0, TAU); x.fill();
          x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.3, 0, TAU); x.fill(); x.globalAlpha = 1;
          break;
        case 'chunk':
          x.save(); x.globalAlpha = a; x.translate(p.x, p.y); x.rotate(p.rot);
          x.fillStyle = p.color || '#fff'; x.strokeStyle = 'rgba(200,120,170,.8)'; x.lineWidth = 1.5;
          x.beginPath(); x.rect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4); x.fill(); x.stroke(); x.restore();
          break;
        case 'spark':
          var img = sparkImg(p.color || '#fff');
          var sz = p.r * 2 * p.s * (p.pulse ? (0.6 + 0.4 * Math.sin(p.t * 20)) : (1 - k * 0.6));
          x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = a; x.translate(p.x, p.y); x.rotate(p.rot);
          x.drawImage(img, -sz / 2, -sz / 2, sz, sz); x.restore();
          break;
        case 'glow':
          var gi = glowImg(p.color || '#fff'), gs = p.r * 2 * (p.grow ? (0.5 + k * p.grow) : 1);
          x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = a * (p.alpha || 1);
          x.drawImage(gi, p.x - gs / 2, p.y - gs / 2, gs, gs); x.restore();
          break;
        case 'ring':
          var rr = p.r0 + (p.r1 - p.r0) * E.outQ(k);
          x.save(); x.globalAlpha = 1 - k; x.strokeStyle = p.color; x.lineWidth = Math.max(0.5, p.w * (1 - k));
          if (p.glow) { x.shadowColor = p.color; x.shadowBlur = 12; }
          x.beginPath(); x.arc(p.x, p.y, rr, 0, TAU); x.stroke(); x.restore();
          break;
        case 'bubble':
          x.globalAlpha = a * 0.9; x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(p.x, p.y, p.r * (0.6 + k * 0.6), 0, TAU); x.stroke(); x.globalAlpha = 1;
          break;
        case 'confetti':
          x.save(); x.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1; x.translate(p.x, p.y); x.rotate(p.rot);
          x.scale(Math.cos(p.t * p.flip), 1); x.fillStyle = p.color; x.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); x.restore();
          break;
        case 'text':
          var ts = p.size * (k < 0.15 ? E.outBack(k / 0.15) : 1);
          x.save(); x.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1; x.font = '900 ' + ts + 'px ' + FONT;
          x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
          x.lineWidth = Math.max(3, ts * 0.2); x.strokeStyle = p.stroke || '#5a1740'; x.strokeText(p.text, p.x, p.y);
          x.fillStyle = p.color; x.fillText(p.text, p.x, p.y); x.restore();
          break;
        case 'img':
          x.save(); x.globalAlpha = a; x.translate(p.x, p.y); x.rotate(p.rot); var is = p.size * p.s;
          x.drawImage(p.img, -is / 2, -is / 2, is, is); x.restore();
          break;
      }
    }
    x.globalAlpha = 1;
  };
  var FONT = '"Arial Rounded MT Bold","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  // ---------------- background ----------------
  var Bg = {
    cache: null, w: 0, h: 0, bubbles: [],
    build: function (w, h) {
      this.w = w; this.h = h;
      var c = document.createElement('canvas');
      c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
      var x = c.getContext('2d');
      x.scale(DPR, DPR);
      var im = window.Assets && Assets.img('bg/game');
      if (im) {
        var k = Math.max(w / im.width, h / im.height), dw = im.width * k, dh = im.height * k;
        x.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        var g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#8ad6ff'); g.addColorStop(0.6, '#ffd6ee'); g.addColorStop(1, '#ffb5d8');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }
      var i;
      this.cache = c;
      this.bubbles = [];
      for (i = 0; i < 18; i++) this.bubbles.push({ x: Math.random() * w, y: Math.random() * h, r: rnd(4, 14), v: rnd(8, 22), ph: Math.random() * 10, c: RAINBOW[i % 6] });
    },
    draw: function (x, now, dt) {
      if (!this.cache) return;
      x.drawImage(this.cache, 0, 0, this.w, this.h);
      var bs = this.bubbles;
      x.save();
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        b.y -= b.v * dt;
        if (b.y < -20) { b.y = this.h + 20; b.x = Math.random() * this.w; }
        var bx = b.x + Math.sin(now / 1000 + b.ph) * 12;
        x.globalAlpha = 0.35;
        x.fillStyle = b.c; x.beginPath(); x.arc(bx, b.y, b.r, 0, TAU); x.fill();
        x.globalAlpha = 0.6; x.fillStyle = '#fff'; x.beginPath(); x.arc(bx - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, TAU); x.fill();
      }
      x.restore();
    }
  };

  // ---------------- Board ----------------
  var WORDS = ['Yummy!', 'Awesome!', 'Fantastic!', 'Unbelievable!'];

  function Board(canvas, fxCanvas, ui) {
    this.cv = canvas; this.x = canvas.getContext('2d');
    this.fxcv = fxCanvas; this.fx2 = fxCanvas.getContext('2d');
    this.ui = ui;
    this.fx = new FX();      // board-level particles
    this.top = new FX();     // overlay particles (above HUD)
    this.effects = [];       // custom effect objects {upd(dt)->bool alive, draw(x)}
    this.topEffects = [];
    this.sprites = {};
    this.tweens = [];
    this.timeline = [];
    this.now = 0;
    this.shakeP = 0; this.shakeX = 0; this.shakeY = 0;
    this.sel = null; this.hint = null; this.idle = 0;
    this.busy = true;
    this.mode = null;
    this.flights = 0;
    this.speed = 1;
    this.g = null;
    this.W = 0; this.H = 0;
    this.active = false;
    this.lastSound = {};
    this.bindInput();
  }
  var B = Board.prototype;

  B.resize = function (W, H, topH, botH) {
    this.W = W; this.H = H; this.topH = topH; this.botH = botH;
    [this.cv, this.fxcv].forEach(function (c) {
      c.width = Math.ceil(W * DPR); c.height = Math.ceil(H * DPR);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    });
    Bg.build(W, H);
    if (this.g) this.layoutBoard();
  };
  B.layoutBoard = function () {
    var g = this.g, W = this.W, H = this.H;
    var availH = H - this.topH - this.botH - 16, availW = W - 18;
    var cs = Math.floor(Math.min(availW / g.cols, availH / g.rows, 76));
    if (cs !== this.cs) Cache.clear();
    this.cs = cs;
    this.ox = Math.round((W - cs * g.cols) / 2);
    this.oy = Math.round(this.topH + 8 + (availH - cs * g.rows) * 0.4);
    this.buildTray();
  };
  B.cx = function (c) { return this.ox + (c + 0.5) * this.cs; };
  B.cy = function (r) { return this.oy + (r + 0.5) * this.cs; };

  B.buildTray = function () {
    var g = this.g, cs = this.cs;
    var m = Math.round(cs * 0.16);
    var w = g.cols * cs + m * 2, h = g.rows * cs + m * 2;
    var c = document.createElement('canvas');
    c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
    var x = c.getContext('2d');
    x.scale(DPR, DPR); x.translate(m, m);
    var cells = [];
    for (var r = 0; r < g.rows; r++) for (var cc = 0; cc < g.cols; cc++) if (g.cells[r][cc].v) cells.push([r, cc]);
    function rr(e, rad) {
      x.beginPath();
      cells.forEach(function (p) { roundRect(x, p[1] * cs - e, p[0] * cs - e, cs + e * 2, cs + e * 2, rad); });
    }
    x.save(); x.shadowColor = 'rgba(90,20,80,.35)'; x.shadowBlur = m; x.shadowOffsetY = m * 0.4;
    x.fillStyle = '#fff'; rr(m * 0.9, m * 1.2); x.fill(); x.restore();
    x.fillStyle = '#ffc2dd'; rr(m * 0.55, m); x.fill();
    x.fillStyle = '#5b2a8c'; rr(m * 0.28, m * 0.7); x.fill();
    cells.forEach(function (p) {
      x.fillStyle = (p[0] + p[1]) % 2 ? 'rgba(122,72,196,.94)' : 'rgba(104,56,176,.94)';
      x.fillRect(p[1] * cs, p[0] * cs, cs, cs);
    });
    // inner soft light
    x.globalCompositeOperation = 'source-atop';
    var lg = x.createLinearGradient(0, 0, 0, g.rows * cs);
    lg.addColorStop(0, 'rgba(255,255,255,.12)'); lg.addColorStop(1, 'rgba(0,0,0,.12)');
    x.fillStyle = lg; x.fillRect(-m, -m, w, h);
    this.tray = c; this.trayM = m; this.trayW = w; this.trayH = h;
    // clip path of valid cells (for falling candies)
    var clip = new Path2D();
    var ox = this.ox, oy = this.oy;
    cells.forEach(function (p) { clip.rect(ox + p[1] * cs - 1, oy + p[0] * cs - 1, cs + 2, cs + 2); });
    this.clip = clip;
  };
  function roundRect(x, X, Y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }

  // ---------------- level load ----------------
  B.load = function (game) {
    this.g = game;
    this.sprites = {}; this.tweens = []; this.timeline = []; this.effects = [];
    this.fx.ps = []; this.sel = null; this.hint = null; this.mode = null; this.idle = 0;
    this.flights = 0; this.keyFlights = {};
    this.layoutBoard();
    var vc = [];
    for (var r = 0; r < game.rows; r++) {
      var row = [];
      for (var c = 0; c < game.cols; c++) {
        var cl = game.cells[r][c];
        row.push({ v: cl.v, jelly: cl.jelly, frost: cl.frost, lock: cl.lock, jw: 0, fw: 0 });
      }
      vc.push(row);
    }
    this.vc = vc;
    var self = this, pending = 0;
    return new Promise(function (res) {
      for (r = 0; r < game.rows; r++) for (c = 0; c < game.cols; c++) {
        var cd = game.cells[r][c].candy;
        if (!cd) continue;
        var sp = self.addSprite(cd, r - game.rows - 1.5 - Math.random() * 0.4, c);
        sp.path = [[r, c]]; sp.v = 3; sp.delay = c * 0.035 + (game.rows - r) * 0.025; sp.intro = true;
        pending++;
        sp.onLand = function () { if (--pending === 0) res(); };
      }
      if (!pending) res();
    });
  };
  B.addSprite = function (cd, r, c) {
    var sp = { id: cd.id, color: cd.color, kind: cd.kind, ingr: cd.ingr, x: c, y: r, s: 1, sx: 1, sy: 1, rot: 0, a: 1, primed: !!cd.primed, big: cd.radius === 2 };
    this.sprites[cd.id] = sp;
    return sp;
  };

  // ---------------- tweens & timeline ----------------
  B.tween = function (o, to, dur, ease) {
    var self = this;
    return new Promise(function (res) {
      var from = {};
      for (var k in to) from[k] = o[k];
      self.tweens.push({ o: o, from: from, to: to, t0: self.now, dur: Math.max(1, dur), ease: ease || E.io, res: res });
    });
  };
  B.after = function (ms, fn) {
    var t = this.now + ms, tl = this.timeline, i = tl.length;
    while (i > 0 && tl[i - 1].t > t) i--;
    tl.splice(i, 0, { t: t, fn: fn });
  };
  B.wait = function (ms) { var self = this; return new Promise(function (res) { self.after(ms, res); }); };

  // ---------------- main loop ----------------
  B.update = function (dt) {
    this.now += dt * 1000;
    var now = this.now;
    // timeline
    while (this.timeline.length && this.timeline[0].t <= now) {
      var it = this.timeline.shift();
      try { it.fn(); } catch (e) { console.error(e); }
    }
    // tweens
    var tw = this.tweens, j = 0;
    for (var i = 0; i < tw.length; i++) {
      var t = tw[i], k = clamp((now - t.t0) / t.dur, 0, 1), e = t.ease(k);
      for (var key in t.to) t.o[key] = t.from[key] + (t.to[key] - t.from[key]) * e;
      if (k >= 1) { t.res(); continue; }
      tw[j++] = t;
    }
    tw.length = j;
    // falling sprites
    for (var id in this.sprites) {
      var sp = this.sprites[id];
      if (sp.path) {
        if (sp.delay > 0) { sp.delay -= dt; continue; }
        sp.v = Math.min(sp.v + 42 * dt, 15);
        var d = sp.v * dt;
        while (d > 0 && sp.path.length) {
          var p = sp.path[0], dx = p[1] - sp.x, dy = p[0] - sp.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= d) { sp.x = p[1]; sp.y = p[0]; d -= dist; sp.path.shift(); }
          else { sp.x += dx / dist * d; sp.y += dy / dist * d; d = 0; }
        }
        if (!sp.path.length) {
          sp.path = null;
          var impact = clamp(sp.v / 15, 0.3, 1);
          sp.sx = 1 + 0.2 * impact; sp.sy = 1 - 0.22 * impact;
          this.tween(sp, { sx: 1, sy: 1 }, 260, E.outElastic);
          if (!sp.intro) this.sfx('land', {}, 30);
          sp.intro = false;
          var cb = sp.onLand; sp.onLand = null;
          if (cb) cb();
        }
      }
    }
    // shake
    if (this.shakeP > 0.2) {
      this.shakeP *= Math.pow(0.001, dt);
      this.shakeX = (Math.random() * 2 - 1) * this.shakeP;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeP;
    } else { this.shakeP = 0; this.shakeX = this.shakeY = 0; }
    this.fx.update(dt);
    this.top.update(dt);
    this.effects = this.effects.filter(function (ef) { return ef.upd(dt); });
    this.topEffects = this.topEffects.filter(function (ef) { return ef.upd(dt); });
    // idle hint
    if (this.active && !this.busy && this.g && this.g.state === 'play' && !this.mode) {
      this.idle += dt;
      if (this.idle > 5.5 && !this.hint) {
        this.hint = this.g.findHint();
        if (this.hint && this.ui.onHint) this.ui.onHint(this.hint);
      }
    }
    // cell anim timers
    if (this.vc) for (var r = 0; r < this.vc.length; r++) for (var c = 0; c < this.vc[r].length; c++) {
      var vcell = this.vc[r][c];
      if (vcell.jw > 0) vcell.jw = Math.max(0, vcell.jw - dt);
      if (vcell.fw > 0) vcell.fw = Math.max(0, vcell.fw - dt);
    }
  };

  B.draw = function () {
    var x = this.x, W = this.W, H = this.H, now = this.now;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    Bg.draw(x, now, 1 / 60);
    if (!this.g) return;
    var cs = this.cs;
    x.save();
    x.translate(this.shakeX, this.shakeY);
    // tray
    x.drawImage(this.tray, this.ox - this.trayM, this.oy - this.trayM, this.trayW, this.trayH);
    var g = this.g, vc = this.vc, r, c, v;
    // jelly
    for (r = 0; r < g.rows; r++) for (c = 0; c < g.cols; c++) {
      v = vc[r][c];
      if (!v.v || !v.jelly) continue;
      var jimg = Cache.get('jelly' + v.jelly, cs, function (xx, s) { drawAsset(xx, 'blocker/jelly_' + v.jelly, s); });
      var wob = v.jw > 0 ? 1 + Math.sin(v.jw * 40) * v.jw * 0.5 : 1;
      x.save(); x.translate(this.cx(c), this.cy(r)); x.scale(wob, 2 - wob);
      x.drawImage(jimg, -cs / 2, -cs / 2, cs, cs); x.restore();
    }
    // selection glow
    if (this.sel) {
      var sx = this.cx(this.sel[1]), sy = this.cy(this.sel[0]);
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.55 + 0.25 * Math.sin(now / 120);
      var gi = glowImg('#fff4a8'); x.drawImage(gi, sx - cs * 0.9, sy - cs * 0.9, cs * 1.8, cs * 1.8); x.restore();
      x.save(); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 3; x.setLineDash([6, 5]); x.lineDashOffset = -now / 40;
      x.beginPath(); roundRect(x, sx - cs * 0.47, sy - cs * 0.47, cs * 0.94, cs * 0.94, cs * 0.2); x.stroke(); x.restore();
    }
    // candies
    var falling = [], box = cs * 1.3;
    for (var id in this.sprites) {
      var sp = this.sprites[id];
      if (sp.path || sp.y < -0.4) { falling.push(sp); continue; }
      this.drawSprite(x, sp, box, now);
    }
    if (falling.length) {
      x.save(); x.clip(this.clip);
      for (var i = 0; i < falling.length; i++) this.drawSprite(x, falling[i], box, now);
      x.restore();
    }
    // frost & locks
    for (r = 0; r < g.rows; r++) for (c = 0; c < g.cols; c++) {
      v = vc[r][c];
      if (!v.v) continue;
      if (v.frost) {
        var hp = v.frost;
        var fimg = Cache.get('frost' + hp, cs, function (xx, s) { if (!drawAsset(xx, 'blocker/frost_' + hp, s)) { xx.fillStyle = '#fff'; xx.fillRect(-s / 2, -s / 2, s, s); } });
        var fw = v.fw > 0 ? 1 + Math.sin(v.fw * 50) * v.fw * 0.4 : 1;
        x.save(); x.translate(this.cx(c), this.cy(r)); x.scale(fw, fw); x.drawImage(fimg, -cs / 2, -cs / 2, cs, cs); x.restore();
      }
      if (v.lock) {
        var limg = Cache.get('lock', cs, function (xx, s) { drawAsset(xx, 'blocker/lock', s); });
        x.drawImage(limg, this.cx(c) - cs / 2, this.cy(r) - cs / 2, cs, cs);
      }
    }
    // effects & particles
    for (i = 0; i < this.effects.length; i++) this.effects[i].draw(x);
    this.fx.draw(x);
    x.restore();
    // overlay canvas
    var y = this.fx2;
    y.setTransform(DPR, 0, 0, DPR, 0, 0);
    y.clearRect(0, 0, W, H);
    for (i = 0; i < this.topEffects.length; i++) this.topEffects[i].draw(y);
    this.top.draw(y);
  };

  B.drawSprite = function (x, sp, box, now) {
    if (sp.a <= 0.01 || sp.hidden) return;
    var cs = this.cs;
    var px = this.ox + (sp.x + 0.5) * cs, py = this.oy + (sp.y + 0.5) * cs;
    var s = sp.s, sx = sp.sx, sy = sp.sy, rot = sp.rot;
    var isSel = this.sel && !sp.path && this.sel[0] === Math.round(sp.y) && this.sel[1] === Math.round(sp.x);
    if (isSel) { var pz = 1.08 + Math.sin(now / 110) * 0.05; s *= pz; }
    if (this.hint && !this.busy) {
      for (var h = 0; h < 2; h++) {
        var hp = this.hint[h];
        if (hp[0] === Math.round(sp.y) && hp[1] === Math.round(sp.x) && !sp.path) {
          rot += Math.sin(now / 70) * 0.16 * (Math.sin(now / 600) > 0 ? 1 : 0.2);
          s *= 1.05;
        }
      }
    }
    if (sp.kind === 'wrap' && !sp.primed) s *= 1 + Math.sin(now / 260 + sp.id) * 0.035;
    if (sp.kind === 'fish') rot += Math.sin(now / 200 + sp.id) * 0.08;
    if (sp.primed) {
      s *= (sp.big ? 1.25 : 1.08) + Math.sin(now / 50) * 0.07;
      px += Math.sin(now / 23) * 1.5;
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.55 + 0.3 * Math.sin(now / 60);
      var gi = glowImg(colGlow(sp.color)); var gs = cs * (sp.big ? 2.6 : 1.9);
      x.drawImage(gi, px - gs / 2, py - gs / 2, gs, gs); x.restore();
    }
    if (sp.kind === 'bomb') {
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.35 + 0.15 * Math.sin(now / 200);
      var bi = glowImg(RAINBOW[Math.floor(now / 300 + sp.id) % 6]); x.drawImage(bi, px - cs * 0.8, py - cs * 0.8, cs * 1.6, cs * 1.6); x.restore();
    }
    var img = candyImg(sp.color, sp.kind, sp.ingr, cs);
    x.save();
    x.globalAlpha = sp.a;
    x.translate(px, py + (1 - sy) * cs * 0.3);
    if (rot) x.rotate(rot);
    x.scale(s * sx, s * sy);
    x.drawImage(img, -box / 2, -box / 2, box, box);
    if (sp.flash > 0) {
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = sp.flash;
      x.drawImage(img, -box / 2, -box / 2, box, box);
    }
    x.restore();
    // specials shimmer
    if ((sp.kind === 'sh' || sp.kind === 'sv' || sp.kind === 'bomb') && sp.a > 0.9 && !sp.path) {
      var ph = ((now / 900 + sp.id * 0.37) % 1.6);
      if (ph < 1) {
        var gx = px + (ph - 0.5) * cs * 0.7, gy = py - (ph - 0.5) * cs * 0.5;
        x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
        var sk = sparkImg('#ffffff'); var ss = cs * 0.42; x.translate(gx, gy); x.rotate(now / 400);
        x.drawImage(sk, -ss / 2, -ss / 2, ss, ss); x.restore();
      }
    }
  };

  // ---------------- sound helper ----------------
  B.sfx = function (name, opts, gapMs) {
    if (!window.Snd) return;
    if (gapMs) {
      var last = this.lastSound[name] || -1e9;
      if (this.now - last < gapMs) return;
      this.lastSound[name] = this.now;
    }
    try { Snd.play(name, opts || {}); } catch (e) {}
  };
  B.shake = function (p) { this.shakeP = Math.max(this.shakeP, p); };
  B.vibrate = function (ms) { if (this.ui.vibrate && this.ui.vibrate()) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------------- input ----------------
  B.bindInput = function () {
    var self = this, cv = this.cv, down = null;
    function pos(e) {
      var rc = cv.getBoundingClientRect();
      return [e.clientX - rc.left, e.clientY - rc.top];
    }
    function cellAt(p) {
      if (!self.g) return null;
      var c = Math.floor((p[0] - self.ox) / self.cs), r = Math.floor((p[1] - self.oy) / self.cs);
      if (r < 0 || c < 0 || r >= self.g.rows || c >= self.g.cols || !self.g.cells[r][c].v) return null;
      return [r, c];
    }
    cv.addEventListener('pointerdown', function (e) {
      if (window.Snd) Snd.unlock();
      if (!self.active || self.busy || !self.g || self.g.state !== 'play') return;
      var p = pos(e), cell = cellAt(p);
      self.idle = 0;
      if (self.hint) { self.hint = null; if (self.ui.onHint) self.ui.onHint(null); }
      if (!cell) { self.sel = null; return; }
      if (self.mode === 'hammer' || self.mode === 'wand') { self.ui.boosterCell(self.mode, cell); return; }
      if (self.sel && self.sel[0] === cell[0] && self.sel[1] === cell[1]) { self.sel = null; return; }
      if (self.sel && self.g.adjacent(self.sel, cell)) {
        var a = self.sel; self.sel = null;
        self.ui.requestSwap(a, cell);
        return;
      }
      if (self.g.movable(cell[0], cell[1])) {
        self.sel = cell; self.sfx('select');
        down = { p: p, cell: cell, id: e.pointerId };
        try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      } else {
        self.sel = null;
        self.nudge(cell);
      }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!down || e.pointerId !== down.id || self.busy) return;
      var p = pos(e), dx = p[0] - down.p[0], dy = p[1] - down.p[1];
      var th = self.cs * 0.32;
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      var dir = Math.abs(dx) > Math.abs(dy) ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0];
      var a = down.cell, b = [a[0] + dir[0], a[1] + dir[1]];
      down = null; self.sel = null;
      if (!self.g.cell(b[0], b[1])) return;
      self.ui.requestSwap(a, b);
    });
    function up(e) { if (down && e.pointerId === down.id) down = null; }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  };
  B.nudge = function (cell) {
    var cd = this.g.cells[cell[0]][cell[1]].candy;
    this.vc[cell[0]][cell[1]].fw = 0.25;
    this.vc[cell[0]][cell[1]].jw = 0.2;
    if (cd && this.sprites[cd.id]) {
      var sp = this.sprites[cd.id], self = this;
      this.tween(sp, { rot: 0.25 }, 60).then(function () { return self.tween(sp, { rot: -0.2 }, 90); }).then(function () { return self.tween(sp, { rot: 0 }, 80); });
    }
    this.sfx('invalid', {}, 200);
  };

  // ---------------- phase playback ----------------
  B.play = async function (phases) {
    this.turn = { res: 0, pops: 0, word: -1 };
    for (var i = 0; i < phases.length; i++) {
      var ph = phases[i];
      if (ph.type === 'swap') await this.animSwap(ph);
      else if (ph.type === 'resolve') await this.playResolve(ph);
      else if (ph.type === 'fall') await this.playFall(ph);
      else if (ph.type === 'shuffle') await this.playShuffle(ph);
    }
  };
  B.animSwap = async function (ph) {
    var sa = this.sprites[ph.ida], sb = this.sprites[ph.idb];
    if (!sa || !sb) return;
    this.sfx('swap');
    var A = { x: ph.a[1], y: ph.a[0] }, Bp = { x: ph.b[1], y: ph.b[0] };
    sa.z = 1;
    await Promise.all([this.tween(sa, { x: Bp.x, y: Bp.y, s: 1.12 }, 150, E.io), this.tween(sb, { x: A.x, y: A.y, s: 0.92 }, 150, E.io)]);
    if (!ph.ok) {
      this.sfx('invalid');
      await Promise.all([this.tween(sa, { x: A.x, y: A.y, s: 1 }, 170, E.outBack), this.tween(sb, { x: Bp.x, y: Bp.y, s: 1 }, 170, E.outBack)]);
    } else {
      sa.s = 1; sb.s = 1;
    }
  };
  B.playResolve = function (ph) {
    var self = this;
    this.turn.res++;
    return new Promise(function (res) {
      var evs = ph.events, sp = self.speed;
      for (var i = 0; i < evs.length; i++) (function (ev) { self.after(ev.t * sp, function () { self.onEvent(ev); }); })(evs[i]);
      self.after(ph.dur * sp + 170, function () { self.checkWord(); res(); });
    });
  };
  B.checkWord = function () {
    var t = this.turn;
    if (!t || this.bonus) return;
    var tier = -1;
    if (t.res >= 3 || t.pops >= 14) tier = 0;
    if (t.res >= 5 || t.pops >= 24) tier = 1;
    if (t.res >= 7 || t.pops >= 38) tier = 2;
    if (t.res >= 10 || t.pops >= 58) tier = 3;
    if (tier > t.word) { t.word = tier; this.word(WORDS[tier], tier); }
  };
  B.playFall = function (ph) {
    var self = this;
    return new Promise(function (res) {
      var n = 0, spawnMap = {};
      ph.spawns.forEach(function (s) { spawnMap[s.id] = s; });
      ph.moves.forEach(function (m) {
        var sp = self.sprites[m.id], path;
        if (!sp) {
          var s = spawnMap[m.id];
          if (!s) return;
          sp = self.addSprite(s.candy, m.path[0][0] - 1 - s.idx * 1.0, s.c);
          path = m.path.slice(0);
        } else path = m.path.slice(1);
        if (!path.length) return;
        sp.path = path; sp.v = 4; sp.delay = 0;
        n++;
        sp.onLand = function () { if (--n === 0) res(); };
      });
      if (!n) res();
    });
  };
  B.playShuffle = async function (ph) {
    this.ui.toast('No moves left — shuffling!');
    this.sfx('shuffle');
    var self = this, cx = (this.g.cols - 1) / 2, cy = (this.g.rows - 1) / 2;
    await this.wait(500);
    var ps = ph.moves.map(function (m) {
      var sp = self.sprites[m.id];
      if (!sp) return null;
      return self.tween(sp, { x: cx + (sp.x - cx) * 0.25, y: cy + (sp.y - cy) * 0.25, rot: rnd(-3, 3), s: 0.7 }, 320, E.inQ);
    });
    await Promise.all(ps);
    ph.moves.forEach(function (m) { var sp = self.sprites[m.id]; if (sp) { sp.color = m.color; sp.kind = m.kind; } });
    ps = ph.moves.map(function (m) {
      var sp = self.sprites[m.id];
      if (!sp) return null;
      return self.tween(sp, { x: m.c, y: m.r, rot: 0, s: 1 }, 420, E.outBack);
    });
    await Promise.all(ps);
  };

  // ---------------- events ----------------
  B.onEvent = function (ev) {
    var h = this['ev_' + ev.e];
    if (h) h.call(this, ev);
  };
  B.px = function (r, c) { return [this.ox + (c + 0.5) * this.cs, this.oy + (r + 0.5) * this.cs]; };

  B.ev_pop = function (ev) {
    var sp = this.sprites[ev.id], self = this, cs = this.cs;
    var p = this.px(ev.r, ev.c);
    this.turn && this.turn.pops++;
    if (!sp) return;
    delete this.sprites[ev.id];
    var ghost = sp; // keep drawing through an effect until anim ends
    var eff = { upd: function () { return !ghost.gone; }, draw: function (x) { self.drawSprite(x, ghost, cs * 1.3, self.now); } };
    this.effects.push(eff);
    if (ev.goal) this.flyGoal(ev.goal, p, candyImg(sp.color, sp.kind, sp.ingr, cs));
    if (ev.cause === 'merge' && ev.to) {
      this.tween(ghost, { x: ev.to[1], y: ev.to[0], s: 0.9 }, 150, E.inQ).then(function () {
        return self.tween(ghost, { s: 0.4, a: 0 }, 60);
      }).then(function () { ghost.gone = true; });
      return;
    }
    // pop
    this.sfx('pop', { combo: Math.min(12, (this.g.cascade != null ? this.turn.res - 1 : 0)) }, 26);
    this.tween(ghost, { s: 1.28 }, 70, E.outQ).then(function () {
      return self.tween(ghost, { s: 0, a: 0 }, 130, E.inQ);
    }).then(function () { ghost.gone = true; });
    this.burst(p[0], p[1], sp.color, ev.cause === 'match' ? 7 : 5);
  };
  B.burst = function (x, y, color, n) {
    var cs = this.cs, base = colBase(color), light = colLight(color);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = rnd(80, 240) * cs / 50;
      this.fx.add({ type: 'shard', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 700, r: rnd(3, 6) * cs / 50, color: i % 3 ? base : light, vr: rnd(-12, 12), life: rnd(0.4, 0.7), drag: 0.97 });
    }
    this.fx.add({ type: 'glow', x: x, y: y, r: cs * 0.7, color: colGlow(color), life: 0.25, grow: 1, alpha: 0.7 });
    this.fx.add({ type: 'spark', x: x + rnd(-8, 8), y: y + rnd(-8, 8), r: cs * 0.25, color: colGlow(color), life: 0.35, vr: 4 });
  };
  B.ev_create = function (ev) {
    var cd = { id: ev.id, color: ev.color, kind: ev.kind };
    var sp = this.addSprite(cd, ev.r, ev.c);
    sp.s = 0.2; sp.flash = 1;
    this.tween(sp, { s: 1, flash: 0 }, 420, E.outBack);
    var p = this.px(ev.r, ev.c), cs = this.cs;
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.2, r1: cs * 1.1, w: 5, color: '#fff', life: 0.45, glow: true });
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * 1.3, color: colGlow(ev.color), life: 0.5, grow: 0.8 });
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * TAU;
      this.fx.add({ type: 'spark', x: p[0], y: p[1], vx: Math.cos(a) * cs * 3, vy: Math.sin(a) * cs * 3, drag: 0.9, r: cs * 0.22, color: ev.kind === 'bomb' ? RAINBOW[i % 6] : colGlow(ev.color), life: 0.5, vr: 6 });
    }
    var snd = { sh: 'create_striped', sv: 'create_striped', wrap: 'create_wrapped', bomb: 'create_bomb', fish: 'create_fish' }[ev.kind];
    this.sfx(snd, {}, 60);
  };
  B.ev_convert = function (ev) {
    var sp = this.sprites[ev.id];
    if (!sp) return;
    sp.kind = ev.kind; sp.color = ev.color;
    sp.flash = 1;
    this.tween(sp, { flash: 0 }, 350);
    var p = this.px(ev.r, ev.c), cs = this.cs;
    sp.s = 1.4; this.tween(sp, { s: 1 }, 320, E.outBack);
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.2, r1: cs * 0.9, w: 4, color: '#fff', life: 0.35 });
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs, color: colGlow(ev.color), life: 0.4 });
    if (ev.bonus) {
      this.ui.setMoves(ev.moves);
      var from = this.ui.movesPos();
      if (from) this.comet(from, p, colGlow(ev.color));
      this.sfx('create_striped', {}, 50);
    } else if (ev.wand) {
      this.sfx('create_bomb');
    } else this.sfx('select', {}, 40);
  };
  B.ev_prime = function (ev) {
    var sp = this.sprites[ev.id];
    if (sp) { sp.primed = true; if (ev.big) sp.big = true; }
    if (ev.goal) this.flyGoal(ev.goal, this.px(ev.r, ev.c), sp ? candyImg(sp.color, 'wrap', null, this.cs) : null);
  };
  B.ev_activate = function (ev) {
    var p = this.px(ev.r, ev.c);
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: this.cs * 1.4, color: '#ffffff', life: 0.25, grow: 1 });
    if (ev.goal) {
      var sp = this.sprites[ev.id];
      this.flyGoal(ev.goal, p, sp ? candyImg(sp.color, sp.kind, null, this.cs) : null);
    }
  };
  B.ev_combo = function (ev) {
    var p = this.px(ev.r, ev.c), cs = this.cs;
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * 3, color: '#fff7c0', life: 0.5, grow: 1.5 });
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.3, r1: cs * 3, w: 8, color: '#fff', life: 0.6, glow: true });
    this.shake(8);
    this.word('Super Combo!', 3);
    this.vibrate(40);
  };
  B.ev_beam = function (ev) {
    var self = this, cs = this.cs, p = this.px(ev.r, ev.c), dir = ev.dir, col = colGlow(ev.color);
    var len = (dir === 'h' ? this.g.cols : this.g.rows) * cs;
    var speed = cs / 0.028; // px per second, matches model hit timing
    var t = 0;
    this.sfx('stripe', {}, 50);
    this.shake(4);
    this.effects.push({
      upd: function (dt) { t += dt; return t < 0.7; },
      draw: function (x) {
        var ext = Math.min(len, t * speed), fade = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.4;
        var th = cs * 0.9 * (0.6 + 0.4 * fade);
        x.save();
        x.beginPath(); x.rect(self.ox - cs * 0.2, self.oy - cs * 0.2, self.g.cols * cs + cs * 0.4, self.g.rows * cs + cs * 0.4); x.clip();
        x.globalCompositeOperation = 'lighter'; x.translate(p[0], p[1]); if (dir === 'v') x.rotate(Math.PI / 2);
        var g = x.createLinearGradient(0, -th / 2, 0, th / 2);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, col); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalAlpha = fade; x.fillStyle = g; x.fillRect(-ext, -th / 2, ext * 2, th);
        x.globalAlpha = fade * 0.9; x.fillStyle = '#fff'; x.fillRect(-ext, -th * 0.07, ext * 2, th * 0.14);
        // tips
        var gi = glowImg(col);
        x.globalAlpha = fade;
        x.drawImage(gi, ext - cs, -cs, cs * 2, cs * 2); x.drawImage(gi, -ext - cs, -cs, cs * 2, cs * 2);
        x.restore();
      }
    });
    // sparkles along the beam
    for (var i = 0; i < 14; i++) {
      var d = (Math.random() * 2 - 1) * len * 0.55;
      var sx = dir === 'h' ? p[0] + d : p[0] + rnd(-cs * 0.3, cs * 0.3), sy = dir === 'v' ? p[1] + d : p[1] + rnd(-cs * 0.3, cs * 0.3);
      this.fx.add({ type: 'spark', x: sx, y: sy, r: cs * rnd(0.15, 0.3), color: col, life: rnd(0.3, 0.6), vr: 5, vx: rnd(-20, 20), vy: rnd(-20, 20) });
    }
  };
  B.ev_blast = function (ev) {
    var p = this.px(ev.r, ev.c), cs = this.cs, rad = ev.radius, col = colGlow(ev.color);
    this.sfx('wrap', {}, 60);
    this.shake(6 + rad * 4);
    this.vibrate(25 + rad * 15);
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * (rad + 1) * 1.6, color: col, life: 0.4, grow: 1 });
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * (rad + 0.5) * 1.2, color: '#ffffff', life: 0.18 });
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.3, r1: cs * (rad + 1.2), w: 10, color: col, life: 0.45, glow: true });
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.2, r1: cs * (rad + 0.6), w: 5, color: '#fff', life: 0.35 });
    for (var i = 0; i < 16 + rad * 8; i++) {
      var a = Math.random() * TAU, v = rnd(150, 380) * cs / 50 * (0.7 + rad * 0.3);
      this.fx.add({ type: i % 2 ? 'spark' : 'shard', x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.93, g: i % 2 ? 0 : 500, r: i % 2 ? cs * 0.25 : rnd(3, 7) * cs / 50, color: i % 3 ? col : '#fff', life: rnd(0.4, 0.8), vr: rnd(-10, 10) });
    }
  };
  B.ev_bombfx = function (ev) {
    var p = this.px(ev.r, ev.c), cs = this.cs, self = this, t = 0, big = ev.big;
    this.sfx('bomb', {}, 200);
    this.shake(big ? 16 : 6);
    this.vibrate(big ? 120 : 50);
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * (big ? 8 : 3), color: '#fff3b0', life: big ? 0.9 : 0.6, grow: 1 });
    this.effects.push({
      upd: function (dt) {
        t += dt;
        if (Math.random() < 0.8) {
          var a = Math.random() * TAU, rr = cs * rnd(0.8, 1.8);
          self.fx.add({ type: 'spark', x: p[0] + Math.cos(a) * rr, y: p[1] + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 3 + Math.sin(a) * 90, vy: -Math.sin(a) * rr * 3 - Math.cos(a) * 90, r: cs * 0.22, color: RAINBOW[(Math.random() * 6) | 0], life: 0.32 });
        }
        return t < (big ? 1.4 : 0.9);
      },
      draw: function (x) {
        var k = t / (big ? 1.4 : 0.9);
        x.save(); x.globalCompositeOperation = 'lighter'; x.translate(p[0], p[1]); x.rotate(t * 7);
        for (var i = 0; i < 6; i++) {
          x.rotate(TAU / 6);
          x.globalAlpha = (1 - k) * 0.55;
          var gi = glowImg(RAINBOW[i]);
          var d = cs * (0.5 + k * (big ? 3 : 1.2));
          x.drawImage(gi, d - cs * 0.6, -cs * 0.6, cs * 1.2, cs * 1.2);
        }
        x.restore();
      }
    });
  };
  B.ev_bolt = function (ev) {
    var a = this.px(ev.from[0], ev.from[1]), b = this.px(ev.to[0], ev.to[1]), cs = this.cs, t = 0, col = colGlow(ev.color);
    var pts = null, rt = 0;
    this.sfx('lightning', {}, 45);
    function gen() {
      var n = 10, out = [], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      for (var i = 0; i <= n; i++) {
        var k = i / n, off = (i === 0 || i === n) ? 0 : (Math.random() * 2 - 1) * cs * 0.35 * Math.sin(k * Math.PI);
        out.push([a[0] + dx * k + nx * off, a[1] + dy * k + ny * off]);
      }
      return out;
    }
    this.effects.push({
      upd: function (dt) { t += dt; rt -= dt; if (rt <= 0) { pts = gen(); rt = 0.04; } return t < 0.28; },
      draw: function (x) {
        if (!pts) return;
        var al = 1 - t / 0.28;
        x.save(); x.globalCompositeOperation = 'lighter'; x.lineJoin = 'round'; x.lineCap = 'round';
        x.globalAlpha = al * 0.6; x.strokeStyle = col; x.lineWidth = cs * 0.22;
        x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.stroke();
        x.globalAlpha = al; x.strokeStyle = '#fff'; x.lineWidth = Math.max(1.5, cs * 0.06); x.stroke();
        x.restore();
      }
    });
    this.fx.add({ type: 'glow', x: b[0], y: b[1], r: cs * 0.8, color: col, life: 0.3 });
  };
  B.ev_fish = function (ev) {
    var self = this, a = this.px(ev.from[0], ev.from[1]), b = this.px(ev.to[0], ev.to[1]), cs = this.cs, t = 0, dur = ev.dur / 1000 * this.speed;
    var img = candyImg(ev.color, 'fish', null, cs);
    var mid = [(a[0] + b[0]) / 2 + rnd(-cs, cs), Math.min(a[1], b[1]) - cs * 2.2];
    this.sfx('fish', {}, 80);
    var last = a;
    this.effects.push({
      upd: function (dt) {
        t += dt;
        if (t >= dur) {
          self.sfx('fish_hit', {}, 60);
          self.fx.add({ type: 'ring', x: b[0], y: b[1], r0: cs * 0.2, r1: cs * 0.9, w: 5, color: colGlow(ev.color), life: 0.35 });
          for (var i = 0; i < 6; i++) self.fx.add({ type: 'bubble', x: b[0] + rnd(-cs / 3, cs / 3), y: b[1] + rnd(-cs / 3, cs / 3), vy: -rnd(30, 80), r: rnd(3, 7), life: 0.5 });
          return false;
        }
        return true;
      },
      draw: function (x) {
        var k = E.io(Math.min(1, t / dur)), u = 1 - k;
        var px = u * u * a[0] + 2 * u * k * mid[0] + k * k * b[0], py = u * u * a[1] + 2 * u * k * mid[1] + k * k * b[1];
        var ang = Math.atan2(py - last[1], px - last[0]);
        last = [px, py];
        if (Math.random() < 0.5) self.fx.add({ type: 'bubble', x: px, y: py, r: rnd(2, 5), vy: -30, life: 0.5 });
        x.save(); x.translate(px, py); x.rotate(ang); if (Math.cos(ang) < 0) x.scale(1, -1);
        var s = cs * 1.3 * (1 + Math.sin(k * Math.PI) * 0.35);
        x.drawImage(img, -s / 2, -s / 2, s, s);
        if (ev.payload) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.6; var gi = glowImg('#ffffff'); x.drawImage(gi, -s / 2, -s / 2, s, s); }
        x.restore();
      }
    });
  };
  B.ev_jelly = function (ev) {
    var v = this.vc[ev.r][ev.c], p = this.px(ev.r, ev.c), cs = this.cs;
    v.jelly = ev.level; v.jw = 0.35;
    this.sfx('jelly', {}, 50);
    for (var i = 0; i < 7; i++) {
      var a = Math.random() * TAU, sp = rnd(60, 160) * cs / 50;
      this.fx.add({ type: 'drop', x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 600, r: rnd(2.5, 5) * cs / 50, color: 'rgba(255,90,190,.85)', life: 0.6 });
    }
    if (ev.goal) this.flyGoal('jelly', p, this.goalImg('jelly'));
  };
  B.ev_frost = function (ev) {
    var v = this.vc[ev.r][ev.c], p = this.px(ev.r, ev.c), cs = this.cs;
    v.frost = ev.hp; v.fw = 0.3;
    this.sfx('frost', {}, 40);
    var n = ev.hp === 0 ? 12 : 5;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = rnd(60, 200) * cs / 50;
      this.fx.add({ type: 'chunk', x: p[0] + rnd(-cs / 3, cs / 3), y: p[1] + rnd(-cs / 3, cs / 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 900, r: rnd(2.5, 6) * cs / 50, color: i % 3 ? '#fff' : '#ffd6ea', vr: rnd(-10, 10), life: 0.7 });
    }
    if (ev.hp === 0) this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs, color: '#bdf3ff', life: 0.3 });
    if (ev.goal) this.flyGoal('frost', p, this.goalImg('frost'));
  };
  B.ev_unlock = function (ev) {
    var v = this.vc[ev.r][ev.c], p = this.px(ev.r, ev.c), cs = this.cs;
    v.lock = false;
    this.sfx('unlock', {}, 60);
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * TAU, sp = rnd(80, 200) * cs / 50;
      this.fx.add({ type: 'chunk', x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 900, r: rnd(2, 4) * cs / 50, color: i % 2 ? '#ff3b5c' : '#fff', vr: rnd(-10, 10), life: 0.6 });
    }
    this.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.2, r1: cs * 0.8, w: 4, color: '#ffe066', life: 0.3 });
    if (ev.goal) this.flyGoal('lock', p, this.goalImg('lock'));
  };
  B.ev_exit = function (ev) {
    var sp = this.sprites[ev.id], self = this, p = this.px(ev.r, ev.c), cs = this.cs;
    this.sfx('ingredient');
    if (!sp) return;
    delete this.sprites[ev.id];
    var img = candyImg(-1, 'ingr', sp.ingr, cs);
    this.fx.add({ type: 'glow', x: p[0], y: p[1], r: cs * 1.5, color: '#fff3b0', life: 0.5 });
    for (var i = 0; i < 10; i++) this.fx.add({ type: 'spark', x: p[0], y: p[1], vx: rnd(-150, 150), vy: rnd(-200, 50), drag: 0.93, r: cs * 0.2, color: '#ffe98a', life: 0.6 });
    this.flyGoal(ev.goal || 'ingr', p, img, true);
  };
  B.ev_score = function (ev) {
    if (this.ui.addScore) this.ui.addScore(ev.v);
    var p = this.px(ev.r, ev.c), cs = this.cs;
    var n = 0;
    for (var i = 0; i < this.fx.ps.length; i++) if (this.fx.ps[i].type === 'text') n++;
    if (!ev.big && n > 24) return;
    this.fx.add({ type: 'text', x: p[0], y: p[1], vy: -cs * 0.9, text: String(ev.v), size: ev.big ? cs * 0.5 : cs * 0.34, color: ev.color >= 0 ? COLORS[ev.color].light : '#fff', life: ev.big ? 0.9 : 0.6, drag: 0.96 });
  };
  B.ev_shake = function (ev) { this.shake(ev.p); };
  B.ev_hammer = function (ev) {
    var self = this, p = this.px(ev.r, ev.c), cs = this.cs, t = 0;
    var img = Cache.get('hammerIcon', Math.round(cs * 1.8), function (x, s) { drawAsset(x, 'booster/hammer', s); });
    this.effects.push({
      upd: function (dt) {
        t += dt;
        if (t >= 0.26 && !this.hit) {
          this.hit = true; self.sfx('hammer'); self.shake(10); self.vibrate(50);
          self.fx.add({ type: 'ring', x: p[0], y: p[1], r0: cs * 0.3, r1: cs * 1.4, w: 8, color: '#fff', life: 0.4, glow: true });
          for (var i = 0; i < 10; i++) self.fx.add({ type: 'spark', x: p[0], y: p[1], vx: rnd(-250, 250), vy: rnd(-250, 250), drag: 0.9, r: cs * 0.25, color: '#ffe98a', life: 0.5 });
        }
        return t < 0.6;
      },
      draw: function (x) {
        var k = Math.min(1, t / 0.26), ang = -1.2 + E.inQ(k) * 1.3, al = t > 0.4 ? 1 - (t - 0.4) / 0.2 : 1;
        x.save(); x.globalAlpha = Math.max(0, al); x.translate(p[0] + cs * 0.9, p[1] + cs * 0.6); x.rotate(ang);
        var s = cs * 1.8; x.drawImage(img, -s * 0.75, -s * 0.8, s, s); x.restore();
      }
    });
  };

  B.goalImg = function (type) {
    var s = Math.round(this.cs || 40);
    return Cache.get('goal' + type, s, function (x, ss) { drawAsset(x, 'goal/' + type, ss * 0.95); });
  };

  // fly an icon to the HUD goal slot (overlay canvas)
  B.flyGoal = function (key, from, img, big) {
    var ui = this.ui, self = this;
    var to = ui.goalPos && ui.goalPos(key);
    if (!to) { if (ui.goalHit) ui.goalHit(key); return; }
    if (!img) img = this.goalImg('score');
    this.keyFlights = this.keyFlights || {};
    if ((this.keyFlights[key] || 0) >= 7) { // too many in the air: count it without another icon
      this.flights++;
      this.after(450 + Math.random() * 400, function () { self.flights--; if (ui.goalHit) ui.goalHit(key); });
      return;
    }
    this.keyFlights[key] = (this.keyFlights[key] || 0) + 1;
    this.flights++;
    var t = 0, dur = 0.55 + Math.random() * 0.25, cs = this.cs;
    var ctrl = [from[0] + rnd(-cs * 2, cs * 2), Math.min(from[1], to[1]) - cs * rnd(0.5, 2)];
    var size = cs * (big ? 1.3 : 0.9);
    this.topEffects.push({
      upd: function (dt) {
        t += dt;
        if (t >= dur) {
          self.flights--;
          self.keyFlights[key]--;
          if (ui.goalHit) ui.goalHit(key);
          self.top.add({ type: 'glow', x: to[0], y: to[1], r: 30, color: '#fff3b0', life: 0.3 });
          for (var i = 0; i < 4; i++) self.top.add({ type: 'spark', x: to[0], y: to[1], vx: rnd(-120, 120), vy: rnd(-120, 120), drag: 0.9, r: 9, color: '#fff3b0', life: 0.35 });
          return false;
        }
        return true;
      },
      draw: function (x) {
        var k = E.inQ(Math.min(1, t / dur)), u = 1 - k;
        var px = u * u * from[0] + 2 * u * k * ctrl[0] + k * k * to[0], py = u * u * from[1] + 2 * u * k * ctrl[1] + k * k * to[1];
        var s = size * (1 + Math.sin(k * Math.PI) * 0.3 - k * 0.45);
        x.save(); x.globalAlpha = 0.95; x.translate(px, py); x.rotate(k * 3);
        x.drawImage(img, -s / 2, -s / 2, s, s); x.restore();
        if (Math.random() < 0.6) self.top.add({ type: 'spark', x: px, y: py, r: 7, color: '#fff8d0', life: 0.3 });
      }
    });
  };
  B.waitFlights = async function () {
    for (var i = 0; i < 200 && this.flights > 0; i++) await this.wait(50);
  };
  B.comet = function (from, to, col) {
    var t = 0, self = this, dur = 0.4;
    this.topEffects.push({
      upd: function (dt) { t += dt; return t < dur; },
      draw: function (x) {
        var k = E.io(t / dur), px = from[0] + (to[0] - from[0]) * k, py = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 60;
        self.top.add({ type: 'spark', x: px, y: py, r: 10, color: col, life: 0.35 });
        x.save(); x.globalCompositeOperation = 'lighter'; var gi = glowImg(col); x.drawImage(gi, px - 20, py - 20, 40, 40); x.restore();
      }
    });
  };

  // big bubbly word in the middle of the board
  B.word = function (text, tier) {
    var self = this, t = 0, cs = this.cs;
    var cx = this.W / 2, cy = this.oy + this.g.rows * cs * 0.45;
    this.effects = this.effects.filter(function (e) { return !e.isWord; });
    this.sfx('cheer', { level: Math.max(0, Math.min(3, tier)) });
    var size = Math.min(this.W * 0.16, 64) * (0.9 + tier * 0.08);
    this.x.font = '900 ' + size + 'px ' + FONT;
    var tw = this.x.measureText(text).width, maxW = this.W * 0.78;
    if (tw > maxW) size *= maxW / tw;
    var eff = {
      isWord: true,
      upd: function (dt) { t += dt; return t < 1.3; },
      draw: function (x) {
        var k = t / 1.3;
        var sc = t < 0.25 ? E.outBack(t / 0.25) : 1 + (t - 0.25) * 0.06;
        var al = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        x.save(); x.globalAlpha = al; x.translate(cx, cy - (k > 0.75 ? (k - 0.75) * 120 : 0)); x.scale(sc, sc); x.rotate(-0.06);
        x.font = '900 ' + size + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
        x.shadowColor = 'rgba(80,0,50,.45)'; x.shadowOffsetY = 6; x.shadowBlur = 8;
        x.lineWidth = size * 0.28; x.strokeStyle = '#7a1045'; x.strokeText(text, 0, 0);
        x.shadowColor = 'transparent';
        x.lineWidth = size * 0.12; x.strokeStyle = '#fff'; x.strokeText(text, 0, 0);
        var gr = x.createLinearGradient(0, -size / 2, 0, size / 2);
        var pal = [['#fff7b0', '#ffb830'], ['#ffd1f0', '#ff4fa8'], ['#d6f7ff', '#39a8ff'], ['#fff3a0', '#ff5f3a']][tier % 4];
        gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]);
        x.fillStyle = gr; x.fillText(text, 0, 0);
        x.restore();
      }
    };
    this.effects.push(eff);
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * TAU;
      this.fx.add({ type: 'spark', x: cx + Math.cos(a) * size * 1.2, y: cy + Math.sin(a) * size * 0.6, vx: Math.cos(a) * 120, vy: Math.sin(a) * 80, drag: 0.93, r: 10, color: RAINBOW[i % 6], life: 0.8 });
    }
  };

  // confetti on overlay
  B.confetti = function (n) {
    for (var i = 0; i < (n || 90); i++) {
      this.top.add({ type: 'confetti', x: rnd(0, this.W), y: rnd(-80, -10), vx: rnd(-40, 40), vy: rnd(120, 320), g: 60, r: rnd(4, 8), color: RAINBOW[i % 6], vr: rnd(-6, 6), flip: rnd(4, 12), life: rnd(2.2, 3.6), fade: false });
    }
  };
  B.fireworks = function (x0, y0) {
    for (var i = 0; i < 28; i++) {
      var a = i / 28 * TAU;
      this.top.add({ type: 'spark', x: x0, y: y0, vx: Math.cos(a) * rnd(160, 300), vy: Math.sin(a) * rnd(160, 300), drag: 0.93, g: 120, r: 12, color: RAINBOW[i % 6], life: 0.9 });
    }
  };

  // verify view vs model after a turn; resync on mismatch (safety net)
  B.sync = function () {
    var g = this.g, bad = false, seen = {};
    for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) {
      var cl = g.cells[r][c], v = this.vc[r][c];
      v.jelly = cl.jelly; v.frost = cl.frost; v.lock = cl.lock;
      var cd = cl.candy;
      if (!cd) continue;
      seen[cd.id] = 1;
      var sp = this.sprites[cd.id];
      if (!sp) { bad = true; sp = this.addSprite(cd, r, c); }
      if (Math.abs(sp.x - c) > 0.01 || Math.abs(sp.y - r) > 0.01) { bad = true; sp.x = c; sp.y = r; }
      sp.path = null; sp.kind = cd.kind; sp.color = cd.color; sp.primed = !!cd.primed; sp.s = 1; sp.a = 1; sp.rot = 0;
    }
    for (var id in this.sprites) if (!seen[id]) { bad = true; delete this.sprites[id]; }
    if (bad) console.warn('view resynced');
  };

  window.SB = { Board: Board, Cache: Cache, candyImg: candyImg, candyKey: candyKey, drawAsset: drawAsset, glowImg: glowImg, E: E, FX: FX, Bg: Bg, DPR: DPR, COLORS: COLORS, RAINBOW: RAINBOW };
})();
