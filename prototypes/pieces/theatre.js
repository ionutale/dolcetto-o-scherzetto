/**
 * theatre.js — the TRICK THEATRE for "Dolcetto o Scherzetto".
 * Classic script (no modules, file://-safe). Exposes window.Theatre.
 *
 * API:
 *   Theatre.init(rootEl)                      — one-time: injects CSS + creates layers
 *   Theatre.start(trickId, doorX, doorY, hooks) — plays one ~2.4s show at the door
 *                                               hooks (all optional): { sound(name), onClimax(id), onDone(id) }
 *   Theatre.cancel()                          — clears timers/props/veil immediately (safe anytime)
 *
 * Timeline: 0 veil+setup → ~0.6–1.7s gag → 1.9s onClimax (+ theatre-laugh) → 2.4s onDone → veil out ~3.0s.
 * Motion: transform/opacity only. Loops (wobble/swing/wave) are dropped under prefers-reduced-motion.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* state                                                              */
  /* ------------------------------------------------------------------ */
  var T = { layer: null, veil: null, spot: null, cone: null, props: null, timers: [] };
  var RM = false; // prefers-reduced-motion

  function later(ms, fn) {
    var id = setTimeout(fn, ms);
    T.timers.push(id);
    return id;
  }
  function kick(el) { void el.offsetWidth; }

  function mk(cls, tag) {
    var d = document.createElement(tag || 'div');
    d.className = cls;
    return d;
  }

  /* add a prop div anchored at (x, y) = top-left of its box; opts = extra inline styles */
  function add(html, x, y, opts) {
    var d = mk('tt-p');
    d.innerHTML = html;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (opts) for (var k in opts) d.style[k] = opts[k];
    T.props.appendChild(d);
    return d;
  }
  /* add a text element anchored at centre via translate(-50%,-50%) (starts scale .2, opacity 0) */
  function txt(html, x, y, size) {
    var d = mk('tt-txt');
    d.innerHTML = html;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (size) d.style.fontSize = size + 'px';
    T.props.appendChild(d);
    return d;
  }
  function popText(el) {
    kick(el);
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1) rotate(-3deg)';
  }
  /* transition a prop to a new transform */
  function moveTo(el, transform, dur, harvest) {
    el.style.transition = 'transform ' + (dur || 0.35) + 's cubic-bezier(.3,1.4,.5,1)' +
      (harvest === false ? '' : ', opacity .35s ease');
    kick(el);
    el.style.transform = transform;
  }

  /* ------------------------------------------------------------------ */
  /* injected CSS                                                       */
  /* ------------------------------------------------------------------ */
  var CSS = [
    '.tt-layer{position:absolute;inset:0;pointer-events:none;z-index:40;overflow:hidden;}',
    '.tt-veil{position:absolute;inset:0;background:rgba(12,7,30,.45);opacity:0;transition:opacity .5s ease;}',
    '.tt-veil.on{opacity:1;}',
    '.tt-veil.out{opacity:0;}',
    '.tt-spot{position:absolute;width:390px;height:320px;opacity:0;transition:opacity .55s ease;}',
    '.tt-spot.on{opacity:1;}',
    '.tt-spot.out{opacity:0;transition-duration:.5s;}',
    '.tt-cone{position:absolute;opacity:0;transition:opacity .6s ease;filter:blur(6px);}',
    '.tt-cone.on{opacity:1;}',
    '.tt-cone.out{opacity:0;}',
    '.tt-props{position:absolute;inset:0;}',
    '.tt-props.out{opacity:0;transition:opacity .5s ease;}',
    '.tt-p{position:absolute;will-change:transform,opacity;transform-origin:50% 100%;}',
    '.tt-ain{display:block;transform-origin:50% 100%;}',
    '.tt-txt{position:absolute;opacity:0;transform:translate(-50%,-50%) scale(.2);',
    'font-family:"Fredoka","Baloo 2","Trebuchet MS",system-ui,sans-serif;font-weight:700;color:#fff6e5;',
    'letter-spacing:.03em;white-space:nowrap;',
    'text-shadow:0 3px 0 rgba(58,40,78,.55),0 10px 28px rgba(10,6,30,.6);',
    'transition:transform .3s cubic-bezier(.3,1.7,.5,1),opacity .18s ease;}',
    '.tt-txt.on{opacity:1;}',
    '.tt-mat{width:100%;height:100%;border-radius:9px;background:#4a3728;',
    'box-shadow:inset 0 -3px 0 #33261c,0 4px 10px rgba(10,6,30,.35);}',
    '.tt-mat::after{content:"";position:absolute;top:3px;left:8px;right:8px;border-top:2px dashed rgba(255,246,229,.22);}',
    '.tt-puff{position:absolute;border-radius:50%;',
    'background:radial-gradient(closest-side,rgba(255,246,229,.85),rgba(255,246,229,.35) 55%,rgba(255,246,229,0) 78%);}',
    '/* loops — dropped under prefers-reduced-motion (rule §4) */',
    '@media (prefers-reduced-motion: no-preference){',
    '@keyframes ttWob{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}',
    '.wob{animation:ttWob .17s ease-in-out infinite alternate;}',
    '@keyframes ttSwing{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}',
    '.swing{animation:ttSwing .55s ease-in-out infinite alternate;}',
    '@keyframes ttSwig{from{transform:scaleY(1) rotate(-5deg)}to{transform:scaleY(1.04) rotate(5deg)}}',
    '.swig{animation:ttSwig .22s ease-in-out 4 alternate;}',
    '@keyframes ttShake{from{transform:translateX(-2px) rotate(-2deg)}to{transform:translateX(2px) rotate(2deg)}}',
    '.shake{animation:ttShake .09s linear 5 alternate;}',
    '}',
    '@media (prefers-reduced-motion: reduce){',
    '.wob,.swing,.swig,.shake{animation:none !important;}',
    '}'
  ].join('');
  function injectCSS() {
    if (document.getElementById('tt-style')) return;
    var st = document.createElement('style');
    st.id = 'tt-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /* shared SVG stage gear (spotlight pool + cone)                      */
  /* ------------------------------------------------------------------ */
  var coneI = 0;
  var SPOT_SVG =
    '<svg width="390" height="320" viewBox="0 0 390 320" style="display:block">' +
    '<defs><radialGradient id="tt-spotg" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0" stop-color="#ffd9a0" stop-opacity=".5"/>' +
    '<stop offset=".55" stop-color="#ffd9a0" stop-opacity=".2"/>' +
    '<stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>' +
    '</radialGradient></defs>' +
    '<ellipse cx="195" cy="160" rx="195" ry="160" fill="url(#tt-spotg)"/>'
  +'</svg>';

  /* ------------------------------------------------------------------ */
  /* prop artwork (bold, ~1.5× world scale, plain palette)              */
  /* ------------------------------------------------------------------ */
  function coneSVG() {
    var id = 'tt-coneg' + (coneI++);
    return '<svg width="212" height="100%" viewBox="0 0 212 172" preserveAspectRatio="none" style="display:block">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffe9c4" stop-opacity=".32"/>' +
      '<stop offset=".72" stop-color="#ffd9a0" stop-opacity=".1"/>' +
      '<stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="M86 0 h40 L211 172 H1 Z" fill="url(#' + id + ')"/>' +
      '</svg>';
  }

  var SVG = {};
  SVG.ghostBig =
    '<svg width="96" height="112" viewBox="0 0 96 112" style="display:block">' +
    '<path d="M12 104 Q8 40 48 18 Q88 40 84 104 Q75 95 67 103 Q59 111 48 103 Q37 111 29 103 Q21 95 12 104 Z" fill="#f6f0ff"/>' +
    '<path d="M48 18 Q40 48 44 104 L48 104 Q56 50 51 20 Z" fill="#e4d9f5" opacity=".65"/>' +
    '<ellipse cx="35" cy="52" rx="9.5" ry="8" fill="#3a2f4e"/><ellipse cx="61" cy="52" rx="9.5" ry="8" fill="#3a2f4e"/>' +
    '<circle cx="37.5" cy="49.5" r="2.8" fill="#fff"/><circle cx="63.5" cy="49.5" r="2.8" fill="#fff"/>' +
    '<ellipse cx="24" cy="66" rx="4.4" ry="3.2" fill="#e7c6e0" opacity=".9"/>' +
    '<ellipse cx="72" cy="66" rx="4.4" ry="3.2" fill="#e7c6e0" opacity=".9"/>' +
    '<ellipse cx="48" cy="76" rx="13" ry="9.4" fill="#3a2f4e"/>' +
    '<ellipse cx="48" cy="79.5" rx="8.6" ry="5" fill="#8a5a72"/>' +
    '</svg>';

  SVG.spider =
    '<svg width="78" height="316" viewBox="-20 -120 78 316" style="display:block">' +
    '<line x1="18" y1="-120" x2="18" y2="133" stroke="#c9b6ff" stroke-width="3" stroke-linecap="round" opacity=".8"/>' +
    // spider drawn at 1.7× about its body centre (18,152) so it reads at 60–130px like the other props
    '<g transform="translate(18 152) scale(1.7) translate(-18 -152)">' +
    '<ellipse cx="18" cy="152" rx="15" ry="13.5" fill="#3a2f5e"/>' +
    '<path d="M18 141 Q10 130 12 118" stroke="#3a2f5e" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M18 141 Q27 130 25 118" stroke="#3a2f5e" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M6 150 Q-4 146 1 138 M31 150 Q41 146 36 138" stroke="#3a2f5e" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M8 163 Q2 170 9 174 M29 163 Q35 170 28 174" stroke="#3a2f5e" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
    '<circle cx="12.4" cy="148" r="4.6" fill="#fff"/><circle cx="23.6" cy="148" r="4.6" fill="#fff"/>' +
    '<circle cx="13" cy="148.6" r="2.4" fill="#2e2751"/><circle cx="23" cy="148.6" r="2.4" fill="#2e2751"/>' +
    '<path d="M13.5 158 Q17 161 20.5 158" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '</g></svg>';

  SVG.canTin =
    '<svg width="76" height="46" viewBox="0 0 76 46" style="display:block">' +
    '<rect x="2" y="6" width="72" height="34" rx="10" fill="#c98a4b"/>' +
    '<rect x="2" y="6" width="72" height="10" rx="5" fill="#e0aa74"/>' +
    '<rect x="10" y="18" width="56" height="4" rx="2" fill="#a56e3c" opacity=".7"/>' +
    '<path d="M38 24 l3 6 6.4 .6 -4.8 4.2 1.4 6.2 -6 -3.4 -6 3.4 1.4 -6.2 -4.8 -4.2 6.4 -.6 Z" fill="#8a6a52" opacity=".5"/>' +
    '</svg>';

  SVG.canLid =
    '<svg width="48" height="14" viewBox="0 0 48 14" style="display:block">' +
    '<ellipse cx="24" cy="7" rx="23" ry="6" fill="#e8a93a"/>' +
    '<ellipse cx="24" cy="5.6" rx="17" ry="3.6" fill="#ffd166"/>' +
    '</svg>';

  SVG.snake =
    '<svg width="74" height="88" viewBox="0 0 74 88" style="display:block">' +
    '<path d="M37 88 C12 76 62 64 37 52 C12 40 62 28 37 16" stroke="#95c47d" stroke-width="9" fill="none" stroke-linecap="round"/>' +
    '<circle cx="37" cy="12" r="10.5" fill="#95c47d"/>' +
    '<circle cx="33.6" cy="9.6" r="1.9" fill="#2e2751"/><circle cx="41" cy="9.6" r="1.9" fill="#2e2751"/>' +
    '<path d="M40 16.5 Q46 18.5 44.6 21.5" stroke="#e8874a" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  SVG.maskStick =
    '<svg width="96" height="152" viewBox="0 0 96 152" style="display:block">' +
    '<rect x="44" y="92" width="8" height="58" rx="4" fill="#6b513d"/>' +
    '<ellipse cx="48" cy="52" rx="38" ry="35" fill="#9a8fc0"/>' +
    '<circle cx="24" cy="26" r="7" fill="#9a8fc0"/><circle cx="72" cy="26" r="7" fill="#9a8fc0"/>' +
    '<path d="M12 44 q3 -8 9 -8 M84 44 q-3 -8 -9 -8" stroke="#8a7fb4" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="34" cy="47" rx="9.5" ry="10.4" fill="#fff6e5"/><ellipse cx="62" cy="47" rx="9.5" ry="10.4" fill="#fff6e5"/>' +
    '<circle cx="35.5" cy="50" r="4.6" fill="#3a2f4e"/><circle cx="60.5" cy="50" r="4.6" fill="#3a2f4e"/>' +
    '<circle cx="36.8" cy="48.4" r="1.5" fill="#fff"/><circle cx="61.8" cy="48.4" r="1.5" fill="#fff"/>' +
    '<path d="M28 68 Q48 82 68 68 Q66 76 58 79 L38 79 Q30 76 28 68 Z" fill="#3a2f4e"/>' +
    '<rect x="36" y="71" width="6" height="7" rx="2" fill="#fff6e5"/>' +
    '<rect x="44.5" y="72.5" width="6" height="7" rx="2" fill="#fff6e5"/>' +
    '<rect x="53" y="71" width="6" height="7" rx="2" fill="#fff6e5"/>' +
    '</svg>';

  SVG.mouse =
    '<svg width="86" height="58" viewBox="-6 -4 86 58" style="display:block">' +
    '<path d="M14 32 C4 22 2 40 14 44" stroke="#9a8fc0" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="44" cy="32" rx="26" ry="16" fill="#9a8fc0"/>' +
    '<ellipse cx="52" cy="36" rx="13" ry="8.6" fill="#cbbfdd"/>' +
    '<circle cx="24" cy="18" r="8.4" fill="#9a8fc0"/><circle cx="24" cy="18" r="4.4" fill="#cbbfdd"/>' +
    '<path d="M6 12 q-4 2 -5 6 M7 14 q-3 6 2 9" stroke="#3d3468" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/>' +
    '<circle cx="61" cy="27" r="4.4" fill="#3a2f4e"/>' +
    '<circle cx="61.9" cy="25.6" r="1.4" fill="#fff"/>' +
    '<circle cx="68.6" cy="31" r="3" fill="#e8a93a"/>' +
    '<rect x="22" y="-1" width="4" height="8" rx="2" fill="#ffd166"/>' +
    '<rect x="28" y="-2" width="4" height="8" rx="2" fill="#ffd166"/>' +
    '<path d="M-2 2 q-2 8 0 10" stroke="#e8a93a" stroke-width="3.6" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  SVG.cushion =
    '<svg width="84" height="34" viewBox="0 0 84 34" style="display:block">' +
    '<ellipse cx="38" cy="18" rx="36" ry="12.4" fill="#ff7a59"/>' +
    '<ellipse cx="30" cy="14" rx="17" ry="5" fill="#ffffff40"/>' +
    '<rect x="68" y="12" width="10" height="12" rx="4" fill="#e8874a"/>' +
    '<ellipse cx="73" cy="10" rx="4.8" ry="3.4" fill="#ff9e57"/>' +
    '</svg>';

  SVG.miniGhost =
    '<svg width="62" height="66" viewBox="0 0 62 66" style="display:block">' +
    '<path d="M6 62 Q5 20 31 8 Q57 20 56 62 Q51 56 46.5 61 Q41 66 31 61 Q21 66 15.5 61 Q11 56 6 62 Z" fill="#f6f0ff"/>' +
    '<path d="M31 8 Q27 26 29 62 L32 62 Q36 26 33 9 Z" fill="#e4d9f5" opacity=".6"/>' +
    '<ellipse cx="23" cy="30" rx="5.4" ry="6" fill="#3a2f4e"/><ellipse cx="39" cy="30" rx="5.4" ry="6" fill="#3a2f4e"/>' +
    '<circle cx="24.4" cy="28" r="1.7" fill="#fff"/><circle cx="40.4" cy="28" r="1.7" fill="#fff"/>' +
    '<ellipse cx="18" cy="40" rx="3" ry="2.2" fill="#e7c6e0" opacity=".9"/>' +
    '<ellipse cx="44" cy="40" rx="3" ry="2.2" fill="#e7c6e0" opacity=".9"/>' +
    '<path d="M27 45 Q31 48.6 35 45" stroke="#3a2f4e" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  SVG.bucket =
    '<svg width="64" height="54" viewBox="0 0 64 54" style="display:block">' +
    '<path d="M31 2 V7" stroke="#7fb069" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M7 16 H57 L53.4 44 Q32 50 10.6 44 Z" fill="#ff9e57"/>' +
    '<ellipse cx="32" cy="16" rx="25" ry="6.5" fill="#e8874a"/>' +
    '<ellipse cx="32" cy="14.6" rx="18" ry="4" fill="#3a2f4e"/>' +
    '<path d="M14 5 Q32 -8 50 5" stroke="#e8a93a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M22 26 L28 30 L23 33 Z" fill="#3a2f4e"/>' +
    '<path d="M42 26 L36 30 L41 33 Z" fill="#3a2f4e"/>' +
    '<path d="M24 36 Q32 41 40 36" stroke="#3a2f4e" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M11 34 Q12 42 15 44.4" stroke="#e8874a" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
    '</svg>';

  /* a furry monster arm in two poses inside one SVG: the open hand (slide-out, wave,
     high-five) and a thumbs-up (finale). The sleeve runs off the right edge, so the arm
     tucks behind the door frame and pivots about its elbow; fingers live in .tt-f1…4
     groups (each wrapped) so the show can flick/wiggle them one by one. */
  SVG.hand =
    '<svg width="100" height="88" viewBox="0 0 100 88" style="display:block">' +
    '<rect x="68" y="26" width="36" height="34" rx="16" fill="#8a7fb4"/>' +
    '<rect x="66" y="23" width="12" height="40" rx="6" fill="#755f9e"/>' +
    '<circle cx="76" cy="43" r="17" fill="#9a8fc0"/>' +
    '<rect x="30" y="30" width="56" height="26" rx="13" fill="#9a8fc0"/>' +
    '<ellipse cx="36" cy="43" rx="23" ry="20" fill="#9a8fc0"/>' +
    '<path d="M44 31 q3 -4 6 0 M56 30 q3 -4 6 0 M19 37 q3 -4 6 -6" stroke="#cbbfdd" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>' +
    '<g class="tt-open">' +
    '<rect x="10" y="30" width="11" height="22" rx="5.5" fill="#9a8fc0" transform="rotate(-32 15.5 52)"/>' +
    '<g transform="rotate(-16 17 33)"><g class="tt-f1" style="transform-box:fill-box;transform-origin:50% 100%">' +
    '<rect x="11" y="7" width="12" height="26" rx="6" fill="#9a8fc0"/><ellipse cx="17" cy="26" rx="3.5" ry="4.5" fill="#cbbfdd" opacity=".75"/>' +
    '</g></g>' +
    '<g transform="rotate(-5 29 32)"><g class="tt-f2" style="transform-box:fill-box;transform-origin:50% 100%">' +
    '<rect x="23" y="2" width="12" height="30" rx="6" fill="#9a8fc0"/><ellipse cx="29" cy="24" rx="3.5" ry="4.5" fill="#cbbfdd" opacity=".75"/>' +
    '</g></g>' +
    '<g transform="rotate(6 41 32)"><g class="tt-f3" style="transform-box:fill-box;transform-origin:50% 100%">' +
    '<rect x="35" y="4" width="12" height="28" rx="6" fill="#9a8fc0"/><ellipse cx="41" cy="26" rx="3.5" ry="4.5" fill="#cbbfdd" opacity=".75"/>' +
    '</g></g>' +
    '<g transform="rotate(17 51.5 33)"><g class="tt-f4" style="transform-box:fill-box;transform-origin:50% 100%">' +
    '<rect x="46" y="10" width="11" height="23" rx="5.5" fill="#9a8fc0"/><ellipse cx="51.5" cy="27" rx="3" ry="4" fill="#cbbfdd" opacity=".75"/>' +
    '</g></g>' +
    '</g>' +
    '<g class="tt-thumbs" opacity="0">' +
    '<rect x="12" y="22" width="46" height="34" rx="15" fill="#9a8fc0"/>' +
    '<rect x="24" y="2" width="13" height="24" rx="6.5" fill="#9a8fc0"/>' +
    '<path d="M22 30 q6 -3 12 0 M36 28 q6 -3 12 0 M18 48 q17 6 34 0" stroke="#8a7fb4" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="24" cy="46" rx="7" ry="5" fill="#cbbfdd" opacity=".7"/>' +
    '</g>' +
    '</svg>';

  SVG.spark =
    '<svg width="26" height="26" viewBox="0 0 26 26" style="display:block">' +
    '<path d="M13 0 q2.6 9 13 13 q-10.4 4 -13 13 q-2.6 -9 -13 -13 q10.4 -4 13 -13 Z" fill="#ffd166"/>' +
    '</svg>';

  /* toggle SVGs for reduced motion — keep only opacity/crossing */

  /* ------------------------------------------------------------------ */
  /* show machinery                                                     */
  /* ------------------------------------------------------------------ */
  function sound(hooks, name) {
    if (hooks && typeof hooks.sound === 'function') { try { hooks.sound(name); } catch (e) {} }
  }

  function endShow(hooks) {
    if (T.veil)  T.veil.classList.add('out');
    if (T.spot)  T.spot.classList.add('out');
    if (T.cone)  T.cone.classList.add('out');
    if (T.props) T.props.classList.add('out');
  }

  function start(trickId, doorX, doorY, hooks) {
    if (!T.layer) return;
    clearProps();
    var sf = SHOWS[trickId];
    if (!sf) return;

    var o = {
      cx: doorX, cy: doorY,
      base: doorY + 55,
      face:  { x: doorX, y: doorY - 34 },
      knob:  { x: doorX + 20, y: doorY + 4 },
      hooks: hooks || {},
      reduce: RM
    };

    // spot + cone framing
    T.spot.style.left = (o.cx - 195) + 'px';
    T.spot.style.top  = (o.cy - 190) + 'px';
    var coneH = (o.base - 6) - (o.cy - 170);
    if (coneH < 40) coneH = 40;
    T.cone.style.left = (o.cx - 106) + 'px';
    T.cone.innerHTML = coneSVG();
    T.cone.style.top = (o.cy - 170) + 'px';
    T.cone.style.height = coneH + 'px';

    T.veil.classList.add('on');
    T.spot.classList.add('on');
    T.cone.classList.add('on');

    sound(o.hooks, 'theatre-setup');

    later(90, function () { sf(o); });
    later(1900, function () {
      sound(o.hooks, 'theatre-laugh');
      try { if (hooks && hooks.onClimax) hooks.onClimax(trickId); } catch (e) {}
    });
    later(2400, function () {
      try { if (hooks && hooks.onDone) hooks.onDone(trickId); } catch (e) {}
    });
    later(2450, endShow);
    later(3050, clearProps); // fully clean (removes classes too)
  }

  function clearProps() {
    while (T.timers.length) clearTimeout(T.timers.pop());
    if (T.props) { T.props.innerHTML = ''; T.props.classList.remove('out'); }
    if (T.veil)  T.veil.classList.remove('on', 'out');
    if (T.spot)  T.spot.classList.remove('on', 'out');
    if (T.cone)  T.cone.classList.remove('on', 'out');
  }

  function init(rootEl) {
    if (T.layer) return;
    try {
      RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}
    injectCSS();
    var root = rootEl || document.body;
    root.style.position = root.style.position || 'relative';
    T.layer = mk('tt-layer');
    T.veil  = mk('tt-veil');
    T.spot  = mk('tt-spot');
    T.spot.innerHTML = SPOT_SVG;
    T.cone  = mk('tt-cone');
    T.props = mk('tt-props');
    T.layer.appendChild(T.veil);
    T.layer.appendChild(T.spot);
    T.layer.appendChild(T.cone);
    T.layer.appendChild(T.props);
    root.appendChild(T.layer);
  }

  /* ------------------------------------------------------------------ */
  /* THE 8 SHOWS — each: setup → gag → reaction                          */
  /* ------------------------------------------------------------------ */
  var SHOWS = {};

  /* — 1 · BOO! — little ghost face rises over the doorstep, pops in the neighbor's face */
  SHOWS.boo = function (o) {
    var cx = o.cx, cy = o.cy;
    var g = add(SVG.ghostBig, cx - 48, cy - 104, { opacity: '0', transform: 'translateY(52px) scale(.72)' });
    later(120, function () {
      g.style.transition = 'transform .6s cubic-bezier(.3,1.5,.5,1), opacity .34s ease';
      kick(g);
      g.style.transform = 'translateY(-7px) scale(1.05)';
      g.style.opacity = '1';
    });
    later(760, function () {
      sound(o.hooks, 'fire:boo'); // the gag: it pops + shouts
      moveTo(g, 'translateY(0) scale(1.24)', .28, false);
      var t = txt('BOO!', cx, cy - 112, 48);
      popText(t);
    });
  };

  /* — 2 · RAGNETTO — spider on silk thread lowers onto the doorknob, then does a little dance */
  SHOWS.ragnetto = function (o) {
    var j = o.knob;
    // svg 316 tall, body centre at local y=152 → body lands on the knob, thread runs up past the frame
    var g = add(SVG.spider, j.x - 38, j.y - 272, { transform: 'translateY(-130px)' });
    later(340, function () { moveTo(g, 'translateY(0)', 0.65, false); });
    later(1040, function () {
      sound(o.hooks, 'fire:ragnetto'); // it touches down and starts its little dance
      if (!o.reduce) { g.style.transformOrigin = '50% 0px'; g.classList.add('swing'); }
    });
  };

  /* — 3 · SERPENTE — closed can slides in; lid pops; spring snake boings upward */
  SHOWS.serpente = function (o) {
    var cx = o.cx, base = o.base;
    var can   = add(SVG.canTin, cx - 38, base - 44, { transform: 'translateX(-200px)' });
    var snake = add(SVG.snake, cx - 37, base - 130, { transform: 'scaleY(.14)' });
    later(340, function () { moveTo(can, 'translateX(0)', .45); });
    later(860, function () {
      sound(o.hooks, 'fire:serpente');
      var lid = add(SVG.canLid, cx - 34, base - 52, null);
      lid.style.transition = 'transform .55s cubic-bezier(.2,.75,.4,1), opacity .3s ease .26s';
      kick(lid);
      lid.style.transform = 'translate(22px,-52px) rotate(84deg)';
      lid.style.opacity = '0';
    });
    later(1000, function () { moveTo(snake, 'scaleY(1)', .5, false); if (!o.reduce) snake.classList.add('swig'); });
  };

  /* — 4 · CUSCINO — whoopee cushion slides under the doormat; squashes flat with a puff cloud */
  SHOWS.cuscino = function (o) {
    var cx = o.cx, base = o.base;
    // z-order matters: cushion first, doormat added after so it lands ON TOP of it
    var cush = add(SVG.cushion, cx - 6, base - 34,
      { transform: 'translateX(-280px) rotate(-8deg)' });
    var mat = add('<div class="tt-mat"></div>', cx - 48, base - 13,
      { width: '96px', height: '13px', transform: 'translateY(-34px)', transformOrigin: '50% 100%' });

    later(140, function () { // setup: the doormat drops onto the doorstep
      moveTo(mat, 'translateY(0) scaleY(1.14)', .3, false);
    });
    later(430, function () { // setup → gag: the cushion scoots up and slides under the mat
      moveTo(cush, 'translateX(0) rotate(0deg)', .5);
    });
    later(950, function () { // the gag — flat as a pancake, nozzle poking out past the mat
      sound(o.hooks, 'fire:cuscino');
      moveTo(cush, 'translateY(0) scale(.86,.3)', .16, false);
    });
    later(1060, function () { moveTo(mat, 'translateY(0) scaleY(1.3)', .11, false); });
    later(1170, function () { moveTo(mat, 'translateY(0) scaleY(1)', .2, false); });
    later(1090, function () {
      // puff cloud escaping to the right of the nozzle + a little onomatopoeia
      pump(cx + 60, base - 16, 20, 0);
      pump(cx + 74, base - 6, 15, 110);
      pump(cx + 86, base - 22, 11, 220);
      var t = txt('<i style="font-style:italic;font-weight:700">prrft!</i>', cx + 74, base - 46, 22);
      popText(t);
    });
    function pump(x, y, r, delay) {
      later(delay, function () { // relative to the squash beat (the 1090ms callback)
        var p = add('', x, y, { width: r * 2 + 'px', height: r * 2 + 'px', opacity: '1' });
        p.className = 'tt-p tt-puff';
        kick(p);
        p.style.transition = 'transform 1s ease-out, opacity 1s ease';
        p.style.transform = 'translate(' + (8 + r * 1.5) + 'px,-32px) scale(1.35)';
        p.style.opacity = '0';
      });
    }
  };

  /* — 5 · MASCHERA — monster mask on a stick thrusts up into the neighbor's face — "BOOO!" */
  SHOWS.maschera = function (o) {
    var cx = o.cx, cy = o.cy;
    // offset left of centre so the stick doesn't land on the door's own centre groove
    var g = add(SVG.maskStick, cx - 74, cy - 118, { transform: 'translateY(160px)' });
    later(360, function () {
      sound(o.hooks, 'fire:maschera'); // the thrust
      moveTo(g, 'translateY(0)', .34);
    });
    later(720, function () {
      var t = txt('BOOO!', cx - 16, cy - 132, 50);
      popText(t);
      if (!o.reduce) g.classList.add('shake');
    });
  };

  /* — 6 · TOPOLINO — wind-up mouse zips across the doorstep with a wobble, stops, looks up innocently */
  SHOWS.topolino = function (o) {
    var cx = o.cx, base = o.base;
    var g = add('<div class="tt-ain" style="transform-origin:50% 100%">' + SVG.mouse + '</div>', cx - 46, base - 52,
      { transform: 'translateX(-440px)' });
    var inner = g.querySelector('.tt-ain');
    later(140, function () {
      sound(o.hooks, 'fire:topolino');
      moveTo(g, 'translateX(0)', .8, false);
      if (!o.reduce) { inner.style.transformOrigin = '50% 100%'; inner.classList.add('wob'); }
    });
    later(1000, function () {
      inner.classList.remove('wob');
      moveTo(inner, 'translateY(-10px) rotate(0deg)', .22, false);
      var t = txt('<span style="color:#ffd166">?</span>', cx + 4, base - 78, 24);
      popText(t);
    });
  };

  /* — 7 · FANTASMNO — tiny ghost puppet rises from the jack-o'-lantern bucket, twirls, takes a bow */
  SHOWS.fantasmino = function (o) {
    var cx = o.cx, base = o.base;
    var bx = cx - 32;
    var ghost = add(SVG.miniGhost, bx - 1, base - 88,
      { transform: 'translateY(20px) rotate(0deg) scale(.5)', transformOrigin: '50% 100%' });
    var bucket = add(SVG.bucket, bx, base - 48, null);
    later(220, function () {
      moveTo(ghost, 'translateY(-26px) rotate(0deg) scale(1)', .5);
      sound(o.hooks, 'fire:fantasmino');
    });
    later(760, function () { moveTo(ghost, 'translateY(-26px) rotate(720deg) scale(1)', .62, false); });
    later(1420, function () {
      // the bow — sink a touch and tip forward (net ~+26°), hem stays tucked at the bucket rim
      moveTo(ghost, 'translateY(-23px) rotate(746deg) scale(.94)', .34, false);
    });
  };

  /* — 8 · MANO — a furry hand slides out from behind the right door frame, waves a big
     "ciao", offers a high-five, gives a proud thumbs-up and slips back behind the frame.
     The doorway clip is the door frame: the arm hides behind it and pivots at its elbow. */
  SHOWS.mano = function (o) {
    var cx = o.cx, cy = o.cy;
    var clip = add('', cx - 56, cy - 113, { width: '112px', height: '200px', overflow: 'hidden' });
    var arm = mk('tt-p');
    arm.innerHTML = SVG.hand;
    arm.style.left = '16px';
    arm.style.top = '46px';
    arm.style.transformOrigin = '100% 50%'; // the elbow, right at the frame edge — arcs pivot here
    arm.style.transform = 'translateX(100px) rotate(-8deg)'; // fully tucked behind the frame
    clip.appendChild(arm);

    var openG = arm.querySelector('.tt-open'), thumbG = arm.querySelector('.tt-thumbs');
    var f = [], i;
    for (i = 1; i <= 4; i++) f.push(arm.querySelector('.tt-f' + i));
    // fingers start curled toward the frame, so the forearm + cuff lead the slide-out
    for (i = 0; i < 4; i++) f[i].style.transform = o.reduce ? 'rotate(0deg)' : 'rotate(34deg)';

    /* setup (0–0.7s) — the arm slides ~100px out of the frame, fingers flick open one by one */
    later(60, function () { moveTo(arm, 'translateX(0) rotate(0deg)', .55, false); });
    if (!o.reduce) {
      for (i = 0; i < 4; i++) (function (el, t) {
        later(t,       function () { moveTo(el, 'rotate(10deg)', .12, false); });
        later(t + 120, function () { moveTo(el, 'rotate(-12deg)', .11, false); });
        later(t + 230, function () { moveTo(el, 'rotate(0deg)', .13, false); });
      })(f[i], 260 + i * 90);
    }

    /* gag (0.7–1.8s) — three big arm arcs; fire cue + sparkle + "ciao!" on the first crest */
    function arc(delay, deg, dur) {
      later(delay, function () { moveTo(arm, 'translateX(0) rotate(' + deg + 'deg)', dur, false); });
    }
    arc(700, 32, .19); arc(930, -8, .17);
    arc(1100, 32, .19); arc(1330, -8, .17);
    arc(1500, 32, .19); arc(1730, 2, .16);
    [[890, 24, -95], [1290, 27, -99], [1690, 21, -93]].forEach(function (s, n) {
      later(s[0], function () {
        if (n === 0) sound(o.hooks, 'fire:mano'); // the gag: the first full wave
        sparkle(cx + s[1], cy + s[2]);
      });
    });
    later(890, function () { var t = txt('<i>ciao!</i>', cx - 40, cy - 100, 30); popText(t); });

    /* reaction (1.8–2.4s) — lean in for the high-five, soft puff on the contact beat,
       thumbs-up finish, then the arm slides back behind the frame */
    later(1790, function () {
      moveTo(arm, 'translateX(-18px) translateY(-2px) scale(1.1) rotate(4deg)', .28, false);
    });
    later(2030, function () {
      moveTo(arm, 'translateX(-12px) translateY(-1px) scale(1.05) rotate(2deg)', .12, false);
      pump(cx - 46, cy - 38, 22, 0);
      pump(cx - 26, cy - 52, 15, 110);
      pump(cx - 60, cy - 26, 12, 200);
    });
    later(2180, function () { // the thumbs-up cross-fade + a proud little bounce
      openG.style.transition = thumbG.style.transition = 'opacity .18s ease';
      openG.style.opacity = '0'; thumbG.style.opacity = '1';
      moveTo(arm, 'translateX(-14px) translateY(-1px) scale(1.06) rotate(-4deg)', .16, false);
    });
    later(2340, function () { moveTo(arm, 'translateX(100px) rotate(6deg)', .42, false); });

    function sparkle(x, y) {
      var s = add(SVG.spark, x - 13, y - 13, { opacity: '0', transform: 'scale(.2)' });
      s.style.transition = 'transform .2s cubic-bezier(.3,1.7,.5,1), opacity .14s ease';
      kick(s); s.style.opacity = '1'; s.style.transform = 'scale(1) rotate(10deg)';
      later(200, function () { s.style.opacity = '0'; s.style.transform = 'scale(1.5) rotate(-8deg)'; });
    }
    function pump(x, y, r, delay) {
      later(delay, function () {
        var p = add('', x, y, { width: r * 2 + 'px', height: r * 2 + 'px', opacity: '1' });
        p.className = 'tt-p tt-puff';
        kick(p);
        p.style.transition = 'transform .7s ease-out, opacity .7s ease';
        p.style.transform = 'translate(' + (-r * 1.1) + 'px,' + (-r * 1.4) + 'px) scale(1.3)';
        p.style.opacity = '0';
      });
    }
  };

  window.Theatre = {
    init: init,
    start: start,
    cancel: clearProps
  };
})();
