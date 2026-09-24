/* Sugar Burst — pure game model (no DOM). Runs in browser and in node (bot / balancing).
 * The model resolves a whole turn synchronously and returns "phases" that the renderer plays back:
 *   {type:'swap', a, b, ok}                        swap animation (ok=false -> swap back)
 *   {type:'resolve', events:[{t, e, ...}], dur}    timed clear / explosion events
 *   {type:'fall', moves:[{id,path}], spawns:[{id,c,idx,candy}]}
 *   {type:'shuffle', moves:[{id,r,c,color,kind}]}
 *   {type:'end', state:'won'|'lost'}
 */
(function (root) {
  'use strict';

  function RNG(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  RNG.prototype.next = function () {
    var t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
  RNG.prototype.pick = function (a) { return a[this.int(a.length)]; };
  RNG.prototype.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) { var j = this.int(i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  };

  var SPECIAL = { sh: 1, sv: 1, wrap: 1, bomb: 1, fish: 1 };
  function isSpecial(cd) { return !!cd && SPECIAL[cd.kind] === 1; }
  var KIND_GOAL = { sh: 'stripe', sv: 'stripe', wrap: 'wrap', bomb: 'bomb', fish: 'fish' };
  var DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function Game(level, seed, opts) {
    opts = opts || {};
    this.level = level;
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    var L = level.layout;
    this.rows = L.length;
    this.cols = L[0].length;
    this.colors = level.colors || 5;
    this.moves = level.moves;
    this.score = 0;
    this.nid = 1;
    this.record = opts.record !== false;
    this.events = [];
    this.q = [];
    this.t = 0;
    this.seq = 0;
    this.acts = 0;
    this.cascade = 0;
    this.state = 'play';
    this.fishTargets = {};
    this.ingrOnBoard = 0;
    this.ingrSpawned = 0;
    this.movesSinceIngr = 99;
    this.ingrFlip = 0;
    this.made = { stripe: 0, wrap: 0, bomb: 0, fish: 0 };

    var presets = [];
    this.cells = [];
    for (var r = 0; r < this.rows; r++) {
      var row = [];
      for (var c = 0; c < this.cols; c++) {
        var ch = L[r][c];
        var cell = { v: ch !== '#' && ch !== ' ', jelly: 0, frost: 0, lock: false, candy: null };
        switch (ch) {
          case 'j': cell.jelly = 1; break;
          case 'J': cell.jelly = 2; break;
          case '1': case '2': case '3': cell.frost = +ch; break;
          case 'l': cell.lock = true; break;
          case 'L': cell.lock = true; cell.jelly = 1; break;
          case 'a': cell.frost = 1; cell.jelly = 1; break;
          case 'b': cell.frost = 2; cell.jelly = 1; break;
          case 'c': case 'n': presets.push([r, c, 'ingr', ch === 'c' ? 'cherry' : 'nut']); break;
          case 'H': presets.push([r, c, 'sh']); break;
          case 'V': presets.push([r, c, 'sv']); break;
          case 'W': presets.push([r, c, 'wrap']); break;
          case 'B': presets.push([r, c, 'bomb']); break;
          case 'F': presets.push([r, c, 'fish']); break;
        }
        row.push(cell);
      }
      this.cells.push(row);
    }
    if (level.jelly) {
      for (r = 0; r < this.rows; r++) for (c = 0; c < this.cols; c++) {
        var jc = level.jelly[r][c];
        if (jc === 'j') this.cells[r][c].jelly = 1;
        else if (jc === 'J') this.cells[r][c].jelly = 2;
      }
    }

    // spawners: top valid cell per column; exits: bottom valid cell per column
    this.exitRow = [];
    for (c = 0; c < this.cols; c++) {
      var er = -1;
      for (r = this.rows - 1; r >= 0; r--) if (this.cells[r][c].v) { er = r; break; }
      this.exitRow.push(er);
    }

    // goals
    this.goals = [];
    this.left = {};
    var gl = level.goals || [];
    for (var i = 0; i < gl.length; i++) {
      var g = gl[i], key, n = g.n || 0;
      if (g.type === 'score') key = 'score';
      else if (g.type === 'collect') key = 'c' + g.color;
      else if (g.type === 'kind') key = 'k_' + g.kind;
      else key = g.type;
      if (g.type === 'jelly') { n = 0; this.eachCell(function (cl) { n += cl.jelly; }); }
      if (g.type === 'frost') { n = 0; this.eachCell(function (cl) { n += cl.frost; }); }
      if (g.type === 'lock') { n = 0; this.eachCell(function (cl) { if (cl.lock) n++; }); }
      this.goals.push({ key: key, type: g.type, n: n, color: g.color, kind: g.kind });
      this.left[key] = n;
    }
    this.ingrTotal = this.left.ingr || 0;

    // presets
    for (i = 0; i < presets.length; i++) {
      var p = presets[i];
      var cd;
      if (p[2] === 'ingr') {
        cd = { id: this.nid++, color: -1, kind: 'ingr', ingr: p[3] };
        this.ingrOnBoard++; this.ingrSpawned++;
      } else {
        cd = this.newCandy(p[2] === 'bomb' ? -1 : this.rng.int(this.colors), p[2]);
      }
      this.cells[p[0]][p[1]].candy = cd;
    }
    this.genBoard();
  }

  var G = Game.prototype;

  G.eachCell = function (fn) {
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) fn(this.cells[r][c], r, c);
  };
  G.cell = function (r, c) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    var cl = this.cells[r][c];
    return cl.v ? cl : null;
  };
  G.newCandy = function (color, kind) {
    return { id: this.nid++, color: color, kind: kind || 'normal' };
  };
  G.colorAt = function (r, c) {
    var cl = this.cell(r, c);
    if (!cl || !cl.candy) return -1;
    var k = cl.candy.kind;
    if (k === 'bomb' || k === 'ingr') return -1;
    return cl.candy.color;
  };
  G.movable = function (r, c) {
    var cl = this.cell(r, c);
    return !!(cl && cl.candy && !cl.lock && !cl.frost);
  };

  // ---------- board generation ----------
  G.pickColorNoMatch = function (r, c) {
    var order = this.rng.shuffle(range(this.colors));
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      if (this.colorAt(r, c - 1) === k && this.colorAt(r, c - 2) === k) continue;
      if (this.colorAt(r - 1, c) === k && this.colorAt(r - 2, c) === k) continue;
      if (this.colorAt(r, c + 1) === k && this.colorAt(r, c + 2) === k) continue;
      if (this.colorAt(r + 1, c) === k && this.colorAt(r + 2, c) === k) continue;
      if (this.colorAt(r, c - 1) === k && this.colorAt(r, c + 1) === k) continue;
      if (this.colorAt(r - 1, c) === k && this.colorAt(r + 1, c) === k) continue;
      if (this.colorAt(r - 1, c) === k && this.colorAt(r, c - 1) === k && this.colorAt(r - 1, c - 1) === k) continue;
      if (this.colorAt(r - 1, c) === k && this.colorAt(r, c + 1) === k && this.colorAt(r - 1, c + 1) === k) continue;
      return k;
    }
    return order[0];
  };
  G.genBoard = function () {
    var fixed = [];
    this.eachCell(function (cl, r, c) { if (cl.candy) fixed.push(r * 100 + c); });
    for (var attempt = 0; attempt < 200; attempt++) {
      for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
        var cl = this.cells[r][c];
        if (!cl.v || cl.frost) continue;
        if (fixed.indexOf(r * 100 + c) >= 0) continue;
        cl.candy = null;
      }
      for (r = 0; r < this.rows; r++) for (c = 0; c < this.cols; c++) {
        cl = this.cells[r][c];
        if (!cl.v || cl.frost || cl.candy) continue;
        cl.candy = this.newCandy(this.pickColorNoMatch(r, c));
      }
      if (!this.findMatches().length && this.hasMove()) return;
    }
  };

  // ---------- event / time queue ----------
  G.emit = function (o) {
    this.acts++;
    if (!this.record) return;
    o.t = this.t;
    this.events.push(o);
  };
  G.at = function (t, fn) { this.q.push({ t: t, s: this.seq++, fn: fn }); };
  G.runQueue = function () {
    var guard = 0;
    while (this.q.length && guard++ < 20000) {
      var bi = 0, b = this.q[0];
      for (var i = 1; i < this.q.length; i++) {
        var x = this.q[i];
        if (x.t < b.t || (x.t === b.t && x.s < b.s)) { b = x; bi = i; }
      }
      this.q.splice(bi, 1);
      this.t = b.t;
      b.fn();
    }
  };
  G.beginResolve = function () {
    this.events = [];
    this.q = [];
    this.t = 0;
    this.fishTargets = {};
    this.acts0 = this.acts;
  };
  G.endResolve = function () {
    var dur = 0;
    for (var i = 0; i < this.events.length; i++) {
      var ev = this.events[i];
      var end = ev.t + (ev.dur || 0);
      if (end > dur) dur = end;
    }
    return { type: 'resolve', events: this.events, dur: dur, changed: this.acts !== this.acts0 };
  };

  // ---------- scoring & goals ----------
  G.addScore = function (v, r, c, color, big) {
    this.score += v;
    if (this.left.score !== undefined) this.left.score = Math.max(0, this.goalN('score') - this.score);
    this.emit({ e: 'score', r: r, c: c, v: v, color: color, big: !!big });
  };
  G.goalN = function (key) {
    for (var i = 0; i < this.goals.length; i++) if (this.goals[i].key === key) return this.goals[i].n;
    return 0;
  };
  G.dec = function (key) {
    if (this.left[key] > 0) { this.left[key]--; return key; }
    return null;
  };
  G.goalsDone = function () {
    for (var k in this.left) if (this.left[k] > 0) return false;
    return true;
  };
  G.goalProgress = function () { // 0..1 averaged, used by the bot
    if (!this.goals.length) return 1;
    var s = 0;
    for (var i = 0; i < this.goals.length; i++) {
      var g = this.goals[i];
      s += g.n ? 1 - this.left[g.key] / g.n : 1;
    }
    return s / this.goals.length;
  };
  G.countKind = function (kind) {
    var gk = KIND_GOAL[kind];
    if (!gk) return null;
    return this.dec('k_' + gk);
  };

  // ---------- match finding ----------
  G.findMatches = function () {
    var R = this.rows, C = this.cols, self = this;
    var n = R * C;
    var parent = new Int32Array(n);
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    var mark = new Uint8Array(n);
    var runs = [], squares = [];
    var r, c, e, k;
    for (r = 0; r < R; r++) {
      c = 0;
      while (c < C) {
        k = this.colorAt(r, c);
        if (k < 0) { c++; continue; }
        e = c + 1;
        while (e < C && this.colorAt(r, e) === k) e++;
        if (e - c >= 3) {
          runs.push({ dir: 'h', r: r, c: c, len: e - c, color: k });
          for (var x = c; x < e; x++) { mark[r * C + x] = 1; uni(r * C + c, r * C + x); }
        }
        c = e;
      }
    }
    for (c = 0; c < C; c++) {
      r = 0;
      while (r < R) {
        k = this.colorAt(r, c);
        if (k < 0) { r++; continue; }
        e = r + 1;
        while (e < R && this.colorAt(e, c) === k) e++;
        if (e - r >= 3) {
          runs.push({ dir: 'v', r: r, c: c, len: e - r, color: k });
          for (var y = r; y < e; y++) { mark[y * C + c] = 1; uni(r * C + c, y * C + c); }
        }
        r = e;
      }
    }
    for (r = 0; r < R - 1; r++) for (c = 0; c < C - 1; c++) {
      k = this.colorAt(r, c);
      if (k < 0) continue;
      if (this.colorAt(r, c + 1) === k && this.colorAt(r + 1, c) === k && this.colorAt(r + 1, c + 1) === k) {
        squares.push({ r: r, c: c, color: k });
        var ids = [r * C + c, r * C + c + 1, (r + 1) * C + c, (r + 1) * C + c + 1];
        for (var q = 0; q < 4; q++) { mark[ids[q]] = 1; uni(ids[0], ids[q]); }
      }
    }
    var groups = {}, list = [];
    for (i = 0; i < n; i++) {
      if (!mark[i]) continue;
      var root = find(i);
      var g = groups[root];
      if (!g) {
        g = groups[root] = { cells: [], color: self.colorAt((i / C) | 0, i % C), runs: [], squares: [] };
        list.push(g);
      }
      g.cells.push([(i / C) | 0, i % C]);
    }
    for (i = 0; i < runs.length; i++) groups[find(runs[i].r * C + runs[i].c)].runs.push(runs[i]);
    for (i = 0; i < squares.length; i++) groups[find(squares[i].r * C + squares[i].c)].squares.push(squares[i]);
    for (i = 0; i < list.length; i++) list[i].kind = this.classify(list[i]);
    return list;
  };
  G.classify = function (g) {
    var maxLen = 0, hasH = false, hasV = false, h4 = false;
    for (var i = 0; i < g.runs.length; i++) {
      var rn = g.runs[i];
      if (rn.len > maxLen) { maxLen = rn.len; h4 = rn.dir === 'h'; }
      if (rn.dir === 'h') hasH = true; else hasV = true;
    }
    if (maxLen >= 5) return 'bomb';
    if (hasH && hasV) return 'wrap';
    if (maxLen === 4) return h4 ? 'sv' : 'sh';
    if (g.squares.length) return 'fish';
    return null;
  };
  G.matchAt = function (r, c) {
    var k = this.colorAt(r, c);
    if (k < 0) return false;
    var a = 1, x;
    for (x = c - 1; this.colorAt(r, x) === k; x--) a++;
    for (x = c + 1; this.colorAt(r, x) === k; x++) a++;
    if (a >= 3) return true;
    a = 1;
    for (x = r - 1; this.colorAt(x, c) === k; x--) a++;
    for (x = r + 1; this.colorAt(x, c) === k; x++) a++;
    if (a >= 3) return true;
    for (var dr = -1; dr <= 0; dr++) for (var dc = -1; dc <= 0; dc++) {
      var r0 = r + dr, c0 = c + dc;
      if (this.colorAt(r0, c0) === k && this.colorAt(r0 + 1, c0) === k &&
          this.colorAt(r0, c0 + 1) === k && this.colorAt(r0 + 1, c0 + 1) === k) return true;
    }
    return false;
  };

  // ---------- moves ----------
  G.adjacent = function (a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; };
  G.canSwap = function (a, b) {
    return this.adjacent(a, b) && this.movable(a[0], a[1]) && this.movable(b[0], b[1]);
  };
  G.isCombo = function (ca, cb) {
    if (ca.kind === 'ingr' || cb.kind === 'ingr') return false;
    if (ca.kind === 'bomb' || cb.kind === 'bomb') return true;
    return isSpecial(ca) && isSpecial(cb);
  };
  G.rawSwap = function (a, b) {
    var A = this.cells[a[0]][a[1]], B = this.cells[b[0]][b[1]];
    var t = A.candy; A.candy = B.candy; B.candy = t;
  };
  G.isValidMove = function (a, b) {
    if (!this.canSwap(a, b)) return false;
    var ca = this.cells[a[0]][a[1]].candy, cb = this.cells[b[0]][b[1]].candy;
    if (this.isCombo(ca, cb)) return true;
    this.rawSwap(a, b);
    var ok = this.matchAt(a[0], a[1]) || this.matchAt(b[0], b[1]);
    this.rawSwap(a, b);
    return ok;
  };
  G.validMoves = function () {
    var out = [];
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      if (this.isValidMove([r, c], [r, c + 1])) out.push([[r, c], [r, c + 1]]);
      if (this.isValidMove([r, c], [r + 1, c])) out.push([[r, c], [r + 1, c]]);
    }
    return out;
  };
  G.hasMove = function () {
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      if (this.isValidMove([r, c], [r, c + 1]) || this.isValidMove([r, c], [r + 1, c])) return true;
    }
    return false;
  };
  // quick heuristic value of a move (for hints)
  G.moveValue = function (a, b) {
    var ca = this.cells[a[0]][a[1]].candy, cb = this.cells[b[0]][b[1]].candy;
    if (this.isCombo(ca, cb)) {
      var v = 60;
      if (ca.kind === 'bomb' && cb.kind === 'bomb') v = 120;
      else if (ca.kind === 'bomb' || cb.kind === 'bomb') v = isSpecial(ca) && isSpecial(cb) ? 100 : 55;
      return v;
    }
    this.rawSwap(a, b);
    var gs = this.findMatches();
    this.rawSwap(a, b);
    var s = 0;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      s += g.cells.length + ({ bomb: 40, wrap: 25, sh: 18, sv: 18, fish: 14 }[g.kind] || 0);
      for (var j = 0; j < g.cells.length; j++) {
        var cl = this.cells[g.cells[j][0]][g.cells[j][1]];
        if (cl.jelly) s += 3;
        if (cl.lock) s += 3;
      }
    }
    return s;
  };
  G.findHint = function () {
    var mv = this.validMoves();
    if (!mv.length) return null;
    var best = null, bv = -1;
    for (var i = 0; i < mv.length; i++) {
      var v = this.moveValue(mv[i][0], mv[i][1]) + this.rng.next() * 0.5;
      if (v > bv) { bv = v; best = mv[i]; }
    }
    return best;
  };

  // ---------- core resolution ----------
  G.damageJelly = function (r, c) {
    var cl = this.cells[r][c];
    if (cl.jelly > 0) {
      cl.jelly--;
      var goal = this.dec('jelly');
      this.emit({ e: 'jelly', r: r, c: c, level: cl.jelly, goal: goal });
      this.addScore(1000, r, c, -2);
    }
  };
  G.removeCandy = function (r, c, cause, to) {
    var cl = this.cells[r][c];
    var cd = cl.candy;
    if (!cd) return;
    cl.candy = null;
    var goal = null;
    if (cd.color >= 0) goal = this.dec('c' + cd.color);
    this.emit({ e: 'pop', id: cd.id, r: r, c: c, color: cd.color, kind: cd.kind, cause: cause, to: to || null, goal: goal });
    this.damageJelly(r, c);
    if (cause !== 'match' && cause !== 'merge') this.addScore(60, r, c, cd.color);
  };
  G.hit = function (r, c, opts) {
    var cl = this.cell(r, c);
    if (!cl) return;
    var cause = (opts && opts.cause) || 'blast';
    if (cl.frost > 0) {
      cl.frost--;
      var g = this.dec('frost');
      this.emit({ e: 'frost', r: r, c: c, hp: cl.frost, goal: g });
      this.addScore(200, r, c, -3);
      return;
    }
    var cd = cl.candy;
    if (!cd) { if (cause !== 'match') this.damageJelly(r, c); return; }
    if (cl.lock) {
      cl.lock = false;
      var gl = this.dec('lock');
      this.emit({ e: 'unlock', r: r, c: c, goal: gl });
      this.addScore(100, r, c, -3);
      return;
    }
    if (cd.kind === 'ingr') return;
    if (isSpecial(cd)) { this.activate(r, c, cd); return; }
    this.removeCandy(r, c, cause);
  };
  G.activate = function (r, c, cd) {
    var goal;
    switch (cd.kind) {
      case 'sh': case 'sv':
        goal = this.countKind(cd.kind);
        this.emit({ e: 'activate', id: cd.id, r: r, c: c, kind: cd.kind, goal: goal });
        this.removeCandy(r, c, 'self');
        this.beam(r, c, cd.kind === 'sh' ? 'h' : 'v', cd.color);
        break;
      case 'wrap':
        if (!cd.primed) {
          goal = this.countKind('wrap');
          cd.primed = true;
          cd.radius = cd.radius || 1;
          this.emit({ e: 'prime', id: cd.id, r: r, c: c, goal: goal });
          this.blast(r, c, cd.radius, cd.color);
        } else {
          var rad = cd.radius || 1;
          this.removeCandy(r, c, 'self');
          this.blast(r, c, rad, cd.color);
        }
        break;
      case 'bomb':
        goal = this.countKind('bomb');
        this.emit({ e: 'activate', id: cd.id, r: r, c: c, kind: 'bomb', goal: goal });
        this.removeCandy(r, c, 'self');
        var col = this.mostCommonColor();
        if (col >= 0) this.colorClear(col, r, c, null);
        break;
      case 'fish':
        goal = this.countKind('fish');
        this.emit({ e: 'activate', id: cd.id, r: r, c: c, kind: 'fish', goal: goal });
        this.removeCandy(r, c, 'self');
        this.launchFish(r, c, cd.color, null);
        break;
    }
  };
  G.beam = function (r, c, dir, color) {
    this.emit({ e: 'beam', r: r, c: c, dir: dir, color: color, dur: 380 });
    var max = dir === 'h' ? this.cols : this.rows;
    var t0 = this.t;
    for (var d = 1; d < max; d++) {
      for (var s = -1; s <= 1; s += 2) {
        var rr = dir === 'v' ? r + s * d : r, cc = dir === 'h' ? c + s * d : c;
        if (rr < 0 || cc < 0 || rr >= this.rows || cc >= this.cols) continue;
        this.at(t0 + d * 28, this.hit.bind(this, rr, cc, { cause: 'beam' }));
      }
    }
  };
  G.blast = function (r, c, rad, color) {
    this.emit({ e: 'blast', r: r, c: c, radius: rad, color: color, dur: 450 });
    var t0 = this.t;
    for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
      if (!dr && !dc) continue;
      var d = Math.max(Math.abs(dr), Math.abs(dc));
      this.at(t0 + 40 + (d - 1) * 60, this.hit.bind(this, r + dr, c + dc, { cause: 'blast' }));
    }
  };
  G.mostCommonColor = function () {
    var cnt = [], best = -1, bn = 0;
    for (var i = 0; i < this.colors; i++) cnt.push(0);
    this.eachCell(function (cl) {
      if (cl.v && cl.candy && cl.candy.color >= 0 && cl.candy.kind !== 'ingr') cnt[cl.candy.color]++;
    });
    for (i = 0; i < cnt.length; i++) {
      var v = cnt[i] + this.rng.next() * 0.5;
      if (v > bn) { bn = v; best = i; }
    }
    return bn >= 1 ? best : -1;
  };
  // Color bomb: clears (or converts then detonates) every candy of `color`
  G.colorClear = function (color, r, c, convertKind) {
    this.emit({ e: 'bombfx', r: r, c: c, color: color, dur: 600 });
    var targets = [], self = this;
    this.eachCell(function (cl, rr, cc) {
      if (cl.v && cl.candy && cl.candy.color === color && cl.candy.kind !== 'ingr' && cl.candy.kind !== 'bomb') {
        targets.push({ r: rr, c: cc, d: Math.abs(rr - r) + Math.abs(cc - c) + self.rng.next() });
      }
    });
    targets.sort(function (a, b) { return a.d - b.d; });
    var t0 = this.t, step = Math.max(22, Math.min(45, 900 / Math.max(1, targets.length)));
    var converted = [];
    targets.forEach(function (p, i) {
      self.at(t0 + 260 + i * step, function () {
        var cl = self.cells[p.r][p.c];
        self.emit({ e: 'bolt', from: [r, c], to: [p.r, p.c], color: color, dur: 260 });
        if (!convertKind || cl.lock || !cl.candy) { self.hit(p.r, p.c, { cause: 'bolt' }); return; }
        var cd = cl.candy;
        if (!isSpecial(cd)) {
          var k = convertKind === 'stripe' ? (self.rng.next() < 0.5 ? 'sh' : 'sv') : convertKind;
          cd.kind = k;
          self.emit({ e: 'convert', id: cd.id, r: p.r, c: p.c, kind: k, color: cd.color });
        }
        converted.push(cd.id);
      });
    });
    if (convertKind) {
      var tAct = t0 + 260 + targets.length * step + 380;
      self.at(tAct, function () {
        converted.forEach(function (id, j) {
          self.at(tAct + j * 110, function () {
            var pos = self.findCandy(id);
            if (pos) self.hit(pos[0], pos[1], { cause: 'chain' });
          });
        });
      });
    }
  };
  G.findCandy = function (id) {
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      var cd = this.cells[r][c].candy;
      if (cd && cd.id === id) return [r, c];
    }
    return null;
  };
  G.pickFishTarget = function (fr, fc) {
    var best = [], bw = 0, self = this;
    var L = this.left;
    this.eachCell(function (cl, r, c) {
      if (!cl.v || (r === fr && c === fc) || self.fishTargets[r * 100 + c]) return;
      var w = 0;
      if (cl.frost && L.frost > 0) w = 50 + cl.frost * 4;
      else if (cl.lock && L.lock > 0) w = 46;
      else if (cl.jelly && L.jelly > 0) w = 40 + cl.jelly * 4;
      else if (L.ingr > 0 && cl.candy && cl.candy.kind !== 'ingr' && r > 0) {
        var up = self.cell(r - 1, c);
        if (up && up.candy && up.candy.kind === 'ingr') w = 44;
      }
      if (!w && cl.candy && cl.candy.color >= 0 && L['c' + cl.candy.color] > 0) w = 20;
      if (!w && cl.candy && cl.candy.kind !== 'ingr') w = 1;
      if (!w) return;
      if (w > bw) { bw = w; best = [[r, c]]; } else if (w === bw) best.push([r, c]);
    });
    if (!best.length) return null;
    return this.rng.pick(best);
  };
  G.launchFish = function (r, c, color, payload) {
    var tg = this.pickFishTarget(r, c);
    if (!tg) return;
    this.fishTargets[tg[0] * 100 + tg[1]] = 1;
    var dur = 560;
    this.emit({ e: 'fish', from: [r, c], to: tg, color: color, payload: payload, dur: dur });
    var self = this, t0 = this.t;
    this.at(t0 + dur, function () {
      if (payload) self.effectAt(payload, color, tg[0], tg[1]);
      self.hit(tg[0], tg[1], { cause: 'fish' });
    });
  };
  G.effectAt = function (kind, color, r, c) {
    if (kind === 'sh') this.beam(r, c, 'h', color);
    else if (kind === 'sv') this.beam(r, c, 'v', color);
    else if (kind === 'wrap') {
      this.blast(r, c, 1, color);
      var self = this;
      this.at(this.t + 420, function () { self.blast(r, c, 1, color); });
    }
  };

  // clear matched groups; swapCells = [b, a] when caused directly by the player's swap
  G.clearGroups = function (groups, swapCells) {
    var frostHit = {}, self = this;
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var kind = g.kind;
      var n = g.cells.length;
      var pts = (kind === 'bomb' || kind === 'wrap' ? 200 : kind ? 120 : 60) + Math.max(0, n - 5) * 20;
      pts *= (this.cascade + 1);
      var pos = kind ? this.choosePos(g, swapCells, kind) : null;
      if (!pos) kind = null;
      var cr = 0, cc = 0;
      for (var i = 0; i < n; i++) { cr += g.cells[i][0]; cc += g.cells[i][1]; }
      this.addScore(pts, pos ? pos[0] : cr / n, pos ? pos[1] : cc / n, g.color, true);
      for (i = 0; i < n; i++) {
        var r = g.cells[i][0], c = g.cells[i][1];
        var cl = this.cells[r][c];
        for (var d = 0; d < 4; d++) {
          var nb = this.cell(r + DIRS4[d][0], c + DIRS4[d][1]);
          if (nb && nb.frost) frostHit[(r + DIRS4[d][0]) * 100 + c + DIRS4[d][1]] = 1;
        }
        if (pos && pos[0] === r && pos[1] === c) continue;
        var cd = cl.candy;
        if (!cd) continue;
        if (isSpecial(cd) || cl.lock) this.hit(r, c, { cause: 'match' });
        else this.removeCandy(r, c, pos ? 'merge' : 'match', pos);
      }
      if (pos) {
        this.removeCandy(pos[0], pos[1], 'merge', pos);
        this.scheduleCreate(pos[0], pos[1], g.color, kind);
      }
    }
    for (var key in frostHit) this.hit((key / 100) | 0, key % 100, { cause: 'adj' });
  };
  G.scheduleCreate = function (r, c, color, kind) {
    var self = this;
    this.at(this.t + 170, function () {
      var cl = self.cells[r][c];
      if (cl.candy || cl.frost) return;
      var nc = self.newCandy(kind === 'bomb' ? -1 : color, kind);
      cl.candy = nc;
      self.made[KIND_GOAL[kind]]++;
      self.emit({ e: 'create', id: nc.id, r: r, c: c, color: nc.color, kind: kind });
    });
  };
  G.choosePos = function (g, swapCells, kind) {
    var self = this;
    function ok(p) {
      var cl = self.cells[p[0]][p[1]];
      return cl.candy && cl.candy.kind === 'normal' && !cl.lock;
    }
    function inG(p) {
      for (var i = 0; i < g.cells.length; i++) if (g.cells[i][0] === p[0] && g.cells[i][1] === p[1]) return true;
      return false;
    }
    if (swapCells) for (var s = 0; s < swapCells.length; s++) if (inG(swapCells[s]) && ok(swapCells[s])) return swapCells[s];
    var cand = [];
    if (kind === 'wrap') {
      for (var i = 0; i < g.cells.length; i++) {
        var p = g.cells[i], inH = false, inV = false;
        for (var j = 0; j < g.runs.length; j++) {
          var rn = g.runs[j];
          if (rn.dir === 'h' && rn.r === p[0] && p[1] >= rn.c && p[1] < rn.c + rn.len) inH = true;
          if (rn.dir === 'v' && rn.c === p[1] && p[0] >= rn.r && p[0] < rn.r + rn.len) inV = true;
        }
        if (inH && inV && ok(p)) cand.push(p);
      }
    } else if (kind === 'fish' && !g.runs.length) {
      for (i = 0; i < g.cells.length; i++) if (ok(g.cells[i])) cand.push(g.cells[i]);
    } else {
      var best = null;
      for (j = 0; j < g.runs.length; j++) if (!best || g.runs[j].len > best.len) best = g.runs[j];
      if (best) {
        for (i = 0; i < best.len; i++) {
          var q = best.dir === 'h' ? [best.r, best.c + i] : [best.r + i, best.c];
          if (ok(q)) cand.push(q);
        }
        var mid = (best.len - 1) / 2;
        cand.sort(function (a, b) {
          var ia = best.dir === 'h' ? a[1] - best.c : a[0] - best.r;
          var ib = best.dir === 'h' ? b[1] - best.c : b[0] - best.r;
          return Math.abs(ia - mid) - Math.abs(ib - mid);
        });
      }
    }
    if (!cand.length) for (i = 0; i < g.cells.length; i++) if (ok(g.cells[i])) cand.push(g.cells[i]);
    if (!cand.length) return null;
    for (i = 0; i < cand.length; i++) {
      var cd = this.cells[cand[i][0]][cand[i][1]].candy;
      if (cd.moved) return cand[i];
    }
    return cand[0];
  };

  // player swapped two specials (or a color bomb with anything)
  G.comboSwap = function (a, b) {
    var X = this.cells[b[0]][b[1]].candy, Y = this.cells[a[0]][a[1]].candy;
    var r = b[0], c = b[1];
    var kx = X.kind, ky = Y.kind;
    var self = this;
    function isStripe(k) { return k === 'sh' || k === 'sv'; }
    function consume(pos, cd) {
      var gl = self.countKind(cd.kind);
      self.emit({ e: 'activate', id: cd.id, r: pos[0], c: pos[1], kind: cd.kind, goal: gl, combo: true });
      self.removeCandy(pos[0], pos[1], 'self');
    }
    this.emit({ e: 'combo', r: r, c: c, a: a, kinds: [kx, ky] });
    if (kx === 'bomb' && ky === 'bomb') {
      consume(a, Y); consume(b, X);
      this.emit({ e: 'bombfx', r: r, c: c, color: -1, big: true, dur: 900 });
      this.emit({ e: 'shake', p: 14 });
      var all = [];
      this.eachCell(function (cl, rr, cc) { if (cl.v) all.push({ r: rr, c: cc, d: Math.hypot(rr - r, cc - c) }); });
      all.sort(function (p, q) { return p.d - q.d; });
      var t0 = this.t;
      all.forEach(function (p) { self.at(t0 + 300 + p.d * 70, self.hit.bind(self, p.r, p.c, { cause: 'bolt' })); });
      return;
    }
    if (kx === 'bomb' || ky === 'bomb') {
      var bomb = kx === 'bomb' ? X : Y, bpos = kx === 'bomb' ? b : a;
      var other = kx === 'bomb' ? Y : X;
      consume(bpos, bomb);
      var conv = null;
      if (isStripe(other.kind)) conv = 'stripe';
      else if (other.kind === 'wrap') conv = 'wrap';
      else if (other.kind === 'fish') conv = 'fish';
      this.colorClear(other.color, bpos[0], bpos[1], conv);
      return;
    }
    if (isStripe(kx) && isStripe(ky)) {
      consume(a, Y); consume(b, X);
      this.beam(r, c, 'h', X.color);
      this.beam(r, c, 'v', Y.color);
      return;
    }
    if ((isStripe(kx) && ky === 'wrap') || (kx === 'wrap' && isStripe(ky))) {
      consume(a, Y); consume(b, X);
      this.emit({ e: 'shake', p: 10 });
      for (var d = -1; d <= 1; d++) {
        if (this.inBounds(r + d, c)) { if (d) this.hitAtOnce(r + d, c); this.beam(r + d, c, 'h', X.color); }
        if (this.inBounds(r, c + d)) { if (d) this.hitAtOnce(r, c + d); this.beam(r, c + d, 'v', Y.color); }
      }
      return;
    }
    if (kx === 'wrap' && ky === 'wrap') {
      consume(a, Y);
      X.primed = true; X.radius = 2;
      var gl = this.countKind('wrap');
      this.emit({ e: 'prime', id: X.id, r: r, c: c, big: true, goal: gl });
      this.blast(r, c, 2, X.color);
      this.emit({ e: 'shake', p: 12 });
      return;
    }
    if (kx === 'fish' && ky === 'fish') {
      consume(a, Y); consume(b, X);
      for (var i = 0; i < 3; i++) this.launchFish(r, c, i === 0 ? X.color : Y.color, null);
      return;
    }
    // fish + stripe / wrap
    var fish = kx === 'fish' ? X : Y, pay = kx === 'fish' ? Y : X;
    consume(a, Y); consume(b, X);
    this.launchFish(r, c, fish.color, pay.kind === 'wrap' ? 'wrap' : pay.kind);
  };
  G.inBounds = function (r, c) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols; };
  G.hitAtOnce = function (r, c) { this.hit(r, c, { cause: 'beam' }); };

  // ---------- gravity / refill ----------
  G.spawnCandy = function () {
    if (this.ingrTotal && this.ingrSpawned < this.ingrTotal &&
        this.ingrOnBoard < (this.level.ingrMax || 1) && this.movesSinceIngr >= (this.level.ingrEvery || 3)) {
      this.ingrSpawned++; this.ingrOnBoard++; this.movesSinceIngr = 0;
      return { id: this.nid++, color: -1, kind: 'ingr', ingr: (this.ingrFlip++ % 2) ? 'nut' : 'cherry' };
    }
    return this.newCandy(this.rng.int(this.colors));
  };
  G.fall = function () {
    var R = this.rows, C = this.cols, cells = this.cells;
    var paths = {}, order = [], spawns = [], spawnIdx = [];
    var r, c;
    for (c = 0; c < C; c++) spawnIdx.push(0);
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) if (cells[r][c].candy) cells[r][c].candy.moved = false;
    var self = this;
    function move(fr, fc, tr, tc) {
      var cd = cells[fr][fc].candy;
      cells[fr][fc].candy = null;
      cells[tr][tc].candy = cd;
      cd.moved = true;
      if (!paths[cd.id]) { paths[cd.id] = [[fr, fc]]; order.push(cd.id); }
      paths[cd.id].push([tr, tc]);
    }
    for (var pass = 0; pass < 120; pass++) {
      var changed = false;
      var flip = this.rng.next() < 0.5;
      for (r = R - 1; r >= 0; r--) {
        for (var ci = 0; ci < C; ci++) {
          c = flip ? C - 1 - ci : ci;
          var cell = cells[r][c];
          if (!cell.v || cell.frost || cell.candy) continue;
          var sr = r - 1;
          while (sr >= 0 && !cells[sr][c].v) sr--;
          if (sr < 0) {
            var cd = this.spawnCandy();
            cd.moved = true;
            cell.candy = cd;
            spawns.push({ id: cd.id, c: c, idx: spawnIdx[c]++, candy: { id: cd.id, color: cd.color, kind: cd.kind, ingr: cd.ingr } });
            paths[cd.id] = [[r, c]];
            order.push(cd.id);
            changed = true;
            continue;
          }
          var src = cells[sr][c];
          if (src.candy && !src.lock && !src.frost) { move(sr, c, r, c); changed = true; continue; }
          if (!src.candy && !src.frost) continue; // wait for it to fill
          // blocked above: slide diagonally
          var dcs = this.rng.next() < 0.5 ? [-1, 1] : [1, -1];
          for (var k = 0; k < 2; k++) {
            var cc = c + dcs[k];
            if (cc < 0 || cc >= C) continue;
            var d = this.cell(r - 1, cc);
            if (!d || !d.candy || d.lock || d.frost) continue;
            var below = cells[r][cc];
            if (below.v && !below.frost && !below.candy) continue; // it will fall straight instead
            move(r - 1, cc, r, c);
            changed = true;
            break;
          }
        }
      }
      if (!changed) break;
    }
    var moves = [];
    for (var i = 0; i < order.length; i++) moves.push({ id: order[i], path: paths[order[i]] });
    if (order.length) this.acts++;
    return { type: 'fall', moves: moves, spawns: spawns };
  };
  G.processExits = function () {
    for (var c = 0; c < this.cols; c++) {
      var r = this.exitRow[c];
      if (r < 0) continue;
      var cl = this.cells[r][c];
      if (cl.candy && cl.candy.kind === 'ingr') {
        var cd = cl.candy;
        cl.candy = null;
        this.ingrOnBoard--;
        var goal = this.dec('ingr');
        this.emit({ e: 'exit', id: cd.id, r: r, c: c, ingr: cd.ingr, goal: goal, dur: 500 });
        this.addScore(5000, r, c, -1, true);
      }
    }
  };
  G.detonatePrimed = function () {
    var list = [];
    this.eachCell(function (cl, r, c) { if (cl.v && cl.candy && cl.candy.primed) list.push([r, c, cl.candy.id]); });
    var self = this;
    list.forEach(function (p, i) {
      self.at(60 + i * 90, function () {
        var pos = self.findCandy(p[2]);
        if (pos) self.hit(pos[0], pos[1], { cause: 'chain' });
      });
    });
  };
  G.settle = function (phases) {
    for (var guard = 0; guard < 80; guard++) {
      var f = this.fall();
      if (f.moves.length) phases.push(f);
      this.cascade++;
      this.beginResolve();
      this.processExits();
      this.detonatePrimed();
      var groups = this.findMatches();
      if (groups.length) this.clearGroups(groups, null);
      this.runQueue();
      var ph = this.endResolve();
      if (!ph.changed) break;
      phases.push(ph);
    }
  };
  G.endTurn = function (phases) {
    if (this.goalsDone()) { this.state = 'won'; phases.push({ type: 'end', state: 'won' }); return; }
    if (this.moves <= 0) { this.state = 'lost'; phases.push({ type: 'end', state: 'lost' }); return; }
    if (!this.hasMove()) phases.push(this.shuffle());
  };

  // ---------- player actions ----------
  G.swap = function (a, b, free) {
    if (this.state !== 'play' || !this.canSwap(a, b)) return { ok: false, phases: null };
    var ca = this.cells[a[0]][a[1]].candy, cb = this.cells[b[0]][b[1]].candy;
    var combo = this.isCombo(ca, cb);
    this.rawSwap(a, b);
    var groups = combo ? null : this.findMatches();
    if (!combo && !groups.length && !free) {
      this.rawSwap(a, b);
      return { ok: false, phases: [{ type: 'swap', a: a, b: b, ok: false, ida: ca.id, idb: cb.id }] };
    }
    if (!free) this.moves--;
    this.movesSinceIngr++;
    var phases = [{ type: 'swap', a: a, b: b, ok: true, ida: ca.id, idb: cb.id }];
    this.cascade = 0;
    this.beginResolve();
    if (combo) this.comboSwap(a, b);
    else if (groups.length) this.clearGroups(groups, [b, a]);
    this.runQueue();
    var ph = this.endResolve();
    if (ph.changed) phases.push(ph);
    this.settle(phases);
    this.endTurn(phases);
    return { ok: true, phases: phases };
  };
  G.hammer = function (r, c) {
    var cl = this.cell(r, c);
    if (!cl || this.state !== 'play') return null;
    if (!cl.frost && !cl.lock && (!cl.candy || cl.candy.kind === 'ingr')) return null;
    var phases = [];
    this.cascade = 0;
    this.beginResolve();
    this.emit({ e: 'hammer', r: r, c: c });
    var self = this;
    this.at(260, function () { self.hit(r, c, { cause: 'hammer' }); });
    this.runQueue();
    phases.push(this.endResolve());
    this.settle(phases);
    this.endTurn(phases);
    return phases;
  };
  G.wand = function (r, c) {
    var cl = this.cell(r, c);
    if (!cl || !cl.candy || cl.lock || cl.candy.kind !== 'normal' || this.state !== 'play') return null;
    this.beginResolve();
    cl.candy.kind = 'bomb';
    cl.candy.color = -1;
    this.emit({ e: 'convert', id: cl.candy.id, r: r, c: c, kind: 'bomb', color: -1, wand: true });
    return [this.endResolve()];
  };
  G.shuffle = function () {
    var pos = [], cds = [], self = this;
    this.eachCell(function (cl, r, c) {
      if (cl.v && cl.candy && !cl.lock && !cl.frost && cl.candy.kind !== 'ingr') { pos.push([r, c]); cds.push(cl.candy); }
    });
    var ok = false;
    for (var attempt = 0; attempt < 300 && !ok; attempt++) {
      if (attempt > 60) {
        for (var i = 0; i < cds.length; i++) if (cds[i].kind === 'normal') cds[i].color = this.rng.int(this.colors);
      }
      this.rng.shuffle(cds);
      for (i = 0; i < pos.length; i++) this.cells[pos[i][0]][pos[i][1]].candy = cds[i];
      ok = !this.findMatches().length && this.hasMove();
    }
    var moves = [];
    for (i = 0; i < pos.length; i++) {
      var cd = this.cells[pos[i][0]][pos[i][1]].candy;
      moves.push({ id: cd.id, r: pos[i][0], c: pos[i][1], color: cd.color, kind: cd.kind });
    }
    this.acts++;
    return { type: 'shuffle', moves: moves, ok: ok };
  };
  G.shuffleBooster = function () {
    if (this.state !== 'play') return null;
    var phases = [this.shuffle()];
    return phases;
  };
  G.addMoves = function (n) {
    this.moves += n;
    if (this.state === 'lost') this.state = 'play';
  };
  G.applyPre = function (kind) {
    var list = [], self = this;
    this.eachCell(function (cl, r, c) {
      if (cl.v && cl.candy && cl.candy.kind === 'normal' && !cl.lock) list.push([r, c]);
    });
    this.rng.shuffle(list);
    if (kind === 'moves') { this.moves += 3; return; }
    if (kind === 'bomb' && list.length) {
      var cd = this.cells[list[0][0]][list[0][1]].candy;
      cd.kind = 'bomb'; cd.color = -1;
    }
    if (kind === 'sw' && list.length > 1) {
      this.cells[list[0][0]][list[0][1]].candy.kind = this.rng.next() < 0.5 ? 'sh' : 'sv';
      this.cells[list[1][0]][list[1][1]].candy.kind = 'wrap';
    }
  };

  // Sugar-rush bonus once goals are complete: fire every special, then convert leftover moves into stripes.
  G.bonus = function () {
    var phases = [];
    this.state = 'bonus';
    var self = this;
    for (var round = 0; round < 40; round++) {
      var specials = [];
      this.eachCell(function (cl, r, c) { if (cl.v && cl.candy && isSpecial(cl.candy)) specials.push(cl.candy.id); });
      this.cascade = 0;
      this.beginResolve();
      if (specials.length) {
        specials.forEach(function (id, i) {
          self.at(i * 140, function () {
            var p = self.findCandy(id);
            if (p) self.hit(p[0], p[1], { cause: 'chain' });
          });
        });
      } else if (this.moves > 0) {
        var list = [];
        this.eachCell(function (cl, r, c) {
          if (cl.v && cl.candy && cl.candy.kind === 'normal' && !cl.lock) list.push([r, c]);
        });
        this.rng.shuffle(list);
        var n = Math.min(this.moves, list.length, 12);
        if (!n) break;
        list.slice(0, n).forEach(function (p, i) {
          self.at(i * 130, function () {
            self.moves--;
            var cd = self.cells[p[0]][p[1]].candy;
            if (!cd) return;
            cd.kind = self.rng.next() < 0.5 ? 'sh' : 'sv';
            self.emit({ e: 'convert', id: cd.id, r: p[0], c: p[1], kind: cd.kind, color: cd.color, bonus: true, moves: self.moves });
            self.addScore(1000, p[0], p[1], cd.color, true);
          });
        });
      } else break;
      this.runQueue();
      var ph = this.endResolve();
      phases.push(ph);
      this.settle(phases);
    }
    this.state = 'won';
    phases.push({ type: 'end', state: 'won' });
    return phases;
  };

  G.stars = function () {
    var s = this.level.stars || [1, 2, 3];
    return this.score >= s[2] ? 3 : this.score >= s[1] ? 2 : 1;
  };

  G.clone = function () {
    var g = Object.create(Game.prototype);
    for (var k in this) if (Object.prototype.hasOwnProperty.call(this, k)) g[k] = this[k];
    g.rng = new RNG(1); g.rng.s = this.rng.s;
    g.cells = this.cells.map(function (row) {
      return row.map(function (cl) {
        return { v: cl.v, jelly: cl.jelly, frost: cl.frost, lock: cl.lock, candy: cl.candy ? Object.assign({}, cl.candy) : null };
      });
    });
    g.left = Object.assign({}, this.left);
    g.made = Object.assign({}, this.made);
    g.record = false;
    g.events = []; g.q = [];
    g.fishTargets = {};
    return g;
  };

  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  var Model = { Game: Game, RNG: RNG, isSpecial: isSpecial };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(typeof window !== 'undefined' ? window : this);
