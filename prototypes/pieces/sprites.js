/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — WORLD SPRITE PACK (v1, prototype)
 *  Classic script: no modules, no build, no dependencies. Runs from file://.
 *
 *  USAGE
 *    <script src="sprites.js"></script>
 *    SPRITES.injectAnimCSS();               // once per document, before first paint
 *    el.innerHTML = SPRITES.lampPost();     // every entry returns a full <svg> string
 *    el.innerHTML = SPRITES.car(2);         // index 0..3 -> four dusk-muted bodies
 *
 *  MOTION (the pack animates itself — transform/opacity only)
 *    - SPRITES.animCSS          the whole stylesheet, as one string
 *    - SPRITES.injectAnimCSS()  appends it as <style id="sprites-anim"> once;
 *                               returns true when it injected, false if already there
 *    - the host only places sprites and adds two wrapper classes when needed:
 *        .walking   -> NPC kid walk cycle (legs swing, arms counter-swing,
 *                      body bob + tilt, head lags). Wrap the sprite.
 *        .rolling   -> car wheels spin. Wrap a car while it is moving.
 *    - everything else is self-running: idle breathing, ghost drift, flame
 *      flicker, glow pulse, bat flutter, web sway, spider dangle, scarecrow
 *      sway, carved-face glow, beam pulse
 *    - one kill switch: @media (prefers-reduced-motion: reduce) disables all of it
 *
 *  CONTRACT (ART-STYLE.md §3 §4 §7)
 *    - rounded shapes, NO hard outlines; depth comes from darker-shade shapes
 *    - palette tokens only (indigo/green night world, warm amber lights)
 *    - NO ground shadows and NO text baked in — the host adds both
 *    - class hooks (stable API; the pack's own CSS uses them):
 *        .s-body        main mass (bob / squash; kids only)
 *        .head          head (tilt; kids only)
 *        .arm .arm-l .arm-r  arm or sleeve (swing; transform-origin set inline —
 *                      never give .arm a transform-box, it would move the pivot)
 *        .leg-l .leg-r  feet (swing)
 *        .drift         group that floats (npcGhost body)
 *        .sway          group that sways (scarecrow upper body)
 *        .glow          light halo (lampPost, candleLantern, passerCar)
 *        .flame         candle flame
 *        .lens .beam    passerCar headlight (pulse)
 *        .wheel         car wheel (spins under .rolling)
 *        .bat           one bat inside bats() (flutter, staggered)
 *        .web           cobweb threads (sway from the corner)
 *        .spider .spider-body  cobweb tenant: bob on the silk + offset sway
 *        .carve .carve-b  lit jack-o'-lantern openings (.carve-b = out of phase)
 *    - a <g> that carries a placement transform="..." must NOT be the animated
 *      element: a CSS transform overrides the transform attribute
 *    - every root <svg> is class="sprite" with data-sprite="<name>"
 * ============================================================================
 */
(function () {
  'use strict';

  /* palette tokens — ART-STYLE.md §3 ------------------------------------- */
  var C = {
    night0: '#191231', night1: '#241d45', night2: '#3a2c5f', night3: '#59406b',
    moon: '#fff6dd', moonSoft: '#ffeccf', glow: '#ffd9a0',
    ink: '#3a2f4e',
    amber: '#ffd166', amberDeep: '#e8a93a',
    pumpkin: '#ff9e57', pumpkinDeep: '#e8874a', pumpkinLite: '#ffb27a',
    stem: '#7fb069', stemLite: '#95c47d',
    road: '#3a2e4c', sidewalk: '#57446c', grass: '#443a63', fence: '#6b5785',
    skin: '#ffd9b8', skinSage: '#cfe8d2', skinPale: '#efe6f7', hair: '#f2d0a0',
    milo: '#6672df', miloDeep: '#4a54b0', miloHat: '#7c5cff', miloBand: '#5d43d6',
    sheet: '#f6f0ff', sheetShade: '#e4d9f5',
    witchHat: '#43326b', witchHatLite: '#4d3a7c', witchHair: '#7a5cff'
  };
  /* muted dusk car bodies — four tones of the same family */
  var CARS = [
    { body: '#7c7ba6', dark: '#615f88' },
    { body: '#a97b93', dark: '#8a6178' },
    { body: '#9a8fc0', dark: '#7b71a2' },
    { body: '#c98a4b', dark: '#a86f3a' }
  ];

  /* helpers -------------------------------------------------------------- */
  function r2(v) { return Math.round(v * 100) / 100; }

  function svg(name, w, h, parts) {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="sprite" data-sprite="' + name +
      '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      parts.join('') + '</svg>';
  }

  /* one calm cute face: eyes + sparks + blush + smile */
  function face(cx, cy, o) {
    o = o || {};
    var dx = o.eyeDx == null ? 5.2 : o.eyeDx,
      rx = o.eyeRx == null ? 1.85 : o.eyeRx,
      ry = o.eyeRy == null ? 2.05 : o.eyeRy,
      bdx = o.blushDx == null ? dx + 2.2 : o.blushDx,
      bdy = o.blushDy == null ? 4.4 : o.blushDy,
      mw = o.mouthW == null ? dx * 0.58 : o.mouthW,
      md = o.mouthD == null ? 2 : o.mouthD,
      ys = cy + dx * 1.12;
    var s = '<ellipse cx="' + r2(cx - dx) + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + C.ink + '"/>' +
      '<ellipse cx="' + r2(cx + dx) + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + C.ink + '"/>' +
      '<circle cx="' + r2(cx - dx + 0.6) + '" cy="' + r2(cy - ry * 0.5) + '" r="0.62" fill="#fff"/>' +
      '<circle cx="' + r2(cx + dx + 0.6) + '" cy="' + r2(cy - ry * 0.5) + '" r="0.62" fill="#fff"/>';
    if (o.blush !== false) {
      s += '<ellipse cx="' + r2(cx - bdx) + '" cy="' + r2(cy + bdy) + '" rx="2.3" ry="1.6" fill="#ffb8a8" opacity=".8"/>' +
        '<ellipse cx="' + r2(cx + bdx) + '" cy="' + r2(cy + bdy) + '" rx="2.3" ry="1.6" fill="#ffb8a8" opacity=".8"/>';
    }
    return s + '<path d="M' + r2(cx - mw) + ' ' + r2(ys) + ' Q' + cx + ' ' + r2(ys + md) + ' ' +
      r2(cx + mw) + ' ' + r2(ys) + '" stroke="' + C.ink + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
  }

  /* big friendly ghost eyes (used by the sheet kid) */
  function ghostEyes() {
    return '<ellipse cx="21.5" cy="30" rx="4.6" ry="4" fill="' + C.ink + '"/>' +
      '<ellipse cx="34.5" cy="30" rx="4.6" ry="4" fill="' + C.ink + '"/>' +
      '<circle cx="23.1" cy="28.4" r="1.5" fill="#fff"/><circle cx="36.1" cy="28.4" r="1.5" fill="#fff"/>' +
      '<ellipse cx="14.6" cy="38.6" rx="2.9" ry="1.9" fill="#e7c6e0" opacity=".85"/>' +
      '<ellipse cx="41.4" cy="38.6" rx="2.9" ry="1.9" fill="#e7c6e0" opacity=".85"/>' +
      '<path d="M24 39.6 Q28 43 32 39.6" stroke="' + C.ink + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>';
  }

  /* little feet, shared by the NPC kids */
  function feet(cx1, cx2, y) {
    return '<g class="leg-l"><ellipse cx="' + cx1 + '" cy="' + y + '" rx="5.3" ry="4" fill="#3d3468"/></g>' +
      '<g class="leg-r"><ellipse cx="' + cx2 + '" cy="' + y + '" rx="5.3" ry="4" fill="#463c74"/></g>';
  }

  /* ==== NPC KIDS — 66..74 px tall, calm idle poses, host animates ======= */

  function npcGhost() {
    return svg('npcGhost', 56, 72, [
      '<g class="drift">',
      feet(21, 35, 66),
      '<ellipse class="arm arm-l" cx="10.5" cy="41" rx="5.6" ry="8.4" fill="' + C.sheet + '" style="transform-origin:10.5px 33px"/>',
      '<ellipse class="arm arm-r" cx="45.5" cy="41" rx="5.6" ry="8.4" fill="' + C.sheet + '" style="transform-origin:45.5px 33px"/>',
      '<path class="s-body" d="M28 5 C41 5 46.5 16 46.5 30 L46.5 52 C46.5 56.5 42 58.5 38.5 55.5 C35 52.5 31.5 58.5 28 56 C24.5 58.5 21 52.5 17.5 55.5 C14 58.5 9.5 56.5 9.5 52 L9.5 30 C9.5 16 15 5 28 5 Z" fill="' + C.sheet + '"/>',
      '<path d="M9.5 52.6 L46.5 52.6 L46.5 52 C46.5 56.5 42 58.5 38.5 55.5 C35 52.5 31.5 58.5 28 56 C24.5 58.5 21 52.5 17.5 55.5 C14 58.5 9.5 56.5 9.5 52 Z" fill="' + C.sheetShade + '" opacity=".8"/>',
      '<path d="M28 6 C36 6 42 11 44.5 21 C43 32 42.5 44 41 52 C39 55 36 56 33 54 C35 42 35 22 31 7 Z" fill="' + C.sheetShade + '" opacity=".4"/>',
      ghostEyes(),
      '</g>'
    ]);
  }

  function npcPumpkin() {
    return svg('npcPumpkin', 56, 72, [
      feet(21, 35, 66),
      '<ellipse class="arm arm-l" cx="9" cy="42" rx="4.6" ry="7.2" fill="' + C.pumpkinLite + '" style="transform-origin:9px 36px"/>',
      '<ellipse class="arm arm-r" cx="47" cy="42" rx="4.6" ry="7.2" fill="' + C.pumpkinLite + '" style="transform-origin:47px 36px"/>',
      '<ellipse class="s-body" cx="28" cy="43" rx="19" ry="19" fill="' + C.pumpkin + '"/>',
      '<path d="M28 25 C23.5 31 23.5 55 28 61" stroke="' + C.pumpkinDeep + '" stroke-width="2" fill="none" opacity=".4" stroke-linecap="round"/>',
      '<path d="M28 25 C32.5 31 32.5 55 28 61" stroke="' + C.pumpkinDeep + '" stroke-width="2" fill="none" opacity=".4" stroke-linecap="round"/>',
      '<ellipse cx="28" cy="56.5" rx="14.5" ry="5" fill="' + C.pumpkinDeep + '" opacity=".33"/>',
      '<circle cx="7" cy="48" r="3" fill="' + C.skin + '"/><circle cx="49" cy="48" r="3" fill="' + C.skin + '"/>',
      '<rect x="25" y="4" width="6" height="9" rx="3" fill="' + C.stem + '"/>',
      '<path d="M30 6.5 C35 3 38.5 5.5 38.3 9.2 C34.8 10.1 31.8 9 30 6.5 Z" fill="' + C.stemLite + '"/>',
      '<circle class="head" cx="28" cy="20" r="11" fill="' + C.skin + '"/>',
      '<path d="M17.4 19 C19 11 37 11 38.6 19 C35 15.5 33 15.5 32 17.5 C30 14 26 14 24 17.5 C23 15.5 20 16 17.4 19 Z" fill="' + C.hair + '"/>',
      face(28, 21.5, { eyeDx: 5, eyeRx: 1.85, eyeRy: 2.05, blushDx: 7.2, blushDy: 4.6, mouthW: 2.9, mouthD: 1.9 })
    ]);
  }

  function npcWitchling() {
    return svg('npcWitchling', 56, 72, [
      feet(22, 34, 66),
      '<ellipse class="arm arm-l" cx="15" cy="43" rx="4.2" ry="7" fill="' + C.witchHat + '" style="transform-origin:15px 37px"/>',
      '<ellipse class="arm arm-r" cx="41" cy="43" rx="4.2" ry="7" fill="' + C.witchHat + '" style="transform-origin:41px 37px"/>',
      '<path class="s-body" d="M28 32 C21.5 32 16 46 13.5 62 C20 66 36 66 42.5 62 C40 46 34.5 32 28 32 Z" fill="' + C.witchHat + '"/>',
      '<path d="M14 58 C20 62 36 62 42 58 C42.6 59.6 43.2 61 43.8 62.4 C36 66.4 20 66.4 12.2 62.4 C12.8 61 13.4 59.6 14 58 Z" fill="' + C.witchHatLite + '" opacity=".75"/>',
      '<circle cx="13.5" cy="49" r="3.1" fill="' + C.skin + '"/><circle cx="42.5" cy="49" r="3.1" fill="' + C.skin + '"/>',
      '<circle class="head" cx="28" cy="25" r="10.5" fill="' + C.skin + '"/>',
      face(28, 26, { eyeDx: 4.8, eyeRx: 1.8, eyeRy: 2, blushDx: 6.8, blushDy: 4.4, mouthW: 2.8, mouthD: 1.9 }),
      '<path d="M17.6 27 C17.6 17 38.4 17 38.4 27 C36 22 33 22 31 24 C28 20 24 21 21.5 24 C20 22 18 23 17.6 27 Z" fill="' + C.witchHair + '"/>',
      '<path d="M17 18.5 C18.5 5.5 24.5 1.5 28 1.5 C31.5 1.5 37.5 5.5 39 18.5 Z" fill="' + C.witchHat + '"/>',
      '<path d="M28 2 C31 3.5 35.5 8.5 37.4 18.5 L31 18.5 C30.4 9.5 29.2 4.5 28 2 Z" fill="' + C.witchHatLite + '" opacity=".8"/>',
      '<rect x="14.5" y="15.5" width="27" height="5" rx="2.5" fill="#3a2c5f"/>',
      '<rect x="15.6" y="12.4" width="24.8" height="4" rx="2" fill="' + C.amberDeep + '"/>',
      '<path d="M33.4 5.4 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1 Z" fill="' + C.amber + '"/>'
    ]);
  }

  function npcSkeleton() {
    return svg('npcSkeleton', 56, 72, [
      '<g class="leg-l"><ellipse cx="21" cy="65" rx="5.6" ry="5" fill="' + C.skinPale + '"/><rect x="17.6" y="62.4" width="6.8" height="1.5" rx=".75" fill="#c6b7dd"/></g>',
      '<g class="leg-r"><ellipse cx="35" cy="65" rx="5.6" ry="5" fill="' + C.skinPale + '"/><rect x="31.6" y="62.4" width="6.8" height="1.5" rx=".75" fill="#c6b7dd"/></g>',
      '<ellipse class="arm arm-l" cx="13" cy="43" rx="4.4" ry="7.4" fill="' + C.skinPale + '" style="transform-origin:13px 37px"/>',
      '<ellipse class="arm arm-r" cx="43" cy="43" rx="4.4" ry="7.4" fill="' + C.skinPale + '" style="transform-origin:43px 37px"/>',
      '<rect x="10.6" y="40.6" width="5.6" height="1.5" rx=".75" fill="#c6b7dd"/>',
      '<rect x="39.8" y="40.6" width="5.6" height="1.5" rx=".75" fill="#c6b7dd"/>',
      '<rect class="s-body" x="17" y="31" width="22" height="34" rx="11" fill="' + C.skinPale + '"/>',
      '<path d="M20.5 39 C26 37.6 30 37.6 35.5 39 L35.1 42.6 C30 41.2 26 41.2 20.9 42.6 Z" fill="#cdbde4"/>',
      '<path d="M20.2 45.4 C26 44 30 44 35.8 45.4 L35.4 49 C30 47.6 26 47.6 20.6 49 Z" fill="#cdbde4"/>',
      '<path d="M20.5 51.8 C26 50.4 30 50.4 35.5 51.8 L35.1 55.4 C30 54 26 54 20.9 55.4 Z" fill="#cdbde4"/>',
      '<rect x="27.3" y="36" width="1.5" height="22" rx=".75" fill="#cdbde4" opacity=".5"/>',
      '<circle class="head" cx="28" cy="21" r="11" fill="' + C.skinPale + '"/>',
      '<path d="M17.5 20 C18.6 12.5 37.4 12.5 38.5 20 C36 17.5 33 17.8 31 19.6 C28 16.4 24 17.6 21.5 19.6 C20 17.8 18 18 17.5 20 Z" fill="#cdbde4" opacity=".9"/>',
      face(28, 22, { eyeDx: 5, eyeRx: 1.85, eyeRy: 2.1, blushDx: 7.4, blushDy: 4.6, mouthW: 3, mouthD: 2 })
    ]);
  }

  function npcBat() {
    return svg('npcBat', 56, 72, [
      '<g class="leg-l"><rect x="18.6" y="53" width="3" height="13" rx="1.5" fill="#2e2751"/><ellipse cx="21" cy="67" rx="5.3" ry="4" fill="#3d3468"/></g>',
      '<g class="leg-r"><rect x="34.4" y="53" width="3" height="13" rx="1.5" fill="#2e2751"/><ellipse cx="35" cy="67" rx="5.3" ry="4" fill="#463c74"/></g>',
      '<path class="s-body" d="M28 30 C21 30 15 33.5 11 39 C7.5 43.5 4.5 45.5 2.5 47 C4 50 6 53 8 56 C10.5 58.5 13.5 55 17 58 C21 61 35 61 39 58 C42.5 55 45.5 58.5 47.5 56 C49.5 53 51.5 50 53.5 47 C51.5 45.5 48.5 43.5 45 39 C41 33.5 35 30 28 30 Z" fill="#241d45"/>',
      '<path d="M28 32 C22 32 17 35 13.5 39.5 C11 43 8.6 45 7 46 C8.2 48.4 9.8 51 11.4 53.6 C13.4 55.6 15.6 53 18 55.4 C21 58 35 58 38 55.4 C40.4 53 42.6 55.6 44.6 53.6 C46.2 51 47.8 48.4 49 46 C47.4 45 45 43 42.5 39.5 C39 35 34 32 28 32 Z" fill="#3a2c5f"/>',
      '<path d="M12.5 40.5 C8.6 44 4.6 46 3 47.2" stroke="#241d45" stroke-width="1.5" fill="none" opacity=".5" stroke-linecap="round"/>',
      '<path d="M43.5 40.5 C47.4 44 51.4 46 53 47.2" stroke="#241d45" stroke-width="1.5" fill="none" opacity=".5" stroke-linecap="round"/>',
      '<path d="M9.5 53 C11.6 55.4 13.6 56.6 15 58" stroke="#241d45" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>',
      '<path d="M46.5 53 C44.4 55.4 42.4 56.6 41 58" stroke="#241d45" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>',
      '<rect x="21.5" y="33" width="13" height="24" rx="6.5" fill="#43326b"/>',
      '<ellipse class="arm arm-l" cx="15.5" cy="42.5" rx="4" ry="6.4" fill="#43326b" style="transform-origin:15.5px 36.5px"/>',
      '<ellipse class="arm arm-r" cx="40.5" cy="42.5" rx="4" ry="6.4" fill="#43326b" style="transform-origin:40.5px 36.5px"/>',
      '<circle cx="14" cy="47.6" r="2.9" fill="' + C.skin + '"/><circle cx="42" cy="47.6" r="2.9" fill="' + C.skin + '"/>',
      '<circle class="head" cx="28" cy="21.5" r="10.5" fill="' + C.skin + '"/>',
      face(28, 22.5, { eyeDx: 4.8, eyeRx: 1.8, eyeRy: 2, blushDx: 6.9, blushDy: 4.4, mouthW: 2.8, mouthD: 1.9 }),
      '<path d="M17 19 C17.4 11 38.6 11 39 19 C35 14 21 14 17 19 Z" fill="#2e2751"/>',
      '<path d="M18.6 14.6 L20.4 4.6 L25.6 12.4 Z" fill="#2e2751"/>',
      '<path d="M37.4 14.6 L35.6 4.6 L30.4 12.4 Z" fill="#2e2751"/>',
      '<path d="M20.8 11.8 L21.6 8.2 L23.6 11.4 Z" fill="#3a2c5f"/>',
      '<path d="M35.2 11.8 L34.4 8.2 L32.4 11.4 Z" fill="#3a2c5f"/>'
    ]);
  }

  /* ==== CARS — parked (i = 0..3) and a glowing passer ================== */

  /* front of the car is on the RIGHT */
  function carBody(c, lit) {
    return [
      /* cabin + body */
      '<rect x="24" y="6" width="50" height="16" rx="8" fill="' + c.body + '"/>',
      '<rect x="6" y="18" width="84" height="16" rx="8" fill="' + c.body + '"/>',
      '<rect x="6" y="18" width="84" height="5" rx="2.5" fill="#ffffff" opacity=".09"/>',
      '<rect x="24" y="6" width="50" height="4.5" rx="2.25" fill="#ffffff" opacity=".11"/>',
      /* windows — subtle shade */
      '<rect x="29" y="9.6" width="17" height="9.6" rx="4" fill="#2b2450" opacity=".9"/>',
      '<rect x="49" y="9.6" width="17" height="9.6" rx="4" fill="#2b2450" opacity=".9"/>',
      '<rect x="30.5" y="11" width="6" height="6.6" rx="3" fill="' + C.glow + '" opacity=".16"/>',
      '<rect x="50.5" y="11" width="6" height="6.6" rx="3" fill="' + C.glow + '" opacity=".16"/>',
      /* skirt + wheel wells */
      '<rect x="6" y="27.6" width="84" height="4" rx="2" fill="' + c.dark + '" opacity=".5"/>',
      '<path d="M18.6 33.4 A7.4 7.4 0 0 1 33.4 33.4 Z" fill="' + c.dark + '" opacity=".85"/>',
      '<path d="M62.6 33.4 A7.4 7.4 0 0 1 77.4 33.4 Z" fill="' + c.dark + '" opacity=".85"/>',
      /* rear lamp (left) + front lamp (right) */
      '<rect x="3.2" y="22.6" width="5.6" height="6.6" rx="2.8" fill="' + C.pumpkinDeep + '" opacity=".45"/>',
      '<rect x="86.6" y="22.6" width="6.4" height="6.6" rx="3.2" fill="' + (lit ? C.moon : C.moonSoft) + '" opacity="' + (lit ? '.95' : '.7') + '"/>',
      /* bumpers */
      '<rect x="4" y="29" width="11" height="5.6" rx="2.8" fill="' + c.dark + '"/>',
      '<rect x="81" y="29" width="11" height="5.6" rx="2.8" fill="' + c.dark + '"/>',
      /* wheels */
      '<g class="wheel"><circle cx="26" cy="35.4" r="6.8" fill="#2e2751"/><path d="M26 29.9 V32.4 M26 38.4 V40.9 M20.5 35.4 H23 M29 35.4 H31.5" stroke="#4a4270" stroke-width="1.5" stroke-linecap="round"/><circle cx="26" cy="35.4" r="2.4" fill="#4e456f"/></g>',
      '<g class="wheel"><circle cx="70" cy="35.4" r="6.8" fill="#2e2751"/><path d="M70 29.9 V32.4 M70 38.4 V40.9 M64.5 35.4 H67 M73 35.4 H75.5" stroke="#4a4270" stroke-width="1.5" stroke-linecap="round"/><circle cx="70" cy="35.4" r="2.4" fill="#4e456f"/></g>'
    ].join('');
  }

  function car(i) {
    var k = Math.round(Number(i) || 0);
    k = ((k % 4) + 4) % 4;
    return svg('car', 96, 44, [carBody(CARS[k], false)]);
  }

  function passerCar() {
    return svg('passerCar', 104, 44, [
      carBody(CARS[0], true),
      /* warm headlight: soft cone, halo, lens */
      '<path class="beam" d="M89 22.5 C93 19 96.5 16 99.5 13 C100 18 100 22 100 26 C100 30 100 34 99.5 39 C96.5 36 93 33 89 29.5 Z" fill="' + C.glow + '" fill-opacity=".15"/>',
      '<ellipse class="glow" cx="93" cy="26" rx="11" ry="12" fill="' + C.amber + '" fill-opacity=".11"/>',
      '<ellipse class="glow" cx="90" cy="26" rx="9" ry="7.4" fill="' + C.amber + '" fill-opacity=".2"/>',
      '<ellipse class="glow" cx="89.4" cy="26" rx="5.6" ry="4.6" fill="' + C.moonSoft + '" fill-opacity=".3"/>',
      '<ellipse class="lens" cx="90.4" cy="26" rx="3.2" ry="3.4" fill="' + C.moon + '"/>'
    ]);
  }

  /* ==== STREET & YARD PROPS ============================================ */

  function trashCan() {
    return svg('trashCan', 34, 38, [
      '<rect x="14" y="1.6" width="6" height="4.4" rx="2.2" fill="#6b5785"/>',
      '<rect x="3.6" y="4.6" width="26.8" height="6.6" rx="3.3" fill="#7a6396"/>',
      '<rect x="5.2" y="6" width="23.6" height="2.4" rx="1.2" fill="#8d76a8" opacity=".6"/>',
      '<rect x="6.6" y="11" width="20.8" height="24" rx="7" fill="#6b5785"/>',
      '<rect x="6.6" y="11" width="6.4" height="24" rx="3.2" fill="#7d6797" opacity=".45"/>',
      '<rect x="12.6" y="15" width="1.8" height="16.5" rx=".9" fill="#584772" opacity=".65"/>',
      '<rect x="19.6" y="15" width="1.8" height="16.5" rx=".9" fill="#584772" opacity=".65"/>',
      '<ellipse cx="17" cy="32" rx="9.4" ry="3.2" fill="#584772" opacity=".45"/>'
    ]);
  }

  function lampPost() {
    return svg('lampPost', 26, 112, [
      '<circle class="glow" cx="13" cy="34" r="13" fill="' + C.amber + '" fill-opacity=".13"/>',
      '<circle class="glow" cx="13" cy="34" r="8" fill="' + C.amber + '" fill-opacity=".2"/>',
      '<rect x="10.8" y="29" width="4.4" height="68" rx="2.2" fill="#332a4e"/>',
      '<rect x="8.6" y="91" width="8.8" height="14" rx="4.4" fill="#332a4e"/>',
      '<rect x="5" y="103" width="16" height="7.4" rx="3.7" fill="#2e2751"/>',
      '<path d="M5 29 C5 21 8.4 15.6 13 15.6 C17.6 15.6 21 21 21 29 Z" fill="#2e2751"/>',
      '<path d="M13 15.6 C16.6 15.6 20 21 21 28 L16.6 28 C15.9 21.5 14.6 17.4 13 15.6 Z" fill="#3a2c5f"/>',
      '<circle cx="13" cy="14" r="2.6" fill="#2e2751"/>',
      '<rect x="4.4" y="27.6" width="17.2" height="3.6" rx="1.8" fill="#241d45"/>',
      '<ellipse cx="13" cy="32.4" rx="4.3" ry="4.1" fill="' + C.glow + '"/>',
      '<ellipse class="flame" cx="13" cy="31.6" rx="2.2" ry="2" fill="' + C.moon + '"/>'
    ]);
  }

  function mailbox() {
    return svg('mailbox', 26, 38, [
      '<rect x="11.4" y="16" width="3.4" height="20" rx="1.7" fill="#584772"/>',
      '<rect x="8.8" y="33.6" width="8.6" height="3.4" rx="1.7" fill="#4b3d63"/>',
      '<path d="M4 15 C4 9.2 7.4 6.2 13 6.2 C18.6 6.2 22 9.2 22 15 L22 21.4 C22 23.4 20.6 24.6 18.6 24.6 L4 24.6 Z" fill="#6b5785"/>',
      '<path d="M13 6.2 C18.6 6.2 22 9.2 22 15 L22 17.4 C21.4 12.2 17.6 9.4 13 9.4 Z" fill="#7d6797" opacity=".55"/>',
      '<ellipse cx="4.4" cy="18.4" rx="2.6" ry="6" fill="#584772"/>',
      /* little star plaque on the side (a stamp, never a word) */
      '<circle cx="14" cy="16.6" r="3.6" fill="#8d76a8"/>',
      '<circle cx="14" cy="16.6" r="3.6" fill="none" stroke="#584772" stroke-width=".7"/>',
      '<path d="M16 18.8 L17.3 22.2 L20.9 22.4 L18.1 24.7 L19.1 28.2 L16 26.2 L12.9 28.2 L13.9 24.7 L11.1 22.4 L14.7 22.2 Z" fill="' + C.amber + '" transform="translate(14 16.6) scale(.62) translate(-16 -23.4)"/>',
      /* the flag, raised and unmistakable */
      '<rect x="19" y="6.8" width="2" height="12" rx="1" fill="#584772"/>',
      '<path d="M20.6 7 C23.6 7.4 25.2 9.4 25.1 11.3 C25 12.5 22.8 13 20.6 12.8 Z" fill="' + C.amber + '"/>',
      '<path d="M20.6 7 C21.5 8.6 21.7 11.2 20.6 12.8 Z" fill="' + C.amberDeep + '" opacity=".8"/>',
      '<path d="M21.8 8.7 C22.9 9 23.9 9.7 24.4 10.5" stroke="#fff6dd" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".75"/>'
    ]);
  }

  function gnome() {
    return svg('gnome', 28, 36, [
      '<ellipse cx="9" cy="33.4" rx="4" ry="2.6" fill="#4b3d63"/>',
      '<ellipse cx="19" cy="33.4" rx="4" ry="2.6" fill="#4b3d63"/>',
      '<path d="M14 17.6 C8.4 19.6 5 26.6 5 33.4 C9 36 19 36 23 33.4 C23 26.6 19.6 19.6 14 17.6 Z" fill="#6b5785"/>',
      '<path d="M14 17.6 C19.6 19.6 23 26.6 23 33.4 C21 34.8 18.4 35.6 14 35.6 Z" fill="#584772" opacity=".5"/>',
      /* belt and buckle (the hands sit over its ends) */
      '<rect x="6.4" y="27" width="15.2" height="2.8" rx="1.4" fill="#4b3d63"/>',
      '<rect x="11.8" y="25.8" width="4.4" height="5.2" rx="1.2" fill="' + C.amber + '"/>',
      '<rect x="13.2" y="27.1" width="1.6" height="2.6" rx=".8" fill="#4b3d63"/>',
      '<circle cx="14" cy="15" r="6.6" fill="' + C.skin + '"/>',
      '<path d="M7 15 C7 26 21 26 21 15 C19.4 21.4 8.6 21.4 7 15 Z" fill="' + C.skinPale + '"/>',
      /* beard strands */
      '<path d="M10.6 18.4 C10.4 20.4 10.8 22.2 11.6 23.6 M13.4 19.2 C13.4 21.2 14 23 14.8 24.4 M16.8 19 C17 20.8 16.8 22.4 16.2 23.8 M18.8 18.2 C19.4 19.8 19.4 21.4 19 22.6"' +
        ' stroke="#d8cdea" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".8"/>',
      '<ellipse cx="14" cy="17.4" rx="3" ry="2.4" fill="#ffc9a4"/>',
      /* rosier cheeks */
      '<ellipse cx="9.1" cy="16" rx="1.6" ry="1.2" fill="#ffb8a8" opacity=".7"/>',
      '<ellipse cx="18.9" cy="16" rx="1.6" ry="1.2" fill="#ffb8a8" opacity=".7"/>',
      '<circle cx="11.2" cy="13.8" r="1.5" fill="' + C.ink + '"/><circle cx="16.8" cy="13.8" r="1.5" fill="' + C.ink + '"/>',
      '<circle cx="11.6" cy="13.2" r=".5" fill="#fff"/><circle cx="17.2" cy="13.2" r=".5" fill="#fff"/>',
      '<circle cx="6" cy="27.6" r="2.6" fill="' + C.skin + '"/><circle cx="22" cy="27.6" r="2.6" fill="' + C.skin + '"/>',
      '<path d="M6.4 13.6 C7 3.6 11 0 14 0 C17 0 21 3.6 21.6 13.6 Z" fill="' + C.pumpkinDeep + '"/>',
      '<path d="M14 0.4 C16.8 0.4 20.4 3.8 21.4 12.4 L17.4 12.4 C16.8 5.4 15.4 1.6 14 0.4 Z" fill="#d9753a" opacity=".7"/>',
      '<rect x="4.6" y="12.2" width="18.8" height="4.6" rx="2.3" fill="#c96a33"/>'
    ]);
  }

  /* ==== ORNAMENTS ====================================================== */

  function cobweb() {
    var t = ' stroke="#f0e7fb" stroke-width="1" fill="none" stroke-linecap="round"';
    var s = '<g class="web"><g opacity=".45">';
    /* radial threads from the top-left corner */
    s += '<path d="M1.5 1.5 L42 1.5"' + t + '/>';
    s += '<path d="M1.5 1.5 L38 13"' + t + '/>';
    s += '<path d="M1.5 1.5 L29 26"' + t + '/>';
    s += '<path d="M1.5 1.5 L16 37"' + t + '/>';
    s += '<path d="M1.5 1.5 L1.5 42"' + t + '/>';
    /* three silk rings, sagging like real web */
    s += '<path d="M14 1.5 Q9.5 4 1.5 14"' + t + '/>';
    s += '<path d="M24.5 1.5 Q16 6.5 1.5 24.5"' + t + '/>';
    s += '<path d="M35 1.5 Q23 9 1.5 35"' + t + '/>';
    s += '</g>';
    s += '<g opacity=".6">' +
      '<path d="M12.4 6.4 Q9 9 6.4 12.4" stroke="#fff6dd" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
      '<path d="M23 4.6 Q16.4 10.4 4.6 23" stroke="#fff6dd" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".7"/>' +
      '</g>';
    /* the tenant: a tiny spider on its thread, hanging off the middle ring.
       .spider pivots at the silk anchor (bbox top) and .spider-body adds a
       slower counter-sway, so the two motions never tick in sync. */
    s += '<g class="spider">' +
      '<path d="M14.5 9.8 L15.3 20.6" stroke="#f0e7fb" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".7"/>' +
      '<g class="spider-body">' +
      '<path d="M13.4 22.4 L11.2 21.2 L9.6 21.8 M13.2 23.6 L10.6 23.4 L9.2 24.2 M13.4 24.8 L11.4 25.8 L10 26.6 M13.8 25.8 L12.6 27.4 L11.8 28.4"' +
        ' stroke="#7d6797" stroke-width=".75" fill="none" stroke-linecap="round"/>' +
      '<path d="M17.4 22.4 L19.6 21.2 L21.2 21.8 M17.6 23.6 L20.2 23.4 L21.6 24.2 M17.4 24.8 L19.4 25.8 L20.8 26.6 M17 25.8 L18.2 27.4 L19 28.4"' +
        ' stroke="#7d6797" stroke-width=".75" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="15.4" cy="23.2" rx="2.5" ry="2.9" fill="#9a86b4"/>' +
      '<path d="M15.4 20.3 C17 20.3 17.9 21.6 17.9 23.2 C17.9 24.8 17 26.1 15.4 26.1 Z" fill="#7d6797" opacity=".55"/>' +
      '<circle cx="15.4" cy="21.2" r="1.5" fill="#a995c2"/>' +
      '<circle cx="14.6" cy="21" r=".45" fill="#28305a"/>' +
      '<circle cx="16.2" cy="21" r=".45" fill="#28305a"/>' +
      '</g></g>';
    s += '</g>';
    return svg('cobweb', 44, 44, [s]);
  }

  /* one bat, scaled and placed.
     NOTE: the placing transform must live on an inner group — a CSS transform
     on .bat (the flutter) would otherwise override the transform *attribute*
     and collapse every bat onto the viewBox origin. */
  function batAt(cx, cy, s, wing, body, detail) {
    return '<g class="bat"><g transform="translate(' + cx + ',' + cy + ') scale(' + s + ')">' +
      '<path d="M0 -1 C-3 -7.8 -9 -7 -12 -3 C-9.4 -3.4 -8 -2 -7.4 0.2 C-5.8 -2.2 -3.8 -1.6 -2.4 0.2 Z" fill="' + wing + '"/>' +
      '<path d="M0 -1 C3 -7.8 9 -7 12 -3 C9.4 -3.4 8 -2 7.4 0.2 C5.8 -2.2 3.8 -1.6 2.4 0.2 Z" fill="' + wing + '"/>' +
      /* leading-edge highlight + two membrane folds: a wing, not a wedge */
      '<path d="M-1.3 -2.2 C-3.6 -6.6 -8 -6.2 -10.8 -3.4" stroke="' + detail + '" stroke-width=".55" fill="none" stroke-linecap="round" opacity=".5"/>' +
      '<path d="M1.3 -2.2 C3.6 -6.6 8 -6.2 10.8 -3.4" stroke="' + detail + '" stroke-width=".55" fill="none" stroke-linecap="round" opacity=".5"/>' +
      '<path d="M-5.3 -4.7 C-5.8 -3.1 -6 -1.9 -6.1 -0.6 M-9.3 -3.8 C-9.7 -2.7 -9.9 -1.7 -10 -0.7"' +
        ' stroke="' + detail + '" stroke-width=".45" fill="none" stroke-linecap="round" opacity=".38"/>' +
      '<path d="M5.3 -4.7 C5.8 -3.1 6 -1.9 6.1 -0.6 M9.3 -3.8 C9.7 -2.7 9.9 -1.7 10 -0.7"' +
        ' stroke="' + detail + '" stroke-width=".45" fill="none" stroke-linecap="round" opacity=".38"/>' +
      '<path d="M-2 -2.2 L-2.9 -5.4 L-0.5 -3.4 Z" fill="' + body + '"/>' +
      '<path d="M2 -2.2 L2.9 -5.4 L0.5 -3.4 Z" fill="' + body + '"/>' +
      '<ellipse cx="0" cy="0" rx="2.6" ry="3.2" fill="' + body + '"/>' +
      /* eye glints */
      '<circle cx="-.95" cy="-.95" r=".55" fill="#ede2ff" opacity=".92"/>' +
      '<circle cx=".95" cy="-.95" r=".55" fill="#ede2ff" opacity=".92"/>' +
      '</g></g>';
  }

  function bats() {
    return svg('bats', 46, 24, [
      /* dusk-mauve tones: bats must read against the night sky, never vanish into it */
      batAt(11, 16.5, 0.62, '#5c4f8a', '#3f3563', '#a995c2'),
      batAt(38, 6.4, 0.55, '#4f4378', '#382f57', '#9a86b4'),
      batAt(25.5, 12.6, 0.92, '#6d5f9a', '#4a3f70', '#b3a2d4')
    ]);
  }

  function tombstone() {
    return svg('tombstone', 32, 40, [
      '<path d="M7.2 38.6 C6.6 30 6 20.4 6 14.4 C6 7 26 7 26 14.4 C26 20.4 25.4 30 24.8 38.6 C21 40.4 11 40.4 7.2 38.6 Z" fill="#7a6396"/>',
      '<path d="M10.4 33.6 C9.9 27 9.5 20.6 9.5 15.8 C9.5 11 22.5 11 22.5 15.8 C22.5 20.6 22.1 27 21.6 33.6 C18.4 35 13.6 35 10.4 33.6 Z" fill="#8d76a8" opacity=".45"/>',
      /* carvings: a star, a chisel nick, a hairline crack — never any text */
      '<path d="M16 18.8 L17.3 22.2 L20.9 22.4 L18.1 24.7 L19.1 28.2 L16 26.2 L12.9 28.2 L13.9 24.7 L11.1 22.4 L14.7 22.2 Z" fill="#cdbde4" opacity=".9"/>',
      '<path d="M10.6 29.4 C12.6 31.4 11.6 33.4 13.6 35.4" stroke="#6b5785" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>',
      '<path d="M23.7 25.6 L24.4 28.2" stroke="#6b5785" stroke-width="1" fill="none" stroke-linecap="round" opacity=".6"/>',
      /* moss creeping up the base */
      '<path d="M6.6 35 C7.4 32.2 10.4 31 13.2 31.8 C14.2 33.4 13.2 35.4 11.2 36 C9.2 36.6 7.4 36.2 6.6 35 Z" fill="#5f8a55" opacity=".5"/>',
      '<path d="M7.8 33.6 C8.6 32 10 31.4 11.4 31.8 C11.2 33.2 10.2 34.2 8.6 34.4 C8.2 34.2 7.9 33.9 7.8 33.6 Z" fill="#7fb069" opacity=".45"/>',
      '<circle cx="13.9" cy="35.4" r=".9" fill="#5f8a55" opacity=".45"/>',
      '<circle cx="8" cy="36.2" r=".7" fill="#7fb069" opacity=".4"/>',
      /* a baby pumpkin left at the foot of the stone */
      '<ellipse cx="24.4" cy="36.6" rx="3.6" ry="3" fill="' + C.pumpkin + '"/>',
      '<path d="M24.4 33.7 C23.2 34.9 23.2 38.3 24.4 39.5 M24.4 33.7 C25.6 34.9 25.6 38.3 24.4 39.5" stroke="' + C.pumpkinDeep + '" stroke-width=".6" fill="none" opacity=".4" stroke-linecap="round"/>',
      '<rect x="23.4" y="32.4" width="2" height="1.8" rx=".8" fill="' + C.stem + '"/>'
    ]);
  }

  function scarecrow() {
    return svg('scarecrow', 44, 64, [
      /* post stays planted */
      '<rect x="20.4" y="28" width="3.4" height="34" rx="1.7" fill="#5b4a71"/>',
      /* everything above the waist sways as one piece */
      '<g class="sway">',
      '<rect x="8" y="33.6" width="28" height="3.2" rx="1.6" fill="#5b4a71"/>',
      /* straw hands */
      '<path d="M9 32.6 C5.4 30.6 3 31.4 1.4 33.4 C3.6 34 6 34.6 8.6 35.4 Z" fill="' + C.amberDeep + '"/>',
      '<path d="M35 32.6 C38.6 30.6 41 31.4 42.6 33.4 C40.4 34 38 34.6 35.4 35.4 Z" fill="' + C.amberDeep + '"/>',
      '<path d="M9 38.4 C5.4 39.6 3.6 41.4 2.6 43.6 C5 42.6 7.2 41 9 39.6 Z" fill="' + C.amberDeep + '" opacity=".8"/>',
      '<path d="M35 38.4 C38.6 39.6 40.4 41.4 41.4 43.6 C39 42.6 36.8 41 35 39.6 Z" fill="' + C.amberDeep + '" opacity=".8"/>',
      /* straw texture: stalks, a few poking past the bundles */
      '<path d="M7.8 32.9 L3.4 33.2 M6.6 34 L2.6 35 M9.8 34.4 L5.4 36.2 M8.4 40 L4.6 42.6 M6.9 39.4 L3.2 40.6"' +
        ' stroke="#c98a4b" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M36.2 32.9 L40.6 33.2 M37.4 34 L41.4 35 M34.2 34.4 L38.6 36.2 M35.6 40 L39.4 42.6 M37.1 39.4 L40.8 40.6"' +
        ' stroke="#c98a4b" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>' +
      /* shirt */
      '<path d="M14 35.6 C11.8 44 11.6 52.6 13 59 C18 61.4 26 61.4 31 59 C32.4 52.6 32.2 44 30 35.6 Z" fill="#7a5166"/>',
      '<path d="M14 35.6 C11.8 44 11.6 52.6 13 59 C15 59.8 17.6 60.4 22 60.6 C20 52 20 43 22.6 35.6 Z" fill="#6b4760" opacity=".45"/>',
      '<rect x="24.4" y="41" width="6.4" height="6" rx="2" fill="#c98a4b" opacity=".9" transform="rotate(6 27.6 44)"/>',
      '<rect x="24.4" y="41" width="6.4" height="1.6" rx=".8" fill="#e0aa74" opacity=".7" transform="rotate(6 27.6 44)"/>',
      '<rect x="13.6" y="51.6" width="6" height="5.4" rx="1.8" fill="' + C.milo + '" opacity=".85"/>',
      /* a scrap of cloth sewn on, stitching and all */
      '<rect x="14.4" y="44.6" width="7.4" height="6.6" rx="1.6" fill="#8a6f9e" transform="rotate(-7 18.1 47.9)"/>',
      '<rect x="14.4" y="44.6" width="7.4" height="6.6" rx="1.6" fill="none" stroke="#f0e7fb" stroke-width=".6" stroke-dasharray="1 1.3" opacity=".5" transform="rotate(-7 18.1 47.9)"/>',
      /* head */
      '<circle cx="22" cy="22" r="10" fill="' + C.hair + '"/>',
      '<path d="M22 12 C27 12 31 17 31.6 22 C31.6 27 28 32 22 32 Z" fill="#e0b985" opacity=".5"/>',
      '<path d="M15 16.6 C13 13.4 14.6 10.6 17 12 C17.6 13.6 16.6 15.4 15 16.6 Z" fill="' + C.amberDeep + '"/>',
      '<path d="M29 16.6 C31 13.4 29.4 10.6 27 12 C26.4 13.6 27.4 15.4 29 16.6 Z" fill="' + C.amberDeep + '"/>',
      /* one button eye (holes + thread), one plain stitched eye */
      '<circle cx="18.4" cy="20.4" r="2.3" fill="#3a2f4e"/>',
      '<circle cx="17.7" cy="19.8" r=".5" fill="#8d76a8"/><circle cx="19.2" cy="20.9" r=".5" fill="#8d76a8"/>',
      '<path d="M18.4 18.1 V18.8 M18.4 22 V22.7 M16.1 20.4 H16.8 M20 20.4 H20.7" stroke="#8d76a8" stroke-width=".6" fill="none" stroke-linecap="round"/>',
      '<circle cx="25.6" cy="20.4" r="1.7" fill="' + C.ink + '"/>',
      '<circle cx="26.1" cy="19.8" r=".55" fill="#fff"/>',
      /* peg nose */
      '<path d="M22 22.4 L23.2 25.2 L20.8 25.2 Z" fill="#c98a4b"/>',
      '<path d="M22 22.4 L22 24.3" stroke="#e0aa74" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>',
      /* stitched grin */
      '<path d="M17.8 26.6 Q22 30.2 26.4 26.6" stroke="' + C.ink + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
      '<path d="M19.6 27.6 L19.6 29.2 M21.4 28.7 L21.4 30.3 M23.2 28.6 L23.2 30.2 M25 27.3 L25 28.9" stroke="' + C.ink + '" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".85"/>',
      /* straw hat, knocked a touch crooked */
      '<g transform="rotate(-3.2 22 12)">',
      '<ellipse cx="22" cy="14" rx="15" ry="4.2" fill="' + C.amber + '"/>',
      '<path d="M22 18.6 C15 18.6 12.6 16.4 12.6 13.6 C12.6 8 18.6 1 22 1 C25.4 1 31.4 8 31.4 13.6 C31.4 16.4 29 18.6 22 18.6 Z" fill="' + C.amber + '"/>',
      '<path d="M22 1 C25.4 1 31.4 8 31.4 13.6 C31.4 16.4 29 18.6 22 18.6 Z" fill="' + C.amberDeep + '" opacity=".45"/>',
      '<rect x="12.4" y="11.4" width="19.2" height="3.4" rx="1.7" fill="#a86f3a"/>',
      '</g>',
      '</g>'
    ]);
  }

  function candleLantern() {
    return svg('candleLantern', 18, 30, [
      '<circle class="glow" cx="9" cy="19" r="9" fill="' + C.amber + '" fill-opacity=".15"/>',
      '<circle class="glow" cx="9" cy="19" r="5.4" fill="' + C.amber + '" fill-opacity=".18"/>',
      /* small halo ring, breathes with the rest of the light */
      '<ellipse class="glow" cx="9" cy="19" rx="7" ry="7.6" fill="none" stroke="' + C.glow + '" stroke-width=".9" stroke-opacity=".34"/>',
      '<rect x="4" y="10" width="10" height="17" rx="3.5" fill="#2e2751"/>',
      '<rect x="5.6" y="11.6" width="6.8" height="13.8" rx="3" fill="#3a2c5f"/>',
      /* warm interior, stacked shades: reads as a gradient, needs no shared id */
      '<rect x="6.4" y="12.2" width="5.2" height="12.6" rx="2.6" fill="' + C.amberDeep + '" opacity=".34"/>',
      '<rect x="6.6" y="12.6" width="4.8" height="11.8" rx="2.4" fill="' + C.glow + '" opacity=".74"/>',
      '<rect x="7.2" y="15.4" width="3.6" height="8.4" rx="1.8" fill="' + C.moonSoft + '" opacity=".5"/>',
      '<rect x="7.6" y="18" width="2.8" height="6.4" rx="1.4" fill="' + C.moon + '"/>',
      '<ellipse class="flame" cx="9" cy="15.6" rx="1.9" ry="2.9" fill="' + C.amber + '"/>',
      '<ellipse class="flame" cx="9" cy="16.3" rx=".9" ry="1.6" fill="' + C.moon + '"/>',
      '<rect x="8.3" y="11.4" width="1.5" height="13.6" rx=".75" fill="#241d45" opacity=".6"/>',
      /* wax running down the inside of the glass, clear of the flame */
      '<path d="M5.9 12.6 C5.9 15.4 6.1 16.6 6.5 16.6 C6.9 16.6 7.1 15.4 7.1 12.6 Z" fill="#f6e6c4" opacity=".75"/>',
      '<path d="M10.9 12.6 C10.9 14.8 11.1 15.6 11.5 15.6 C11.9 15.6 12.1 14.8 12.1 12.6 Z" fill="#f6e6c4" opacity=".6"/>',
      '<circle cx="6.4" cy="18.1" r=".5" fill="#ffeccf" opacity=".45"/>',
      '<circle cx="11.6" cy="17" r=".45" fill="#ffeccf" opacity=".4"/>',
      '<rect x="3.4" y="9" width="11.2" height="3.6" rx="1.8" fill="#241d45"/>',
      '<rect x="3.4" y="24.6" width="11.2" height="3.6" rx="1.8" fill="#241d45"/>',
      '<path d="M5.5 9.4 C5.5 4.4 12.5 4.4 12.5 9.4" stroke="#2e2751" stroke-width="1.7" fill="none" stroke-linecap="round"/>'
    ]);
  }

  function pumpkinPair() {
    return svg('pumpkinPair', 64, 40, [
      /* ---- big pumpkin: one open eye, one winking, carved grin ---- */
      '<ellipse cx="22" cy="26" rx="16" ry="13" fill="' + C.pumpkin + '"/>',
      '<path d="M22 13.6 C18.4 18.6 18.4 33.4 22 38.4" stroke="' + C.pumpkinDeep + '" stroke-width="1.6" fill="none" opacity=".45" stroke-linecap="round"/>',
      '<path d="M22 13.6 C25.6 18.6 25.6 33.4 22 38.4" stroke="' + C.pumpkinDeep + '" stroke-width="1.6" fill="none" opacity=".45" stroke-linecap="round"/>',
      '<ellipse cx="22" cy="33.6" rx="12.4" ry="4.2" fill="' + C.pumpkinDeep + '" opacity=".32"/>',
      /* stem, leaf with its vein, and a vine curl */
      '<rect x="19.6" y="8.6" width="5" height="7" rx="2.5" fill="' + C.stem + '"/>',
      '<path d="M24.6 11 C29.4 7.6 32.8 10 32.6 13.4 C29.4 14.4 26.4 13.4 24.6 11 Z" fill="' + C.stemLite + '"/>',
      '<path d="M26.6 13.9 C29.6 11.6 31.6 11.6 32.5 12.9" stroke="#5f8a55" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>',
      '<path d="M25.4 9.4 C27.6 6.6 30.2 6.2 31.6 7.4" stroke="#7fb069" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".85"/>',
      /* carved face: deep openings, lit from behind (.carve is the lamp) */
      '<path d="M17.4 21.6 L19.4 25 L15.4 25 Z" fill="#b85a2c"/>',
      '<path d="M17.6 29.3 Q20.2 31.9 22.4 29.3 Q24.6 31.9 27.2 29.3 L27.2 31.9 Q24.6 34.5 22.4 31.9 Q20.2 34.5 17.6 31.9 Z" fill="#b85a2c"/>',
      /* the wink: a closed lid, and no light behind this one */
      '<path d="M24.3 21.1 C25.4 23.6 27.8 23.6 28.9 21.1 C27.8 22.4 25.4 22.4 24.3 21.1 Z" fill="#b85a2c"/>',
      '<g class="carve carve-a">',
      '<path d="M17.4 21.6 L19.4 25 L15.4 25 Z" fill="' + C.glow + '" opacity=".22" transform="translate(17.4 23.87) scale(1.5) translate(-17.4 -23.87)"/>',
      '<path d="M17.6 29.3 Q20.2 31.9 22.4 29.3 Q24.6 31.9 27.2 29.3 L27.2 31.9 Q24.6 34.5 22.4 31.9 Q20.2 34.5 17.6 31.9 Z" fill="' + C.glow + '" opacity=".2" transform="translate(22 31.9) scale(1.16) translate(-22 -31.9)"/>',
      '<path d="M17.4 21.6 L19.4 25 L15.4 25 Z" fill="#ffdf9d" transform="translate(17.4 23.87) scale(.52) translate(-17.4 -23.87)"/>',
      '<path d="M17.6 29.3 Q20.2 31.9 22.4 29.3 Q24.6 31.9 27.2 29.3 L27.2 31.9 Q24.6 34.5 22.4 31.9 Q20.2 34.5 17.6 31.9 Z" fill="#ffdf9d" transform="translate(22 31.9) scale(.56) translate(-22 -31.9)"/>',
      '</g>',
      /* ---- small pumpkin: wide round eyes and an "o" of surprise ---- */
      '<ellipse cx="46" cy="30" rx="11.4" ry="9.4" fill="' + C.pumpkinLite + '"/>',
      '<path d="M46 20.8 C43.6 24.4 43.6 35.6 46 39.2" stroke="' + C.pumpkinDeep + '" stroke-width="1.4" fill="none" opacity=".4" stroke-linecap="round"/>',
      '<path d="M46 20.8 C48.4 24.4 48.4 35.6 46 39.2" stroke="' + C.pumpkinDeep + '" stroke-width="1.4" fill="none" opacity=".4" stroke-linecap="round"/>',
      '<ellipse cx="46" cy="35.4" rx="8.8" ry="3" fill="' + C.pumpkinDeep + '" opacity=".3"/>',
      '<rect x="44.2" y="16.6" width="4" height="6" rx="2" fill="' + C.stem + '"/>',
      '<path d="M48.2 18.6 C52 15.8 55 17.8 54.8 20.6 C52 21.4 49.6 20.6 48.2 18.6 Z" fill="' + C.stemLite + '"/>',
      '<path d="M49.8 20.9 C52.4 19 54 19 54.8 20" stroke="#5f8a55" stroke-width=".55" fill="none" stroke-linecap="round" opacity=".7"/>',
      '<path d="M47.6 16.4 C49.4 14.4 51.4 14 52.6 15" stroke="#7fb069" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".8"/>',
      '<circle cx="43" cy="27.4" r="2.2" fill="#b85a2c"/>',
      '<circle cx="49.2" cy="27.4" r="1.7" fill="#b85a2c"/>',
      '<circle cx="46" cy="32.8" r="2.4" fill="#b85a2c"/>',
      '<g class="carve carve-b">',
      '<circle cx="43" cy="27.4" r="3.2" fill="' + C.glow + '" opacity=".2"/>',
      '<circle cx="49.2" cy="27.4" r="2.7" fill="' + C.glow + '" opacity=".2"/>',
      '<circle cx="46" cy="32.8" r="3.4" fill="' + C.glow + '" opacity=".2"/>',
      '<circle cx="43" cy="27.4" r="1.1" fill="#ffdf9d"/>',
      '<circle cx="49.2" cy="27.4" r=".85" fill="#ffdf9d"/>',
      '<circle cx="46" cy="32.8" r="1.2" fill="#ffdf9d"/>',
      '</g>'
    ]);
  }

  /* ==== MOTION LAYER ===================================================
   * The pack ships its own animation. Host adds wrapper classes:
   *   .walking  -> NPC kid walk cycle (legs, counter-arms, body bob, head lag)
   *   .rolling  -> car wheels spin (add while the car is moving)
   * and calls SPRITES.injectAnimCSS() once per document.
   * All motion is transform/opacity only, and dies under
   * @media (prefers-reduced-motion: reduce).
   * ==================================================================== */

  var animCSS = `
/* --- Dolcetto o Scherzetto — sprite motion (transform/opacity only) --- */

/* 1. NPC kids — walk cycle (host adds .walking to any wrapper) */
@keyframes dscWalkBob{
  0%,100%{ transform:translateY(0) rotate(-.7deg) }
  50%    { transform:translateY(-2.2px) rotate(.7deg) }
}
@keyframes dscWalkHead{
  0%,100%{ transform:translateY(0) rotate(-.9deg) }
  50%    { transform:translateY(-1.2px) rotate(.9deg) }
}
@keyframes dscLegSwing{
  0%,100%{ transform:translateX(1.7px) rotate(12deg) }
  50%    { transform:translateX(-1.7px) rotate(-12deg) }
}
@keyframes dscArmSwing{
  0%,100%{ transform:rotate(-13deg) }
  50%    { transform:rotate(13deg) }
}

/* 2. idle — gentle breathing (kids only: they are the only .s-body) */
@keyframes dscBreath{
  0%,100%{ transform:translateY(0) scaleY(1) }
  50%    { transform:translateY(-1.3px) scaleY(1.012) }
}
/* sheet kid idles on top of the breath */
@keyframes dscGhostDrift{
  0%,100%{ transform:translateY(0) rotate(-1.1deg) }
  50%    { transform:translateY(-3.2px) rotate(1.1deg) }
}

/* 3. lights */
@keyframes dscFlame{
  0%  { opacity:1;   transform:scale(1)     translateY(0) }
  14% { opacity:.84; transform:scale(.965)  translateY(.35px) }
  28% { opacity:1;   transform:scale(1.035) translateY(-.45px) }
  42% { opacity:.9;  transform:scale(.985)  translateY(.15px) }
  57% { opacity:1;   transform:scale(1.05)  translateY(-.5px) }
  71% { opacity:.85; transform:scale(.96)   translateY(.3px) }
  86% { opacity:1;   transform:scale(1.02)  translateY(-.2px) }
  100%{ opacity:1;   transform:scale(1)     translateY(0) }
}
/* .glow keeps its baked alpha in fill-opacity, so element opacity can pulse */
@keyframes dscGlow{
  0%,100%{ opacity:.6; transform:scale(.96) }
  50%    { opacity:1;  transform:scale(1.07) }
}

/* 4. bats / web / scarecrow */
@keyframes dscBat{
  0%,100%{ transform:translateY(0) rotate(-3.4deg) }
  50%    { transform:translateY(-2.4px) rotate(3.4deg) }
}
@keyframes dscWeb{
  0%,100%{ transform:rotate(-1.2deg) }
  50%    { transform:rotate(1.2deg) }
}
@keyframes dscSway{
  0%,100%{ transform:rotate(-1.5deg) }
  50%    { transform:rotate(1.5deg) }
}
/* the web's tenant: a slow bob on the silk (deliberately not a clean sine) */
@keyframes dscSpiderBob{
  0%,100%{ transform:translateY(0) }
  34%    { transform:translateY(1.9px) }
  61%    { transform:translateY(.7px) }
  83%    { transform:translateY(1.5px) }
}
/* ...plus a micro sway pivoting at the silk, on its own offset clock */
@keyframes dscSpiderSway{
  0%,100%{ transform:rotate(-4.5deg) }
  50%    { transform:rotate(4.5deg) }
}
/* jack-o'-lantern insides: a slow, uneven warm breath */
@keyframes dscCarve{
  0%,100%{ opacity:.68 }
  26%    { opacity:1 }
  47%    { opacity:.78 }
  72%    { opacity:.98 }
}

/* 5. cars */
@keyframes dscWheel{ from{ transform:rotate(0deg) } to{ transform:rotate(360deg) } }
@keyframes dscBeam{
  0%,100%{ opacity:.66; transform:scale(.98) }
  50%    { opacity:1;   transform:scale(1.05) }
}
@keyframes dscLens{
  0%,100%{ opacity:.72; transform:scale(.95) }
  50%    { opacity:1;   transform:scale(1.07) }
}

/* ---- applied ---- */
.s-body{
  transform-box:fill-box; transform-origin:50% 100%;
  animation:dscBreath 3.5s ease-in-out infinite;
}
.head{ transform-box:fill-box; transform-origin:50% 100%; }
.leg-l,.leg-r{ transform-box:fill-box; transform-origin:50% -60%; }
.drift{
  transform-box:fill-box; transform-origin:50% 100%;
  animation:dscGhostDrift 6.5s ease-in-out infinite;
}
/* .arm keeps its inline transform-origin (shoulder) — never give it a transform-box */

.walking .s-body{ animation:dscWalkBob .32s ease-in-out infinite; }
.walking .head  { animation:dscWalkHead .32s ease-in-out infinite; animation-delay:-.05s; }
.walking .leg-l { animation:dscLegSwing .64s ease-in-out infinite; }
.walking .leg-r { animation:dscLegSwing .64s ease-in-out infinite; animation-delay:-.32s; }
.walking .arm-l { animation:dscArmSwing .64s ease-in-out infinite; }
.walking .arm-r { animation:dscArmSwing .64s ease-in-out infinite; animation-delay:-.32s; }

.flame{
  transform-box:fill-box; transform-origin:50% 100%;
  animation:dscFlame 1.5s linear infinite;
}
.glow{
  transform-box:fill-box; transform-origin:50% 50%;
  animation:dscGlow 2.9s ease-in-out infinite;
}

.bat{
  transform-box:fill-box; transform-origin:50% 60%;
  animation:dscBat 2.6s ease-in-out infinite;
}
.bat:nth-child(2){ animation-duration:2.2s; animation-delay:-.55s; }
.bat:nth-child(3){ animation-duration:2.95s; animation-delay:-1.35s; }

.web{
  transform-box:fill-box; transform-origin:0 0;
  animation:dscWeb 7s ease-in-out infinite;
}
.sway{
  transform-box:fill-box; transform-origin:50% 100%;
  animation:dscSway 4s ease-in-out infinite;
}
/* .spider pivots where its thread meets the web; .spider-body swings under it */
.spider{
  transform-box:fill-box; transform-origin:50% 0;
  animation:dscSpiderBob 5.6s ease-in-out infinite;
}
.spider-body{
  transform-box:fill-box; transform-origin:50% 0;
  animation:dscSpiderSway 4.3s ease-in-out infinite; animation-delay:-1.4s;
}
.carve{ animation:dscCarve 3.4s ease-in-out infinite; }
.carve-b{ animation-duration:3.9s; animation-delay:-1.2s; }

.wheel{ transform-box:fill-box; transform-origin:50% 50%; }
.rolling .wheel{ animation:dscWheel .85s linear infinite; }
.beam{
  transform-box:fill-box; transform-origin:50% 50%;
  animation:dscBeam 1.4s ease-in-out infinite;
}
.lens{
  transform-box:fill-box; transform-origin:50% 50%;
  animation:dscLens 1.4s ease-in-out infinite; animation-delay:-.24s;
}

/* ---- kill switch ---- */
@media (prefers-reduced-motion: reduce){
  .s-body,.head,.arm,.leg-l,.leg-r,.drift,.flame,.glow,.bat,.web,.spider,.spider-body,.sway,.carve,.wheel,.beam,.lens{
    animation:none !important;
  }
}
`;

  var STYLE_ID = 'sprites-anim';

  /* idempotent: injects <style id="sprites-anim"> once.
     returns true if it injected now, false if it was already there. */
  function injectAnimCSS() {
    if (typeof document === 'undefined' || !document.head) return false;
    if (document.getElementById(STYLE_ID)) return false;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = animCSS;
    document.head.appendChild(el);
    return true;
  }

  /* ==== PUBLIC API ===================================================== */

  window.SPRITES = {
    animCSS: animCSS,
    injectAnimCSS: injectAnimCSS,
    npcGhost: npcGhost,
    npcPumpkin: npcPumpkin,
    npcWitchling: npcWitchling,
    npcSkeleton: npcSkeleton,
    npcBat: npcBat,
    car: car,
    passerCar: passerCar,
    trashCan: trashCan,
    lampPost: lampPost,
    mailbox: mailbox,
    gnome: gnome,
    cobweb: cobweb,
    bats: bats,
    tombstone: tombstone,
    scarecrow: scarecrow,
    candleLantern: candleLantern,
    pumpkinPair: pumpkinPair
  };
})();
