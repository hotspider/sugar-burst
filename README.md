# Sugar Burst

An original candy-themed match-3 H5 game. Standard web layout: `index.html`, `css/`, `js/`, and an `assets/` folder of PNG/JPG images and MP3 audio listed in `assets/manifest.json`. No third-party libraries or external requests.

**Play online:** https://hotspider.github.io/sugar-burst/

- 60 levels across 6 themed worlds, with move counts balanced by thousands of simulated bot games
- Special candies: Striped (match 4), Wrapped (L/T shape), Rainbow (match 5), Gummy Fish (2×2 square)
- Super combos: every pair of special candies has its own effect; two Rainbow Candies clear the whole board
- Goals: score, collect colors, clear jelly, break frosting, open candy cages, bring ingredients down, fire specials
- Boosters: Lolly Mallet, Free Swap, Magic Shuffle, Rainbow Wand, plus 3 pre-level boosters, a coin shop and a daily bonus
- Rewarded ads for coins (+100, 8 per day): map button, shop, "not enough coins" dialogs, and "Double it" after a win
- World map with fog over unreached levels; clearing a level rolls the fog back, unlocks the next node and moves the mascot
- Art and audio were generated procedurally (Canvas / Web Audio) and exported to regular asset files, so artists can replace any image or sound by file name
- Loading screen with progress bar; seamless music loops; per-file load timeouts

## Plugging in a real ad network

The game ships with a built-in demo ad so the reward flow works everywhere. To serve real rewarded ads, define one of these in `index.html` before the game scripts:

```js
// Any SDK: call cb(true) only when the player earned the reward
window.SugarAds = { showRewarded(cb) { /* show your rewarded ad */ } };
```

or load Google's H5 Games Ads (Ad Placement API) so `window.adBreak` exists; the game calls `adBreak({ type: 'reward', ... })` automatically.
