/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — HOUSE PACK (v1, prototype)
 *  Classic script: no modules, no build, no dependencies. Runs from file://.
 *
 *  USAGE
 *    <script src="houses.js"></script>
 *    el.innerHTML = HOUSES.list[3](1);      // type 3 (witch hut) x palette 1
 *    HOUSES.list.length  === 8              // eight silhouette-distinct types
 *    HOUSES.paletteCount === 3              // three coherent night families
 *
 *  TYPES (index order)
 *    0 cottage      gable cottage, chimney right
 *    1 townhouse    flat cornice, two stacked window floors
 *    2 tallNarrow   slim + steep gable, three floors + attic oculus
 *    3 witchHut     hunched walls, bent roof, leaning chimney
 *    4 manor        wide, hip roof, porch columns, twin chimneys
 *    5 roundTower   cylindrical tower + dome + low side wing
 *    6 victorian    round turret + fish-scale gable + porch awning
 *    7 farmhouse    wide porch, barn wing, hay + pumpkins
 *
 *  CONTRACT — exact, the host depends on it
 *    - viewBox "0 0 240 H", width always 240, H in 190..245.
 *      The svg is bottom-anchored: y = H is the ground line.
 *    - THE DOORWAY, always exactly:
 *        <rect x="92" y="H-80" width="56" height="80" rx="8" fill="#2a2038"/>
 *      56 wide, centered on x=120, its bottom edge flush with the svg's bottom.
 *      The region x 92..148 / y H-80..H stays clear of every other shape: the
 *      host overlays its swinging door leaf + the neighbor exactly over that
 *      box. Houses NEVER draw a door leaf.
 *    - Windows are single shapes with class="win", fill #ffd9a0 (the host dims
 *      them once a home is done). No children, no nested decor inside them.
 *    - paletteIdx selects the wall/roof family; out-of-range values wrap.
 *
 *  STYLE (ART-STYLE.md §3 §4 §7)
 *    rounded shapes, NO outlines — depth is darker-shade fills only.
 *    no <defs>, no ids, no external refs, no <image>, no text, no ground
 *    shadow (the host owns the sidewalk). Warm windows are the only high
 *    values on screen.
 * ============================================================================
 */
