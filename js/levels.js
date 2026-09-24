/* Sugar Burst — level definitions.
 * layout codes: '.' cell  '#' hole  j/J jelly x1/x2  1/2/3 frosting hp  l lock  L lock+jelly
 *               a frost1+jelly  b frost2+jelly  c/n cherry/nut ingredient  H/V/W/B/F preset specials
 * moves & stars come from tools/tune.js (TUNING below is generated) — values here are fallbacks.
 */
(function (root) {
  'use strict';
  function full(rows, cols, ch) {
    var out = [];
    for (var r = 0; r < rows; r++) out.push(new Array(cols + 1).join(ch || '.'));
    return out;
  }
  var C = { red: 0, orange: 1, yellow: 2, green: 3, blue: 4, purple: 5 };

  var HAND = [
    // 1
    { layout: full(7, 7), colors: 5, goals: [{ type: 'score', n: 3000 }], tip: 'basic' },
    // 2
    { layout: full(8, 8), colors: 5, goals: [{ type: 'collect', color: C.red, n: 20 }, { type: 'collect', color: C.blue, n: 20 }], tip: 'striped' },
    // 3
    { layout: ['#......#', '........', '........', '........', '........', '........', '........', '#......#'],
      colors: 5, goals: [{ type: 'collect', color: C.yellow, n: 25 }, { type: 'kind', kind: 'wrap', n: 1 }], tip: 'wrapped' },
    // 4
    { layout: full(9, 9), colors: 5, goals: [{ type: 'collect', color: C.green, n: 35 }, { type: 'kind', kind: 'stripe', n: 2 }], tip: 'bomb' },
    // 5
    { layout: ['##.....##', '#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#', '##.....##'],
      colors: 5, goals: [{ type: 'kind', kind: 'fish', n: 3 }, { type: 'score', n: 8000 }], tip: 'fish' },
    // 6
    { layout: ['.........', '.........', '..jjjjj..', '..jjjjj..', '..jjjjj..', '..jjjjj..', '..jjjjj..', '.........', '.........'],
      colors: 5, goals: [{ type: 'jelly' }], tip: 'jelly' },
    // 7 heart
    { layout: ['#jj###jj#', 'jjjj#jjjj', 'jjjjjjjjj', 'jjjjjjjjj', '#jjjjjjj#', '##jjjjj##', '###jjj###', '####j####'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 8
    { layout: ['.........', '.........', '.........', '1.1.1.1.1', '.1.1.1.1.', '.........', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'frost' }], tip: 'frost' },
    // 9
    { layout: ['22.....22', '2.......2', '.........', '.........', '.........', '.........', '.........', '2.......2', '22.....22'],
      colors: 5, goals: [{ type: 'frost' }, { type: 'collect', color: C.orange, n: 25 }] },
    // 10
    { layout: ['....c....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'ingr', n: 2 }], tip: 'ingr' },
    // 11
    { layout: ['JJ.....JJ', 'J.......J', '..jjjjj..', '..j...j..', '..j...j..', '..jjjjj..', 'J.......J', 'JJ.....JJ'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 12
    { layout: ['.........', '.........', '.l.l.l.l.', '.........', 'l.l.l.l.l', '.........', '.l.l.l.l.', '.........', '.........'],
      colors: 5, goals: [{ type: 'lock' }], tip: 'lock' },
    // 13
    { layout: ['.jjjjjjj.', '.jjjjjjj.', '.........', '1.1.1.1.1', '.1.1.1.1.', '.........', 'jjjjjjjjj', 'jjjjjjjjj', '.........'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 14
    { layout: full(9, 9), colors: 5, goals: [{ type: 'kind', kind: 'stripe', n: 5 }, { type: 'kind', kind: 'wrap', n: 3 }], tip: 'combo' },
    // 15
    { layout: ['...c.n...', '.........', '.l.....l.', '..l...l..', '...l.l...', '....l....', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'ingr', n: 2 }, { type: 'lock' }] },
    // 16
    { layout: ['.........', '.........', '.3.3.3.3.', '.........', '2.2.2.2.2', '.........', '.1.1.1.1.', '.........', '.........'],
      colors: 5, goals: [{ type: 'frost' }] },
    // 17 X
    { layout: ['jjj...jjj', 'jjjj.jjjj', '.jjjjjjj.', '..jjjjj..', '...jjj...', '..jjjjj..', '.jjjjjjj.', 'jjjj.jjjj', 'jjj...jjj'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 18
    { layout: full(9, 9), colors: 6, goals: [{ type: 'collect', color: C.red, n: 25 }, { type: 'collect', color: C.green, n: 25 }, { type: 'collect', color: C.purple, n: 25 }] },
    // 19
    { layout: ['.........', '.........', '2.......2', '.2.....2.', '..2...2..', '.........', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'ingr', n: 3 }, { type: 'frost' }] },
    // 20
    { layout: ['.........', '.LLL.LLL.', '.L.....L.', '.L.jjj.L.', '...jjj...', '.L.jjj.L.', '.L.....L.', '.LLL.LLL.', '.........'],
      colors: 5, goals: [{ type: 'jelly' }, { type: 'lock' }] },
    // 21 hourglass
    { layout: ['.........', '#.......#', '##.....##', '###...###', '###...###', '###...###', '##.....##', '#.......#', '.........'],
      colors: 5, goals: [{ type: 'collect', color: C.blue, n: 35 }, { type: 'collect', color: C.orange, n: 35 }] },
    // 22
    { layout: ['.........', '.........', '...333...', '...333...', '...333...', '.........', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'frost' }, { type: 'score', n: 20000 }] },
    // 23
    { layout: ['jjjjjjjjj', 'jJjjjjjJj', 'jjjjjjjjj', 'jjjJjJjjj', 'jjjjJjjjj', 'jjjJjJjjj', 'jjjjjjjjj', 'jJjjjjjJj', 'jjjjjjjjj'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 24
    { layout: ['.........', '.........', '.........', '.#.#.#.#.', '.........', '.#.#.#.#.', '.........', '.........', '.........'],
      colors: 5, goals: [{ type: 'ingr', n: 4 }], ingrMax: 2 },
    // 25
    { layout: full(9, 9), colors: 4, goals: [{ type: 'kind', kind: 'bomb', n: 2 }, { type: 'kind', kind: 'wrap', n: 3 }] },
    // 26
    { layout: ['l.l.l.l.l', '.........', '1.1.1.1.1', '.l.l.l.l.', '.........', '2.2.2.2.2', '.l.l.l.l.', '.........', 'l.l.l.l.l'],
      colors: 5, goals: [{ type: 'lock' }, { type: 'frost' }] },
    // 27 diamond
    { layout: ['....#....', '...jjj...', '..jj1jj..', '.jj1j1jj.', '#j1jJj1j#', '.jj1j1jj.', '..jj1jj..', '...jjj...', '....#....'],
      colors: 5, goals: [{ type: 'jelly' }, { type: 'frost' }] },
    // 28
    { layout: ['.........', '.........', '.........', '.........', 'jjjjjjjjj', 'jjjjjjjjj', 'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ'],
      colors: 5, goals: [{ type: 'jelly' }] },
    // 29
    { layout: ['...c.....', '.........', '.........', 'jjjjjjjjj', '.........', '.........', 'jjjjjjjjj', '.........', 'jjjjjjjjj'],
      colors: 5, goals: [{ type: 'ingr', n: 2 }, { type: 'jelly' }] },
    // 30
    { layout: ['L.......L', '.2.....2.', '..jjjjj..', '..jJJJj..', 'l.jJBJj.l', '..jJJJj..', '..jjjjj..', '.2.....2.', 'L.......L'],
      colors: 5, goals: [{ type: 'jelly' }, { type: 'lock' }, { type: 'frost' }] }
  ];

  // ---------- procedural levels (31+) ----------
  var MASKS = [
    full(9, 9),
    ['#.......#', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '#.......#'],
    ['##.....##', '#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#', '##.....##'],
    ['.........', '.........', '.........', '...#.#...', '.........', '...#.#...', '.........', '.........', '.........'],
    ['.........', '.#.....#.', '.........', '.........', '....#....', '.........', '.........', '.#.....#.', '.........'],
    ['###...###', '##.....##', '#.......#', '.........', '.........', '.........', '#.......#', '##.....##', '###...###'],
    ['.........', '.........', '##.....##', '##.....##', '.........', '.........', '.........', '.........', '.........'],
    ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    ['#.......#', '#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#', '#.......#'],
    ['...###...', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...###...']
  ];

  function RNG(seed) { this.s = seed >>> 0; }
  RNG.prototype.next = function () {
    var t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };

  function genLevel(n, salt) {
    var rng = new RNG(n * 7919 + (salt || 0) * 104729 + 17);
    var mask = MASKS[rng.int(MASKS.length)].map(function (s) { return s.split(''); });
    var rows = mask.length, cols = mask[0].length;
    var kinds = ['jelly', 'frost', 'lock', 'ingr', 'collect', 'jelly', 'frost'];
    var a = kinds[rng.int(kinds.length)], b = kinds[rng.int(kinds.length)];
    var use = {};
    use[a] = 1;
    if (rng.next() < 0.6) use[b] = 1;
    var colors = rng.next() < Math.min(0.45, (n - 30) * 0.02) ? 6 : 5;
    function sym(fn) { // mirror left/right for pleasing boards
      for (var r = 0; r < rows; r++) for (var c = 0; c <= (cols - 1) / 2; c++) {
        if (mask[r][c] === '#') continue;
        var ch = fn(r, c, mask[r][c]);
        if (ch) { mask[r][c] = ch; mask[r][cols - 1 - c] = ch; }
      }
    }
    if (use.jelly) {
      var style = rng.int(4), dbl = rng.next() < 0.35 + (n - 30) * 0.01;
      sym(function (r, c) {
        var on = style === 0 ? true
          : style === 1 ? (r + c) % 2 === 0
          : style === 2 ? r >= rows - 4
          : Math.abs(r - (rows - 1) / 2) + Math.abs(c - (cols - 1) / 2) <= 4;
        if (!on) return null;
        return dbl && (r + c) % 3 === 0 ? 'J' : 'j';
      });
    }
    if (use.frost) {
      var fs = rng.int(3), hp = 1 + rng.int(Math.min(3, 1 + ((n - 30) / 8) | 0));
      sym(function (r, c, ch) {
        if (ch !== '.' && ch !== 'j') return null;
        var on = fs === 0 ? (r === 3 || r === 5) && c % 2 === 0
          : fs === 1 ? (r >= 3 && r <= 5 && c >= 3)
          : (r === 2 || r === 6) && c % 2 === 1;
        if (!on || r >= rows - 1) return null;
        return ch === 'j' ? 'a' : String(hp);
      });
    }
    if (use.lock) {
      var ls = rng.int(3);
      sym(function (r, c, ch) {
        if (ch !== '.' && ch !== 'j') return null;
        var on = ls === 0 ? (r % 3 === 1 && c % 2 === 1) : ls === 1 ? (r === c || r === cols - 1 - c) : (r === 4 || c === 4) && (r + c) % 2 === 0;
        if (!on) return null;
        return ch === 'j' ? 'L' : 'l';
      });
    }
    var goals = [];
    if (use.jelly) goals.push({ type: 'jelly' });
    if (use.frost) goals.push({ type: 'frost' });
    if (use.lock) goals.push({ type: 'lock' });
    if (use.ingr) {
      goals.push({ type: 'ingr', n: 2 + rng.int(3) });
      // an ingredient needs a clear bottom: strip frost from the last two rows
      for (var r = rows - 2; r < rows; r++) for (var c = 0; c < cols; c++) if ('123ab'.indexOf(mask[r][c]) >= 0) mask[r][c] = '.';
    }
    if (use.collect || !goals.length) {
      var c1 = rng.int(colors), c2 = (c1 + 1 + rng.int(colors - 1)) % colors;
      goals.push({ type: 'collect', color: c1, n: 30 + rng.int(20) });
      if (goals.length < 3 && rng.next() < 0.5) goals.push({ type: 'collect', color: c2, n: 25 + rng.int(20) });
    }
    return { layout: mask.map(function (row) { return row.join(''); }), colors: colors, goals: goals, ingrMax: 2, gen: salt || 0 };
  }

  var COUNT = 60;
  var TUNING = root.LEVEL_TUNING || {};
  function get(n) {
    var lv = n <= HAND.length ? JSON.parse(JSON.stringify(HAND[n - 1])) : genLevel(n, (TUNING[n] && TUNING[n].salt) || 0);
    lv.id = n;
    var t = TUNING[n];
    lv.moves = t ? t.moves : lv.moves || 25;
    lv.stars = t ? t.stars : lv.stars || [2000, 6000, 12000];
    return lv;
  }

  var Levels = { COUNT: COUNT, HAND: HAND, get: get, genLevel: genLevel, COLORS: C };
  if (typeof module !== 'undefined' && module.exports) module.exports = Levels;
  else root.Levels = Levels;
})(typeof window !== 'undefined' ? window : globalThis);
