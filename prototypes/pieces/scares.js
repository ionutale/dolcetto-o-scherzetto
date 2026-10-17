/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — SCARY MOMENTS (prototype piece)
 *  Classic script: no modules, no build, no dependencies. Runs from file://.
 *
 *  USAGE
 *    <script src="scares.js"></script>
 *    Scares.init(stage, kidsEl);                    // one-time: layers + CSS
 *    Scares.trigger('witch', { sound, onDone });    // kind: witch|wolf|vampire|skeleton|mummy|thunder
 *    Scares.cancel();                               // safe anytime, twice in a row
 *    Scares.kidsReset(kidsEl);                      // remove all kids-beat classes
 *
 *  KINDS (ART-STYLE.md §8 / §10 — "theatre spooky" ceiling)
 *    witch     broom crossing the SKY band (y≈110)          1.57 s · sound scare:witch
 *    wolf      running werewolf across the YARD band (y≈300) 1.57 s · sound scare:wolf
 *    vampire   gliding vampire, mid distance (y≈190)        1.72 s · sound scare:vampire
 *    skeleton  cartoon skeleton strutting the YARD band (y≈300, comedic) 1.60 s · sound scare:skeleton
 *    mummy     friendly mummy shuffling mid distance (y≈190)  1.70 s · sound scare:mummy
 *    thunder   SKY event, NOT a crossing: cloud slides in, one zigzag bolt, ONE soft
 *              flash (never a strobe), rumble ~0.6 s later · sound scare:thunder
 *
 *  BEAT (shared by every kind, incl. thunder)
 *    veil in ≤0.5 s (dim + soft purple/green wash) · monster crosses mid-distance
 *    in 1.5–1.8 s (never aimed at the player, never a close-up) · kids stop, turn,
 *    hug, tremble, peek, giggle ≈2.5 s. Motion is transform/opacity only.
 *    prefers-reduced-motion → dim + crossing only (no wash, bob, tremble);
 *    for thunder: NO flash frames at all — the bolt appears statically.
 *
 *  kidsEl = the `.kids` container; its `.tino` / `.milo` child divs are the
 *  targets. We only rely on the `.kids` > `.tino` / `.milo` structure — every
 *  other rule is injected by us (including the CSS for the beat classes).
 * ============================================================================
 */