(function () {
  'use strict';

  /* three coherent night families — muted, token-adjacent, never bright ---- */
  var FAMILIES = [
    { key: 'mauve', label: 'mauve',
      wall: '#7a5c86', wallLight: '#8a6b93', wallDark: '#654b73',
      roof: '#3f3159', roofLite: '#4d3d6a', roofDark: '#332749',
      trim: '#8d76a8', stone: '#59406b', shrub: '#4f6b58' },
    { key: 'tealSlate', label: 'teal-slate',
      wall: '#52707a', wallLight: '#5f828c', wallDark: '#44606a',
      roof: '#2c4450', roofLite: '#37525f', roofDark: '#22353f',
      trim: '#6d8f98', stone: '#4a5f68', shrub: '#456b62' },
    { key: 'brickSage', label: 'brick-sage',
      wall: '#7d655e', wallLight: '#8b726a', wallDark: '#6a544e',
      roof: '#3d5148', roofLite: '#4a6156', roofDark: '#2f4038',
      trim: '#96a08c', stone: '#6b5c56', shrub: '#5a6b4e' }
  ];

  var OPENING = '#2a2038';   /* the host's doorway fill, per contract */
  var GLASS = '#ffd9a0';     /* warm window glass — the pack's only high value */

  function pal(i) { var n = FAMILIES.length, k = (i | 0) % n; return FAMILIES[k < 0 ? k + n : k]; }

  /* ---- primitives ------------------------------------------------------- */
  function svg(name, h, parts) {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="house" data-house="' + name +
      '" width="240" height="' + h + '" viewBox="0 0 240 ' + h + '">' + parts.join('') + '</svg>';
  }
  function door(h) {
    return '<rect x="92" y="' + (h - 80) + '" width="56" height="80" rx="8" fill="' + OPENING + '"/>';
  }
  function win(x, y, w, h, rx) {
    return '<rect class="win" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" rx="' + rx + '" fill="' + GLASS + '"/>';
  }
  function winRound(cx, cy, r) {
    return '<circle class="win" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + GLASS + '"/>';
  }
  /* soft warm halo, drawn under a window — never overlaps the doorway box */
  function halo(x, y, w, h, rx) {
    return '<rect x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (w + 8) + '" height="' + (h + 8) +
      '" rx="' + (rx + 4) + '" fill="' + GLASS + '" opacity=".12"/>';
  }
  /* filled gable roof: solid triangle + a darker right facet + ridge cap */
  function gableRoof(c, apexX, apexY, leftX, rightX, baseY, ridgeW) {
    var g = [];
    g.push('<path d="M' + leftX + ' ' + baseY + ' L' + apexX + ' ' + apexY + ' L' + rightX + ' ' + baseY +
      ' Z" fill="' + c.roof + '"/>');
    g.push('<path d="M' + apexX + ' ' + apexY + ' L' + rightX + ' ' + baseY + ' L' + apexX + ' ' + baseY +
      ' Z" fill="' + c.roofDark + '" opacity=".4"/>');
    if (ridgeW) {
      g.push('<rect x="' + (apexX - ridgeW / 2) + '" y="' + (apexY - 6) + '" width="' + ridgeW +
        '" height="13" rx="6" fill="' + c.roofLite + '"/>');
    }
    return g;
  }
  function shrub(cx, cy, rx, ry, c, op) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + c.shrub +
      '" opacity="' + (op || .9) + '"/>';
  }
  function sill(c, x, y, w) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="5" rx="2.5" fill="' + c.trim +
      '" opacity=".5"/>';
  }

  /* ---- 0. cottage ------------------------------------------------------- */
  function cottage(p) {
    var c = pal(p), H = 190, g = [], r;
    g.push('<rect x="22" y="76" width="196" height="114" rx="12" fill="' + c.wall + '"/>');
    g.push('<rect x="22" y="76" width="196" height="18" rx="9" fill="' + c.wallDark + '" opacity=".45"/>');
    g.push('<rect x="176" y="76" width="42" height="114" rx="12" fill="' + c.wallDark + '" opacity=".2"/>');
    r = gableRoof(c, 120, 22, 16, 224, 82, 20); g = g.concat(r);
    /* chimney, drawn over the roof slope */
    g.push('<rect x="166" y="16" width="20" height="44" rx="6" fill="' + c.roofLite + '"/>');
    g.push('<rect x="161" y="10" width="30" height="11" rx="5" fill="' + c.roofDark + '"/>');
    /* windows */
    g.push(halo(40, 104, 20, 20, 5), win(40, 104, 20, 20, 5), sill(c, 38, 126, 24));
    g.push(halo(180, 104, 20, 20, 5), win(180, 104, 20, 20, 5), sill(c, 178, 126, 24));
    /* door surround — clear of x 92..148 */
    g.push('<rect x="86" y="102" width="68" height="8" rx="4" fill="' + c.trim + '" opacity=".5"/>');
    g.push('<rect x="85" y="102" width="7" height="88" rx="3.5" fill="' + c.trim + '" opacity=".45"/>');
    g.push('<rect x="148" y="102" width="7" height="88" rx="3.5" fill="' + c.trim + '" opacity=".45"/>');
    g.push(shrub(36, 181, 20, 9, c), shrub(206, 180, 16, 8, c, .85));
    g.push('<rect x="22" y="182" width="196" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('cottage', H, g);
  }

  /* ---- 1. townhouse ----------------------------------------------------- */
  function townhouse(p) {
    var c = pal(p), H = 232, g = [], y;
    g.push('<rect x="26" y="38" width="188" height="194" rx="8" fill="' + c.wall + '"/>');
    g.push('<rect x="26" y="38" width="188" height="16" rx="8" fill="' + c.wallDark + '" opacity=".45"/>');
    g.push('<rect x="176" y="38" width="38" height="194" rx="8" fill="' + c.wallDark + '" opacity=".18"/>');
    /* flat cornice roofline */
    g.push('<rect x="20" y="22" width="200" height="12" rx="6" fill="' + c.roof + '"/>');
    g.push('<rect x="16" y="30" width="208" height="16" rx="6" fill="' + c.roofLite + '"/>');
    /* string course between floors */
    g.push('<rect x="26" y="94" width="188" height="6" fill="' + c.wallDark + '" opacity=".4"/>');
    /* stacked windows: two upper floors + a ground pair */
    y = [62, 110];
    for (var i = 0; i < 2; i++) {
      g.push(halo(48, y[i], 20, 20, 5), win(48, y[i], 20, 20, 5));
      g.push(halo(174, y[i], 20, 20, 5), win(174, y[i], 20, 20, 5));
      if (i === 0) { g.push(sill(c, 46, 84, 24), sill(c, 172, 84, 24)); }
    }
    g.push(halo(40, 166, 20, 26, 5), win(40, 166, 20, 26, 5), sill(c, 38, 194, 24));
    g.push(halo(172, 166, 20, 26, 5), win(172, 166, 20, 26, 5), sill(c, 170, 194, 24));
    /* pilasters + lintel — clear of x 92..148 */
    g.push('<rect x="83" y="146" width="9" height="86" rx="4" fill="' + c.trim + '" opacity=".55"/>');
    g.push('<rect x="148" y="146" width="9" height="86" rx="4" fill="' + c.trim + '" opacity=".55"/>');
    g.push('<rect x="83" y="138" width="74" height="9" rx="4" fill="' + c.trim + '" opacity=".55"/>');
    g.push('<rect x="26" y="224" width="188" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('townhouse', H, g);
  }

  /* ---- 2. tallNarrow ---------------------------------------------------- */
  function tallNarrow(p) {
    var c = pal(p), H = 245, g = [], r, ys = [52, 92, 132];
    g.push('<rect x="76" y="42" width="88" height="203" rx="10" fill="' + c.wall + '"/>');
    g.push('<rect x="76" y="42" width="88" height="16" rx="10" fill="' + c.wallDark + '" opacity=".45"/>');
    g.push('<rect x="138" y="42" width="26" height="203" rx="10" fill="' + c.wallDark + '" opacity=".22"/>');
    r = gableRoof(c, 120, 6, 66, 174, 50, 16); g = g.concat(r);
    /* attic oculus, on the roof's face */
    g.push('<circle cx="120" cy="32" r="10" fill="' + GLASS + '" opacity=".12"/>', winRound(120, 32, 7));
    /* three floors, one slim arched window each */
    for (var i = 0; i < ys.length; i++) {
      g.push(halo(111, ys[i], 18, 20, 9), win(111, ys[i], 18, 20, 9), sill(c, 108, ys[i] + 20, 24));
    }
    g.push('<rect x="86" y="155" width="68" height="9" rx="4" fill="' + c.trim + '" opacity=".5"/>');
    g.push('<rect x="85" y="155" width="7" height="90" rx="3.5" fill="' + c.trim + '" opacity=".45"/>');
    g.push('<rect x="148" y="155" width="7" height="90" rx="3.5" fill="' + c.trim + '" opacity=".45"/>');
    g.push('<rect x="76" y="238" width="88" height="7" rx="3.5" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('tallNarrow', H, g);
  }

  /* ---- 3. witchHut ------------------------------------------------------ */
  function witchHut(p) {
    var c = pal(p), H = 214, g = [];
    /* hunched, asymmetrical body */
    g.push('<path d="M30 214 Q26 132 46 104 Q86 92 126 94 Q176 90 200 106 Q212 138 210 214 Z" fill="' + c.wall + '"/>');
    g.push('<path d="M170 98 Q190 96 200 106 Q212 138 210 214 L176 214 Z" fill="' + c.wallDark + '" opacity=".22"/>');
    /* leaning chimney — behind the roof, so the sag cuts it */
    g.push('<g transform="rotate(-16 196 58)"><rect x="186" y="24" width="21" height="74" rx="6" fill="' +
      c.roofLite + '"/><rect x="181" y="18" width="31" height="11" rx="5" fill="' + c.roofDark + '"/></g>');
    /* bent roof: solid mass (steep left slope, kinked peak, sagging right
       slope) whose lower edge overlaps the body — never a floating hoop */
    g.push('<path d="M24 112 L92 44 L118 52 Q170 74 218 106 L218 116 L24 116 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M118 52 Q170 74 218 106 L218 116 L118 116 Z" fill="' + c.roofDark + '" opacity=".3"/>');
    g.push('<rect x="92" y="38" width="26" height="13" rx="6" fill="' + c.roofLite + '"/>');
    /* round-top door frame hugging the host's rectangular opening */
    g.push('<path d="M78 158 L78 150 Q78 122 120 122 Q162 122 162 150 L162 158 L150 158 L150 150 Q150 136 120 136 Q90 136 90 150 L90 158 Z" fill="' +
      c.stone + '"/>');
    g.push('<path d="M90 150 Q90 136 120 136 Q150 136 150 150" stroke="' + c.wallDark +
      '" stroke-width="3" fill="none" opacity=".45"/>');
    /* crooked, mismatched windows */
    g.push('<circle cx="60" cy="142" r="14" fill="' + GLASS + '" opacity=".12"/>', winRound(60, 142, 10));
    g.push(halo(156, 166, 20, 20, 6), win(156, 166, 20, 20, 6), sill(c, 154, 188, 24));
    /* moss + pebbles at the base */
    g.push(shrub(52, 206, 22, 7, c, .32), shrub(186, 204, 20, 7, c, .28));
    g.push('<ellipse cx="72" cy="210" rx="10" ry="5" fill="' + c.stone + '" opacity=".35"/>');
    g.push('<rect x="30" y="206" width="180" height="8" rx="4" fill="' + c.wallDark + '" opacity=".5"/>');
    g.push(door(H));
    return svg('witchHut', H, g);
  }

  /* ---- 4. manor --------------------------------------------------------- */
  function manor(p) {
    var c = pal(p), H = 200, g = [];
    g.push('<rect x="10" y="74" width="220" height="126" rx="10" fill="' + c.wall + '"/>');
    g.push('<rect x="10" y="74" width="220" height="16" rx="8" fill="' + c.wallDark + '" opacity=".4"/>');
    g.push('<rect x="200" y="74" width="30" height="126" rx="10" fill="' + c.wallDark + '" opacity=".2"/>');
    /* hip roof + end facets + ridge */
    g.push('<path d="M2 78 L56 30 L184 30 L238 78 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M2 78 L56 30 L62 30 L14 78 Z" fill="' + c.roofDark + '" opacity=".5"/>');
    g.push('<path d="M238 78 L184 30 L178 30 L226 78 Z" fill="' + c.roofDark + '" opacity=".5"/>');
    g.push('<rect x="56" y="24" width="128" height="10" rx="5" fill="' + c.roofLite + '"/>');
    /* twin chimneys */
    g.push('<rect x="40" y="6" width="18" height="36" rx="5" fill="' + c.roofLite + '"/>');
    g.push('<rect x="35" y="2" width="28" height="10" rx="5" fill="' + c.roofDark + '"/>');
    g.push('<rect x="182" y="6" width="18" height="36" rx="5" fill="' + c.roofLite + '"/>');
    g.push('<rect x="177" y="2" width="28" height="10" rx="5" fill="' + c.roofDark + '"/>');
    /* windows */
    g.push(halo(30, 96, 26, 38, 7), win(30, 96, 26, 38, 7));
    g.push(halo(184, 96, 26, 38, 7), win(184, 96, 26, 38, 7));
    g.push(halo(40, 150, 20, 20, 5), win(40, 150, 20, 20, 5), sill(c, 38, 172, 24));
    g.push(halo(180, 150, 20, 20, 5), win(180, 150, 20, 20, 5), sill(c, 178, 172, 24));
    /* pediment over the door — entirely above y=120 */
    g.push('<path d="M84 118 L120 98 L156 118 Z" fill="' + c.trim + '" opacity=".85"/>');
    /* columns beside the door — clear of x 92..148 */
    g.push('<rect x="72" y="130" width="12" height="70" rx="6" fill="' + c.trim + '"/>');
    g.push('<rect x="68" y="122" width="20" height="8" rx="4" fill="' + c.trim + '"/>');
    g.push('<rect x="68" y="192" width="20" height="8" rx="4" fill="' + c.trim + '"/>');
    g.push('<rect x="156" y="130" width="12" height="70" rx="6" fill="' + c.trim + '"/>');
    g.push('<rect x="152" y="122" width="20" height="8" rx="4" fill="' + c.trim + '"/>');
    g.push('<rect x="152" y="192" width="20" height="8" rx="4" fill="' + c.trim + '"/>');
    g.push(shrub(30, 190, 18, 8, c), shrub(210, 190, 18, 8, c, .85));
    g.push('<rect x="10" y="192" width="220" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('manor', H, g);
  }

  /* ---- 5. roundTower ---------------------------------------------------- */
  function roundTower(p) {
    var c = pal(p), H = 236, g = [];
    /* low side wing, left */
    g.push('<rect x="6" y="150" width="60" height="86" rx="10" fill="' + c.wall + '"/>');
    g.push('<rect x="6" y="150" width="60" height="14" rx="7" fill="' + c.wallDark + '" opacity=".35"/>');
    g.push('<path d="M0 154 L74 138 L74 152 L0 168 Z" fill="' + c.roof + '"/>');
    g.push(halo(20, 176, 22, 22, 6), win(20, 176, 22, 22, 6), sill(c, 18, 200, 26));
    /* cylindrical tower */
    g.push('<path d="M64 120 Q64 94 94 94 L146 94 Q176 94 176 120 L176 236 L64 236 Z" fill="' + c.wall + '"/>');
    g.push('<rect x="70" y="124" width="18" height="112" rx="9" fill="' + c.wallLight + '" opacity=".3"/>');
    g.push('<rect x="150" y="116" width="26" height="120" rx="13" fill="' + c.wallDark + '" opacity=".35"/>');
    /* dome + ribs + finial */
    g.push('<path d="M60 98 A60 38 0 0 1 180 98 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M96 66 L92 98 M144 66 L148 98" stroke="' + c.roofDark + '" stroke-width="2" fill="none" opacity=".3"/>');
    g.push('<rect x="117" y="40" width="6" height="22" rx="3" fill="' + c.roofLite + '"/>');
    g.push('<circle cx="120" cy="38" r="6" fill="' + c.roofLite + '"/>');
    g.push('<circle cx="120" cy="86" r="13" fill="' + GLASS + '" opacity=".12"/>', winRound(120, 86, 9));
    /* two tower windows flanking the doorway */
    g.push(halo(68, 134, 20, 20, 6), win(68, 134, 20, 20, 6), sill(c, 66, 156, 24));
    g.push(halo(152, 134, 20, 20, 6), win(152, 134, 20, 20, 6), sill(c, 150, 156, 24));
    g.push('<rect x="6" y="230" width="60" height="6" rx="3" fill="' + c.wallDark + '"/>');
    g.push('<rect x="64" y="230" width="112" height="6" rx="3" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('roundTower', H, g);
  }

  /* ---- 6. victorian ----------------------------------------------------- */
  /* a row of fish-scale shingles laid along a roof slope */
  function scales(x1, y1, x2, y2, n, off, c) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = (i + .5) / n;
      var x = x1 + (x2 - x1) * t + off, y = y1 + (y2 - y1) * t + Math.abs(off) * .55;
      out.push('<path d="M' + (x - 6) + ' ' + y + ' q6 7 12 0" stroke="' + c.roofLite +
        '" stroke-width="2" fill="none" opacity=".4"/>');
    }
    return out;
  }
  function victorian(p) {
    var c = pal(p), H = 240, g = [];
    /* main block */
    g.push('<rect x="70" y="96" width="164" height="144" rx="10" fill="' + c.wall + '"/>');
    g.push('<rect x="70" y="96" width="164" height="16" rx="8" fill="' + c.wallDark + '" opacity=".4"/>');
    /* tall gable with a fish-scale tint */
    g.push('<path d="M60 100 L150 28 L238 100 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M150 28 L238 100 L150 100 Z" fill="' + c.roofDark + '" opacity=".4"/>');
    g = g.concat(scales(74, 108, 148, 44, 6, 0, c));
    g = g.concat(scales(78, 122, 146, 60, 5, 0, c));
    g = g.concat(scales(152, 44, 224, 108, 6, 0, c));
    g.push('<rect x="142" y="22" width="16" height="13" rx="6" fill="' + c.roofLite + '"/>');
    /* round turret + cone */
    g.push('<path d="M10 240 L10 120 Q10 74 42 74 Q74 74 74 120 L74 240 Z" fill="' + c.wall + '"/>');
    g.push('<rect x="56" y="120" width="18" height="120" rx="9" fill="' + c.wallDark + '" opacity=".25"/>');
    g.push('<path d="M2 78 L42 8 L82 78 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M42 8 L82 78 L42 78 Z" fill="' + c.roofDark + '" opacity=".35"/>');
    g.push('<circle cx="42" cy="7" r="5" fill="' + c.roofLite + '"/>');
    g.push('<circle cx="42" cy="94" r="11" fill="' + GLASS + '" opacity=".12"/>', winRound(42, 94, 7));
    g.push(halo(31, 130, 22, 22, 6), win(31, 130, 22, 22, 6), sill(c, 29, 154, 26));
    /* main windows */
    g.push(halo(86, 110, 24, 24, 6), win(86, 110, 24, 24, 6), sill(c, 84, 136, 28));
    g.push(halo(194, 110, 24, 24, 6), win(194, 110, 24, 24, 6), sill(c, 192, 136, 28));
    g.push(halo(194, 170, 24, 24, 6), win(194, 170, 24, 24, 6), sill(c, 192, 196, 28));
    /* porch awning over the doorway (posts clear of x 92..148) */
    g.push('<path d="M74 154 L120 130 L166 154 L160 162 L120 142 L80 162 Z" fill="' + c.roofLite + '"/>');
    g.push('<rect x="82" y="152" width="9" height="88" rx="4" fill="' + c.trim + '" opacity=".6"/>');
    g.push('<rect x="149" y="152" width="9" height="88" rx="4" fill="' + c.trim + '" opacity=".6"/>');
    g.push('<rect x="70" y="232" width="164" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push('<rect x="10" y="232" width="64" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push(door(H));
    return svg('victorian', H, g);
  }

  /* ---- 7. farmhouse ----------------------------------------------------- */
  var STRAW = '#8f7440', STRAW_LITE = '#a98b4e', PUMPKIN = '#d97f45', PUMPKIN_DEEP = '#b5652f';
  function farmhouse(p) {
    var c = pal(p), H = 206, g = [];
    /* main block + gable */
    g.push('<rect x="12" y="86" width="176" height="120" rx="10" fill="' + c.wall + '"/>');
    g.push('<rect x="12" y="86" width="176" height="16" rx="8" fill="' + c.wallDark + '" opacity=".4"/>');
    g.push('<path d="M4 90 L100 30 L196 90 Z" fill="' + c.roof + '"/>');
    g.push('<path d="M100 30 L196 90 L100 90 Z" fill="' + c.roofDark + '" opacity=".4"/>');
    g.push('<rect x="90" y="24" width="20" height="13" rx="6" fill="' + c.roofLite + '"/>');
    g.push('<circle cx="100" cy="62" r="13" fill="' + GLASS + '" opacity=".12"/>', winRound(100, 62, 9));
    /* barn wing, right */
    g.push('<rect x="188" y="120" width="50" height="86" rx="8" fill="' + c.wall + '"/>');
    g.push('<rect x="188" y="120" width="50" height="12" rx="6" fill="' + c.wallDark + '" opacity=".35"/>');
    g.push('<path d="M180 124 L240 138 L240 150 L180 136 Z" fill="' + c.roofDark + '"/>');
    /* barn door beside the house — plain decor, far from the doorway box */
    g.push('<rect x="198" y="146" width="32" height="60" rx="5" fill="' + OPENING + '"/>');
    g.push('<path d="M208 148 V204 M219 148 V204" stroke="' + c.wallDark + '" stroke-width="2" opacity=".5"/>');
    g.push('<path d="M201 150 L227 202 M227 150 L201 202" stroke="' + c.trim + '" stroke-width="3" opacity=".45"/>');
    /* wide porch across the front (slab above y=126, posts clear of the box) */
    g.push('<rect x="6" y="104" width="148" height="12" rx="6" fill="' + c.roofLite + '"/>');
    g.push('<rect x="14" y="116" width="9" height="90" rx="4" fill="' + c.trim + '" opacity=".6"/>');
    g.push('<rect x="74" y="116" width="9" height="90" rx="4" fill="' + c.trim + '" opacity=".6"/>');
    g.push('<rect x="149" y="116" width="9" height="90" rx="4" fill="' + c.trim + '" opacity=".6"/>');
    /* windows under the porch */
    g.push(halo(26, 134, 22, 22, 6), win(26, 134, 22, 22, 6), sill(c, 24, 158, 26));
    g.push(halo(62, 134, 22, 22, 6), win(62, 134, 22, 22, 6), sill(c, 60, 158, 26));
    /* foundation, then hay + pumpkins at the base */
    g.push('<rect x="12" y="198" width="176" height="8" rx="4" fill="' + c.wallDark + '"/>');
    g.push('<rect x="20" y="180" width="44" height="26" rx="12" fill="' + STRAW + '"/>');
    g.push('<path d="M26 186 H58 M26 192 H58 M26 198 H58" stroke="' + STRAW_LITE + '" stroke-width="2" opacity=".5"/>');
    g.push('<path d="M32 180 V206 M52 180 V206" stroke="' + c.wallDark + '" stroke-width="2" opacity=".3"/>');
    g.push('<ellipse cx="76" cy="198" rx="12" ry="10" fill="' + PUMPKIN + '"/>');
    g.push('<ellipse cx="71" cy="198" rx="3" ry="9" fill="' + PUMPKIN_DEEP + '" opacity=".45"/>');
    g.push('<ellipse cx="81" cy="198" rx="3" ry="9" fill="' + PUMPKIN_DEEP + '" opacity=".45"/>');
    g.push('<rect x="73" y="186" width="6" height="8" rx="3" fill="' + c.shrub + '"/>');
    g.push('<ellipse cx="84" cy="204" rx="6" ry="5" fill="' + PUMPKIN_DEEP + '"/>');
    g.push(door(H));
    return svg('farmhouse', H, g);
  }

  /* ---- registry --------------------------------------------------------- */
  var LIST = [cottage, townhouse, tallNarrow, witchHut, manor, roundTower, victorian, farmhouse];

  window.HOUSES = {
    list: LIST,
    paletteCount: FAMILIES.length
  };
})();