(function () {
  'use strict';

  var STAGE_W = 852;   /* prototype stage width (ART-STYLE.md §5) */
  var MARGIN = 40;     /* monster enters/exits fully off-stage */

  /* per-kind spec — ART-STYLE.md §10 (top = stage-local top of the sprite box) */
  var KINDS = {
    /* broom, SKY band (y ≈ 110 from top), slight bob */
    witch:    { dur: 1.57, top: 70,  w: 120, h: 80, ease: 'inout' },
    /* running werewolf, YARD band (foot line ≈ y 300), fast dash */
    wolf:     { dur: 1.57, top: 228, w: 132, h: 74, ease: 'in'    },
    /* gliding vampire, mid distance (foot line ≈ y 190), cape flapping */
    vampire:  { dur: 1.72, top: 96,  w: 112, h: 96, ease: 'inout' },
    /* cartoon skeleton strutting the YARD band (foot line ≈ y 300), comedic waddle */
    skeleton: { dur: 1.60, top: 235, w: 96,  h: 66, ease: 'inout' },
    /* friendly mummy shuffling mid distance (foot line ≈ y 190), stiff shuffle */
    mummy:    { dur: 1.70, top: 96,  w: 100, h: 96, ease: 'inout' },
    /* SKY event (NOT a crossing): cloud + one bolt + ONE soft flash, same kids beat */
    thunder:  { dur: 2.50, top: 0,   w: 852, h: 393, ease: 'inout', sky: true }
  };

  /* palette tokens — ART-STYLE.md §3 */
  var C = {
    ink: '#3a2f4e',
    witchHat: '#43326b', witchHatLite: '#4d3a7c', witchHair: '#7a5cff',
    witchSkin: '#cfe8d2', witchRobe: '#4a3a78', witchRobeLite: '#5a4a8c',
    wolfFur: '#9a8fc0', wolfFurDeep: '#7b71a2', wolfBelly: '#cbbfdd', wolfMid: '#8a7fb0',
    vampCape: '#6d3a5e', vampCapeDeep: '#5a2f4f', vampSkin: '#efe6f7', vampHair: '#2e2751',
    bone: '#f4ecdc', boneShade: '#dcd1b6',                 /* cute skeleton */
    linen: '#efe3cf', linenShade: '#d8c8ad',                /* mummy bandages */
    amber: '#ffd166', blush: '#ffb8a8', wood: '#8a6a52', straw: '#c98a4b'
  };

  /* ============================ CSS (injected) =========================== */
  var CSS = '' +
  '/* ===== Scares — injected once by Scares.init ===== */' +
  '.scare-layer{position:absolute;inset:0;pointer-events:none;border-radius:inherit;}' +
  /* soft moonlit halo so the mid-distance silhouette reads against the night sky */
  '.scare-monster{position:absolute;left:0;top:0;z-index:4;pointer-events:none;will-change:transform;' +
    'background:radial-gradient(ellipse 70% 60% at 50% 44%, rgba(255,236,207,.42), rgba(255,236,207,0) 75%);}' +
  '.scare-monster svg{display:block;}' +
  '.scare-veil{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0;' +
    'transition:opacity .45s ease;border-radius:inherit;}' +
  '.scare-veil.in{opacity:1;}' +
  '.scare-dim{position:absolute;inset:0;background:rgba(14,8,32,.40);}' +
  '.scare-wash{position:absolute;inset:0;opacity:0;mix-blend-mode:screen;' +
    'background:linear-gradient(120deg, rgba(122,92,255,.42), rgba(127,176,105,.34) 55%, rgba(122,92,255,.30));}' +
  '.scare-veil.in .scare-wash{animation:scare-wash 1.5s ease-in-out infinite;}' +
  '@keyframes scare-wash{0%,100%{opacity:.30}50%{opacity:.55}}' +

  /* monster life (killed under reduced-motion) */
  '.scare-witch .scare-bob{animation:scare-bob 1.15s ease-in-out infinite alternate;}' +
  '@keyframes scare-bob{from{transform:translateY(0)}to{transform:translateY(-5px)}}' +
  '.scare-wolf .scare-dash{animation:scare-dash .3s ease-in-out infinite alternate;}' +
  '@keyframes scare-dash{from{transform:rotate(-2.6deg)}to{transform:rotate(2.6deg)}}' +
  '.scare-vampire .scare-glide{animation:scare-glide 1.6s ease-in-out infinite alternate;}' +
  '@keyframes scare-glide{from{transform:translateY(0)}to{transform:translateY(4px)}}' +
  '.scare-vampire .scare-cape{transform-box:fill-box;transform-origin:82% 8%;' +
    'animation:scare-cape 1.05s ease-in-out infinite alternate;}' +
  '@keyframes scare-cape{from{transform:rotate(-7deg)}to{transform:rotate(8deg)}}' +
  /* skeleton: comedic loose-limbed waddle + alternating steps */
  '.scare-skeleton .scare-walk{animation:scare-walk .5s ease-in-out infinite alternate;}' +
  '@keyframes scare-walk{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-4px) rotate(2deg)}}' +
  '.scare-skeleton .leg-l,.scare-skeleton .leg-r{animation:scare-step .5s ease-in-out infinite alternate;}' +
  '.scare-skeleton .leg-r{animation-delay:-.5s;}' +
  '@keyframes scare-step{from{transform:rotate(-15deg)}to{transform:rotate(15deg)}}' +
  '.scare-skeleton .arm-l,.scare-skeleton .arm-r{animation:scare-swing .5s ease-in-out infinite alternate;}' +
  '.scare-skeleton .arm-r{animation-delay:-.5s;}' +
  '@keyframes scare-swing{from{transform:rotate(11deg)}to{transform:rotate(-11deg)}}' +
  '.scare-skeleton .jaw{animation:scare-jaw .7s ease-in-out infinite alternate;}' +
  '@keyframes scare-jaw{from{transform:rotate(0deg)}to{transform:rotate(6deg)}}' +
  /* mummy: stiff-legged shuffle + flapping bandage tail */
  '.scare-mummy .scare-shuffle{animation:scare-shuffle .6s ease-in-out infinite alternate;}' +
  '@keyframes scare-shuffle{from{transform:translate(0,0) rotate(-1.5deg)}to{transform:translate(2px,-2px) rotate(1.5deg)}}' +
  '.scare-mummy .scare-bandage{transform-box:fill-box;transform-origin:100% 50%;' +
    'animation:scare-bandage .9s ease-in-out infinite alternate;}' +
  '@keyframes scare-bandage{from{transform:rotate(-12deg)}to{transform:rotate(14deg)}}' +

  /* sky event: thunder — cloud slides in, ONE bolt, ONE soft flash (never a strobe) */
  '.scare-sky{position:absolute;inset:0;pointer-events:none;}' +
  '.scare-cloud{position:absolute;left:0;top:24px;width:460px;will-change:transform;transform:translateX(-480px);}' +
  '.scare-sky.in .scare-cloud{animation:scare-cloud 1.7s ease-in-out forwards;}' +
  '@keyframes scare-cloud{0%{transform:translateX(-480px)}55%{transform:translateX(150px)}100%{transform:translateX(660px)}}' +
  '.scare-bolt{position:absolute;left:230px;top:58px;width:120px;height:200px;opacity:0;will-change:transform,opacity;}' +
  '.scare-sky.in .scare-bolt{animation:scare-bolt 1.7s linear forwards;}' +
  '@keyframes scare-bolt{0%,26%{opacity:0;transform:scale(.94)}32%,66%{opacity:1;transform:scale(1)}74%,100%{opacity:0}}' +
  '.scare-flash{position:absolute;inset:0;opacity:0;z-index:10;mix-blend-mode:screen;' +
    'background:radial-gradient(ellipse 72% 56% at 30% 16%, rgba(255,246,221,.9), rgba(255,246,221,.38) 46%, rgba(255,246,221,0) 74%);}' +
  '.scare-sky.in .scare-flash{animation:scare-flash .6s ease-out 1 forwards;}' +
  '@keyframes scare-flash{0%{opacity:0}18%{opacity:.9}100%{opacity:0}}' +

  /* kids beat — scoped to the container we arm */
  '.scares-armed > .tino,.scares-armed > .milo{transform-origin:bottom center;will-change:transform;}' +
  /* STOP: kill any host walk/swing animation inside the kids during the beat */
  '.scares-armed.scares-stop > .tino *,.scares-armed.scares-stop > .milo *{animation:none !important;}' +
  /* HUG: Tino leans into Milo (translate + rotate, individual props compose) */
  '.scares-armed > .tino.scare-hug{translate:24px;rotate:9deg;}' +
  '.scares-armed > .milo.scare-hug{translate:-18px;rotate:-7deg;}' +
  /* TREMBLE: subtle shake on `transform` so it composes with the hug */
  '.scares-armed > .tino.scare-tremble,.scares-armed > .milo.scare-tremble{animation:scare-tremble .16s linear infinite;}' +
  '@keyframes scare-tremble{' +
    '0%,100%{transform:translate(0,0)}' +
    '20%{transform:translate(1.1px,.3px)}' +
    '40%{transform:translate(-1px,-.2px)}' +
    '60%{transform:translate(.9px,.4px)}' +
    '80%{transform:translate(-.8px,0)}}' +
  /* PEEK: small lean back */
  '.scares-armed > .tino.scare-peek{scale:1.05;}' +
  '.scares-armed > .milo.scare-peek{scale:1.03;}' +
  /* GIGGLE: quick bounce */
  '.scares-armed > .tino.scare-giggle,.scares-armed > .milo.scare-giggle{' +
    'animation:scare-giggle .42s cubic-bezier(.3,1.5,.6,1) 1;}' +
  '@keyframes scare-giggle{' +
    '0%{transform:translateY(0) scale(1)}' +
    '40%{transform:translateY(-7px) scale(1.05)}' +
    '100%{transform:translateY(0) scale(1)}}' +

  '@media (prefers-reduced-motion: reduce){' +
    '.scare-wash{display:none !important;}' +
    '.scare-witch .scare-bob,.scare-wolf .scare-dash,.scare-vampire .scare-glide,' +
    '.scare-vampire .scare-cape,.scare-skeleton .scare-walk,.scare-skeleton .leg-l,.scare-skeleton .leg-r,' +
    '.scare-skeleton .arm-l,.scare-skeleton .arm-r,.scare-skeleton .jaw,.scare-mummy .scare-shuffle,' +
    '.scare-mummy .scare-bandage{animation:none !important;}' +
    /* thunder: NO flash frames at all — bolt + cloud appear statically */
    '.scare-flash{display:none !important;}' +
    '.scare-sky.in .scare-cloud{animation:none !important;transform:translateX(150px);}' +
    '.scare-sky.in .scare-bolt{animation:none !important;opacity:1;}' +
    '.scares-armed > .tino.scare-tremble,.scares-armed > .milo.scare-tremble{animation:none !important;}' +
  '}';

  /* ============================ monster SVGs ============================= */
  /* Cute-spooky, side profile, facing right (direction of travel). No outlines. */
  function witchSVG() {
    return '' +
    '<svg width="120" height="80" viewBox="0 0 120 80">' +
      '<g class="scare-bob">' +
        /* bristles (behind) */
        '<path d="M22 55 C10 47 2 49 0 56 C0 63 12 67 24 62 Z" fill="' + C.straw + '"/>' +
        '<path d="M20 55 C11 51 5 53 3 57 C3 61 10 64 20 61 Z" fill="#d99a55" opacity=".8"/>' +
        /* broom handle */
        '<rect x="16" y="54" width="102" height="6" rx="3" fill="' + C.wood + '"/>' +
        '<rect x="16" y="54" width="102" height="2.2" rx="1.1" fill="#a5825f" opacity=".8"/>' +
        /* legs */
        '<rect x="58" y="60" width="6" height="12" rx="3" fill="' + C.witchRobe + '"/>' +
        '<rect x="68" y="60" width="6" height="12" rx="3" fill="' + C.witchRobe + '"/>' +
        '<ellipse cx="61" cy="73" rx="5" ry="3" fill="#2e2751"/>' +
        '<ellipse cx="71" cy="73" rx="5" ry="3" fill="#2e2751"/>' +
        /* dress */
        '<path d="M54 34 C48 44 46 54 50 62 L76 62 C78 52 76 42 70 34 Z" fill="' + C.witchRobe + '"/>' +
        '<path d="M54 34 C48 44 46 54 50 62 L60 62 C58 52 58 42 60 34 Z" fill="' + C.witchRobeLite + '" opacity=".55"/>' +
        /* torso */
        '<rect x="56" y="28" width="18" height="12" rx="6" fill="' + C.witchHat + '"/>' +
        /* head */
        '<circle cx="64" cy="20" r="11" fill="' + C.witchSkin + '"/>' +
        /* hair flowing back */
        '<path d="M54 12 C46 9 38 13 36 22 C42 18 48 20 52 24 C54 20 55 16 54 12 Z" fill="' + C.witchHair + '"/>' +
        '<path d="M54 20 C46 20 40 25 38 31 C43 27 49 27 53 29 C54 26 54 23 54 20 Z" fill="' + C.witchHair + '"/>' +
        /* hat */
        '<path d="M52 14 C56 0 74 0 78 14 Z" fill="' + C.witchHat + '"/>' +
        '<path d="M52 14 C56 0 74 0 78 14 L72 14 C68 4 60 4 56 14 Z" fill="' + C.witchHatLite + '" opacity=".6"/>' +
        '<ellipse cx="65" cy="14" rx="17" ry="4" fill="' + C.witchHat + '"/>' +
        '<rect x="52" y="11" width="26" height="4" rx="2" fill="' + C.amber + '"/>' +
        /* star earring */
        '<path d="M52 26 l1.3 2.7 2.7 1.3 -2.7 1.3 -1.3 2.7 -1.3 -2.7 -2.7 -1.3 2.7 -1.3 Z" fill="' + C.amber + '"/>' +
        /* face */
        '<circle cx="60" cy="19" r="1.7" fill="' + C.ink + '"/>' +
        '<circle cx="68" cy="19" r="1.7" fill="' + C.ink + '"/>' +
        '<circle cx="60.6" cy="18.4" r=".6" fill="#fff"/>' +
        '<circle cx="68.6" cy="18.4" r=".6" fill="#fff"/>' +
        '<path d="M60 24 Q64 27 68 24" stroke="' + C.ink + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="57" cy="23" rx="2.1" ry="1.5" fill="' + C.blush + '" opacity=".8"/>' +
        '<ellipse cx="71" cy="23" rx="2.1" ry="1.5" fill="' + C.blush + '" opacity=".8"/>' +
      '</g>' +
    '</svg>';
  }

  function wolfSVG() {
    return '' +
    '<svg width="132" height="74" viewBox="0 0 132 74">' +
      '<g class="scare-dash">' +
        /* tail */
        '<path d="M22 34 C13 30 6 32 4 39 C9 38 14 39 18 43 Z" fill="' + C.wolfFur + '"/>' +
        /* far hind leg */
        '<path d="M30 52 C25 58 19 64 13 68 L19 71 C25 67 31 62 35 56 Z" fill="' + C.wolfFurDeep + '"/>' +
        '<ellipse cx="15" cy="70" rx="5" ry="3" fill="' + C.wolfFurDeep + '"/>' +
        /* far front leg */
        '<path d="M88 52 C94 58 100 64 106 68 L100 71 C94 67 88 62 84 56 Z" fill="' + C.wolfFurDeep + '"/>' +
        '<ellipse cx="104" cy="70" rx="5" ry="3" fill="' + C.wolfFurDeep + '"/>' +
        /* body */
        '<ellipse cx="58" cy="44" rx="34" ry="20" fill="' + C.wolfFur + '"/>' +
        '<ellipse cx="58" cy="52" rx="24" ry="11" fill="' + C.wolfBelly + '"/>' +
        /* near hind leg */
        '<path d="M40 54 C36 60 32 66 28 70 L34 72 C38 68 42 63 46 58 Z" fill="' + C.wolfMid + '"/>' +
        '<ellipse cx="30" cy="71" rx="5" ry="3" fill="' + C.wolfMid + '"/>' +
        /* head */
        '<circle cx="96" cy="30" r="17" fill="' + C.wolfFur + '"/>' +
        /* ears */
        '<path d="M86 18 L82 6 L94 13 Z" fill="' + C.wolfFur + '"/>' +
        '<path d="M104 16 L108 4 L112 15 Z" fill="' + C.wolfFur + '"/>' +
        '<path d="M87 16 L85 9 L91 14 Z" fill="' + C.wolfBelly + '"/>' +
        '<path d="M104 14 L106 8 L109 14 Z" fill="' + C.wolfBelly + '"/>' +
        /* snout */
        '<path d="M108 28 C118 26 124 30 124 36 C124 42 116 44 108 42 Z" fill="' + C.wolfFur + '"/>' +
        '<ellipse cx="122" cy="33" rx="4" ry="3.2" fill="' + C.ink + '"/>' +
        '<path d="M112 40 L114 45 L116 40 Z" fill="#fff"/>' +
        /* eye + brow */
        '<circle cx="98" cy="28" r="2.4" fill="' + C.ink + '"/>' +
        '<circle cx="98.8" cy="27.2" r=".8" fill="#fff"/>' +
        '<path d="M92 23 Q98 21 104 23" stroke="' + C.wolfFurDeep + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        /* cheek */
        '<ellipse cx="92" cy="36" rx="2.6" ry="1.8" fill="' + C.wolfBelly + '" opacity=".9"/>' +
      '</g>' +
    '</svg>';
  }

  function vampireSVG() {
    return '' +
    '<svg width="112" height="96" viewBox="0 0 112 96">' +
      '<g class="scare-glide">' +
        /* cape (flaps) */
        '<path class="scare-cape" d="M60 26 C36 30 18 48 14 84 C30 76 40 70 50 66 C56 54 58 40 60 26 Z" fill="' + C.vampCape + '"/>' +
        '<path class="scare-cape" d="M60 26 C30 32 14 54 12 90 C32 80 44 72 54 66 C58 52 60 38 60 26 Z" fill="' + C.vampCapeDeep + '" opacity=".6"/>' +
        /* tunic */
        '<path d="M58 34 C50 44 48 58 52 78 L80 78 C82 62 80 46 72 34 Z" fill="' + C.vampHair + '"/>' +
        /* chest / collar */
        '<path d="M58 34 L66 44 L74 34 L70 30 L66 36 L62 30 Z" fill="' + C.vampSkin + '"/>' +
        '<path d="M54 34 L50 44 L58 38 Z" fill="' + C.vampSkin + '"/>' +
        '<path d="M78 34 L82 44 L74 38 Z" fill="' + C.vampSkin + '"/>' +
        /* head */
        '<circle cx="66" cy="22" r="13" fill="' + C.vampSkin + '"/>' +
        /* hair */
        '<path d="M53 18 C54 8 64 5 68 7 C76 6 80 12 79 20 C74 14 68 14 64 17 C60 14 56 15 53 18 Z" fill="' + C.vampHair + '"/>' +
        '<path d="M60 15 L66 20 L72 15 C70 13 62 13 60 15 Z" fill="' + C.vampHair + '"/>' +
        /* eyes */
        '<ellipse cx="61" cy="22" rx="2" ry="2.4" fill="' + C.ink + '"/>' +
        '<ellipse cx="71" cy="22" rx="2" ry="2.4" fill="' + C.ink + '"/>' +
        '<circle cx="61.7" cy="21.2" r=".7" fill="#fff"/>' +
        '<circle cx="71.7" cy="21.2" r=".7" fill="#fff"/>' +
        /* brows */
        '<path d="M57 17 Q61 15.5 65 17" stroke="' + C.vampHair + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        '<path d="M67 17 Q71 15.5 75 17" stroke="' + C.vampHair + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        /* fangs + smile */
        '<path d="M61 29 Q66 33 71 29" stroke="' + C.ink + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M62.5 30.5 L63.5 34 L64.5 30.5 Z" fill="#fff"/>' +
        '<path d="M67.5 30.5 L68.5 34 L69.5 30.5 Z" fill="#fff"/>' +
        /* blush */
        '<ellipse cx="57" cy="27" rx="2.2" ry="1.5" fill="#e7c6e0" opacity=".85"/>' +
        '<ellipse cx="75" cy="27" rx="2.2" ry="1.5" fill="#e7c6e0" opacity=".85"/>' +
      '</g>' +
    '</svg>';
  }

  /* Cute cartoon skeleton: tiny bone-white body, big friendly skull, jaw slightly
     open, plush blush. Loose-limbed comedic strut (host animates). */
  function skeletonSVG() {
    return '' +
    '<svg width="96" height="66" viewBox="0 0 96 66">' +
      '<g class="scare-walk">' +
        /* far leg */
        '<g class="leg-r" style="transform-origin:45px 46px">' +
          '<rect x="41" y="46" width="6" height="12" rx="3" fill="' + C.boneShade + '"/>' +
          '<rect x="41" y="57" width="5" height="7" rx="2.5" fill="' + C.boneShade + '"/>' +
          '<ellipse cx="45" cy="65" rx="5" ry="2.6" fill="' + C.boneShade + '"/>' +
        '</g>' +
        /* far arm */
        '<g class="arm-r" style="transform-origin:40px 24px">' +
          '<rect x="34" y="24" width="5" height="12" rx="2.5" fill="' + C.boneShade + '"/>' +
          '<rect x="32" y="35" width="5" height="12" rx="2.5" fill="' + C.boneShade + '"/>' +
          '<circle cx="34" cy="49" r="3.4" fill="' + C.boneShade + '"/>' +
        '</g>' +
        /* spine + ribcage */
        '<rect x="44" y="20" width="5" height="26" rx="2.5" fill="' + C.bone + '"/>' +
        '<rect x="34" y="20" width="26" height="24" rx="10" fill="' + C.bone + '"/>' +
        '<path d="M38 27 Q47 31 56 27" stroke="' + C.boneShade + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M38 33 Q47 37 56 33" stroke="' + C.boneShade + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M38 39 Q47 43 56 39" stroke="' + C.boneShade + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        /* pelvis */
        '<ellipse cx="47" cy="46" rx="10" ry="6" fill="' + C.bone + '"/>' +
        /* near leg */
        '<g class="leg-l" style="transform-origin:51px 46px">' +
          '<rect x="49" y="46" width="6" height="12" rx="3" fill="' + C.bone + '"/>' +
          '<rect x="49" y="57" width="5" height="7" rx="2.5" fill="' + C.bone + '"/>' +
          '<ellipse cx="53" cy="65" rx="5" ry="2.6" fill="' + C.bone + '"/>' +
        '</g>' +
        /* near arm */
        '<g class="arm-l" style="transform-origin:52px 24px">' +
          '<rect x="50" y="24" width="5" height="12" rx="2.5" fill="' + C.bone + '"/>' +
          '<rect x="52" y="35" width="5" height="12" rx="2.5" fill="' + C.bone + '"/>' +
          '<circle cx="55" cy="49" r="3.4" fill="' + C.bone + '"/>' +
        '</g>' +
        /* skull */
        '<circle cx="60" cy="10" r="12" fill="' + C.bone + '"/>' +
        '<path d="M60 -2 C68 -2 72 4 72 11 C72 16 70 19 66 20 C70 14 70 6 66 1 C64 -1 62 -2 60 -2 Z" fill="' + C.boneShade + '" opacity=".7"/>' +
        /* eye sockets */
        '<ellipse cx="55" cy="8" rx="2.8" ry="3.2" fill="' + C.ink + '"/>' +
        '<ellipse cx="66" cy="8" rx="2.8" ry="3.2" fill="' + C.ink + '"/>' +
        /* nose */
        '<path d="M60 12 L58 15 L62 15 Z" fill="' + C.ink + '"/>' +
        /* open mouth + upper teeth */
        '<path d="M54 17 Q60 21 66 17 L65 22 Q60 26 55 22 Z" fill="' + C.ink + '"/>' +
        '<path d="M56 17.6 L57 20 L58 17.8 M60 17.8 L61 20.4 L62 17.8 M64 17.8 L65 20 L66 17.6" stroke="' + C.bone + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        /* lower jaw (slightly open) */
        '<g class="jaw" style="transform-origin:60px 21px">' +
          '<path d="M56 22 Q60 25 64 22 L63 25 Q60 27.5 57 25 Z" fill="' + C.bone + '"/>' +
        '</g>' +
        /* plush blush */
        '<ellipse cx="51" cy="14" rx="2.2" ry="1.4" fill="' + C.blush + '" opacity=".85"/>' +
        '<ellipse cx="70" cy="14" rx="2.2" ry="1.4" fill="' + C.blush + '" opacity=".85"/>' +
      '</g>' +
    '</svg>';
  }

  /* Friendly little mummy: one wrapped mass, arms forward, stiff short legs,
     one visible eye, muffled "muuu" mouth, flapping bandage tail. */
  function mummySVG() {
    return '' +
    '<svg width="100" height="96" viewBox="0 0 100 96">' +
      '<g class="scare-shuffle">' +
        /* stiff legs */
        '<rect x="43" y="84" width="7" height="8" rx="3" fill="' + C.linenShade + '"/>' +
        '<ellipse cx="46" cy="93" rx="6" ry="3" fill="' + C.linenShade + '"/>' +
        '<rect x="55" y="84" width="7" height="8" rx="3" fill="' + C.linen + '"/>' +
        '<ellipse cx="59" cy="93" rx="6" ry="3" fill="' + C.linen + '"/>' +
        /* body */
        '<rect x="34" y="28" width="38" height="60" rx="18" fill="' + C.linen + '"/>' +
        '<path d="M56 30 C66 34 70 46 70 62 C70 76 66 86 60 90 C64 78 64 48 56 30 Z" fill="' + C.linenShade + '" opacity=".7"/>' +
        /* bandage wraps (body) */
        '<g stroke="' + C.linenShade + '" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8">' +
          '<path d="M36 40 L70 36"/>' +
          '<path d="M35 50 L71 47"/>' +
          '<path d="M35 60 L71 58"/>' +
          '<path d="M36 70 L70 69"/>' +
          '<path d="M38 80 L68 80"/>' +
        '</g>' +
        /* head */
        '<circle cx="54" cy="21" r="17" fill="' + C.linen + '"/>' +
        '<path d="M64 8 C70 13 72 20 71 28 C70 20 66 13 60 9 Z" fill="' + C.linenShade + '" opacity=".7"/>' +
        /* bandage wraps (head) */
        '<g stroke="' + C.linenShade + '" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8">' +
          '<path d="M39 15 L68 11"/>' +
          '<path d="M38 21 L69 19"/>' +
          '<path d="M40 28 L66 27"/>' +
        '</g>' +
        /* one visible eye (the other is wrapped) */
        '<ellipse cx="60" cy="20" rx="6" ry="6" fill="#fffdf8"/>' +
        '<ellipse cx="61" cy="21" rx="3" ry="3.6" fill="' + C.ink + '"/>' +
        '<circle cx="62.2" cy="19.6" r="1" fill="#fff"/>' +
        /* muffled mouth */
        '<ellipse cx="58" cy="31" rx="3.2" ry="2.4" fill="' + C.ink + '" opacity=".85"/>' +
        /* flapping bandage tail (back, left) */
        '<path class="scare-bandage" d="M36 38 C26 34 18 38 18 47 C25 44 31 47 35 52 Z" fill="' + C.linenShade + '"/>' +
        /* arms forward (mummy pose) */
        '<path d="M68 44 C78 44 86 48 90 55 L85 59 C79 54 73 52 67 52 Z" fill="' + C.linenShade + '"/>' +
        '<path d="M68 55 C78 56 86 61 90 68 L85 72 C79 67 73 64 67 63 Z" fill="' + C.linen + '"/>' +
        '<circle cx="89" cy="56" r="4.4" fill="' + C.linenShade + '"/>' +
        '<circle cx="89" cy="69" r="4.4" fill="' + C.linen + '"/>' +
      '</g>' +
    '</svg>';
  }

  /* thunder: a dark cloud mass (no outlines, layered shades) */
  function cloudSVG() {
    return '<svg width="460" height="150" viewBox="0 0 460 150">' +
      '<g fill="#2b2347">' +
        '<ellipse cx="112" cy="112" rx="92" ry="42"/>' +
        '<ellipse cx="222" cy="86" rx="106" ry="56"/>' +
        '<ellipse cx="338" cy="112" rx="96" ry="44"/>' +
        '<ellipse cx="200" cy="128" rx="150" ry="40"/>' +
      '</g>' +
      '<g fill="#3a2f5c" opacity=".9">' +
        '<ellipse cx="222" cy="76" rx="92" ry="42"/>' +
        '<ellipse cx="130" cy="100" rx="72" ry="32"/>' +
        '<ellipse cx="332" cy="102" rx="70" ry="30"/>' +
      '</g>' +
      '<ellipse cx="210" cy="124" rx="150" ry="24" fill="#241d3f"/>' +
    '</svg>';
  }

  /* thunder: one zigzag bolt (pale + soft glow) */
  function boltSVG() {
    return '<svg class="scare-bolt" width="120" height="200" viewBox="0 0 120 200">' +
      '<defs><filter id="scare-bolt-glow" x="-80%" y="-80%" width="260%" height="260%">' +
        '<feGaussianBlur stdDeviation="6"/></filter></defs>' +
      '<path d="M78 0 L52 58 L72 63 L46 126 L68 131 L44 200 L106 118 L82 112 L110 46 L88 41 Z" fill="#ffd166" opacity=".4" filter="url(#scare-bolt-glow)"/>' +
      '<path d="M78 0 L52 58 L72 63 L46 126 L68 131 L44 200 L106 118 L82 112 L110 46 L88 41 Z" fill="#fff6dd"/>' +
    '</svg>';
  }

  var MONSTERS = { witch: witchSVG, wolf: wolfSVG, vampire: vampireSVG, skeleton: skeletonSVG, mummy: mummySVG };

  /* ============================ state ==================================== */
  var inited = false;
  var rootEl = null, kidsEl = null;
  var layer = null, veil = null, monsterEl = null;
  var timers = [];
  var rafId = 0;
  var active = false;
  var styleEl = null;

  /* ============================ helpers ================================== */
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  }
  function addCls(el, cls) { if (el) el.classList.add(cls); }
  function rmCls(el, cls) { if (el) el.classList.remove(cls); }

  function ease(kind, t) {
    if (kind === 'in') return t * t;
    if (kind === 'out') return 1 - (1 - t) * (1 - t);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; /* inout */
  }

  /* ============================ API ====================================== */
  function init(root, kids) {
    if (!root || !kids) return false;
    rootEl = root;
    kidsEl = kids;

    if (!inited) {
      if (!styleEl && document.head) {
        styleEl = document.createElement('style');
        styleEl.id = 'scares-css';
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
      }
      layer = document.createElement('div');
      layer.className = 'scare-layer';
      layer.innerHTML =
        '<div class="scare-veil">' +
          '<div class="scare-dim"></div>' +
          '<div class="scare-wash"></div>' +
        '</div>';
      /* keep the veil/monster anchored to the stage even if the host forgot */
      if (window.getComputedStyle && getComputedStyle(root).position === 'static') {
        root.style.position = 'relative';
      }
      root.appendChild(layer);
      veil = layer.querySelector('.scare-veil');
      inited = true;
    }

    kids.classList.add('scares-armed');
    return true;
  }

  function trigger(kind, hooks) {
    if (!inited || !rootEl) return false;
    var cfg = KINDS[kind];
    if (!cfg) return false;
    hooks = hooks || {};

    cancel(); /* retriggering is always safe */

    active = true;

    /* 1 · veil in (≤0.5 s); wash animation is killed by the reduced-motion query */
    veil.classList.add('in');

    /* 4 · sound at crossing start (optional) */
    if (typeof hooks.sound === 'function') {
      try { hooks.sound('scare:' + kind); } catch (e) { /* host sound is best-effort */ }
    }

    /* 3 · kids beat — stop, hug, tremble, peek, giggle */
    var tino = kidsEl.querySelector('.tino');
    var milo = kidsEl.querySelector('.milo');
    kidsEl.classList.add('scares-stop');
    at(60, function () { addCls(tino, 'scare-hug'); addCls(milo, 'scare-hug'); });
    at(120, function () { addCls(tino, 'scare-tremble'); addCls(milo, 'scare-tremble'); });
    at(1400, function () {
      rmCls(tino, 'scare-tremble'); rmCls(milo, 'scare-tremble');
      addCls(tino, 'scare-peek'); addCls(milo, 'scare-peek');
    });
    at(1900, function () {
      rmCls(tino, 'scare-peek'); rmCls(milo, 'scare-peek');
      rmCls(tino, 'scare-hug'); rmCls(milo, 'scare-hug');
      addCls(tino, 'scare-giggle'); addCls(milo, 'scare-giggle');
    });
    at(2500, function () {
      if (typeof hooks.onDone === 'function') {
        try { hooks.onDone(); } catch (e) { /* host callback is best-effort */ }
      }
      cleanup();
    });

    /* 2 · monster crossing (1.5–1.8 s) */
    spawnMonster(kind, cfg);
    return true;
  }

  function cancel() {
    active = false;
    clearTimers();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (monsterEl && monsterEl.parentNode) monsterEl.parentNode.removeChild(monsterEl);
    monsterEl = null;
    if (veil) veil.classList.remove('in');
    kidsReset(kidsEl);
  }

  function kidsReset(el) {
    if (!el) return;
    el.classList.remove('scares-stop');
    var list = el.querySelectorAll('.scare-hug,.scare-tremble,.scare-peek,.scare-giggle');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove('scare-hug', 'scare-tremble', 'scare-peek', 'scare-giggle');
    }
  }

  /* ============================ internals ================================ */
  function cleanup() {
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (monsterEl && monsterEl.parentNode) monsterEl.parentNode.removeChild(monsterEl);
    monsterEl = null;
    if (veil) veil.classList.remove('in');
    kidsReset(kidsEl);
  }

  function spawnMonster(kind, cfg) {
    if (cfg.sky) { spawnSky(cfg); return; }

    monsterEl = document.createElement('div');
    monsterEl.className = 'scare-monster scare-' + kind;
    monsterEl.style.top = cfg.top + 'px';
    monsterEl.innerHTML = MONSTERS[kind]();
    layer.appendChild(monsterEl);

    var from = -(cfg.w + MARGIN);
    var to = STAGE_W + MARGIN;
    var dist = to - from;
    var dur = cfg.dur * 1000;
    var t0 = performance.now();

    function step(now) {
      if (!active) return;
      var t = (now - t0) / dur;
      if (t > 1) t = 1;
      var e = ease(cfg.ease, t);
      monsterEl.style.transform = 'translateX(' + (from + dist * e) + 'px)';
      if (t < 1) rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }

  /* thunder is a SKY event, not a crossing: cloud slides in, one bolt, one soft
     flash. The CSS animations run once `in` is added; reduced-motion overrides
     everything in the media query (no flash frames at all). */
  function spawnSky(cfg) {
    var sky = document.createElement('div');
    sky.className = 'scare-sky';
    sky.innerHTML =
      '<div class="scare-cloud">' + cloudSVG() + '</div>' +
      boltSVG() +
      '<div class="scare-flash"></div>';
    layer.appendChild(sky);
    monsterEl = sky;

    requestAnimationFrame(function () {
      if (!active) return;
      sky.classList.add('in');
    });
  }

  /* ============================ export =================================== */
  window.Scares = {
    init: init,
    trigger: trigger,
    cancel: cancel,
    kidsReset: kidsReset,
    /* test/inspection hook (not part of the shipped contract) */
    _kinds: KINDS
  };
})();
