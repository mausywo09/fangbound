// Procedural cartoon art: flat fills, one dark outline, a soft shine.
// Every creature faces right; the battle view mirrors the enemy side.
import { BY_ID } from './data.js';

const O = '#241a36';
const eye = (x, y, r = 6) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r * 0.85}" ry="${r}" fill="#fff"/>` +
  `<circle cx="${x + r * 0.25}" cy="${y + r * 0.1}" r="${r * 0.55}" fill="${O}" stroke="none"/>` +
  `<circle cx="${x + r * 0.45}" cy="${y - r * 0.3}" r="${r * 0.22}" fill="#fff" stroke="none"/>`;
const cheek = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="3" fill="#ff6b9a" opacity=".5" stroke="none"/>`;
const smile = (x, y, w = 8) => `<path d="M${x - w / 2} ${y}Q${x} ${y + w * 0.6} ${x + w / 2} ${y}" fill="none" stroke-width="2.5"/>`;
const brow = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke-width="3"/>`;
const shine = (x, y, rx, ry, rot = -20) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity=".32" stroke="none"/>`;
// A limb drawn as a thick outlined stroke.
const rope = (d, color, w = 4.5) =>
  `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w + 3.5}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const flower = (x, y, color) =>
  `<g fill="${color}" stroke-width="2"><circle cx="${x - 4.5}" cy="${y}" r="4.3"/><circle cx="${x + 4.5}" cy="${y}" r="4.3"/>` +
  `<circle cx="${x}" cy="${y - 4.5}" r="4.3"/><circle cx="${x}" cy="${y + 4.5}" r="4.3"/></g>` +
  `<circle cx="${x}" cy="${y}" r="2.8" fill="#ffe36b" stroke="none"/>`;

const ART = {
  cindertusk: { shadow: 42, draw: () => {
    const body = '#e8572a', dark = '#a8341a', snout = '#ffb27a', lava = '#ffd447';
    return `<rect x="28" y="86" width="13" height="20" rx="5" fill="${dark}"/><rect x="46" y="88" width="13" height="18" rx="5" fill="${dark}"/>
<rect x="66" y="88" width="13" height="18" rx="5" fill="${dark}"/><rect x="82" y="86" width="13" height="20" rx="5" fill="${dark}"/>
<path d="M30 62Q26 42 38 34Q40 46 46 48Q46 30 58 22Q58 38 66 42Q70 30 80 30Q78 44 84 58Z" fill="${lava}"/>
<path d="M37 58Q35 46 42 41Q44 50 50 52Q52 39 59 33Q60 44 66 48Q70 41 75 41Q74 50 78 58Z" fill="#ff9a2e" stroke="none"/>
<ellipse cx="58" cy="72" rx="40" ry="26" fill="${body}"/>
<path d="M30 66l8 6-4 6 8 5" fill="none" stroke="${lava}" stroke-width="3"/><path d="M52 54l4 8-6 6 5 6" fill="none" stroke="${lava}" stroke-width="3"/>
<path d="M76 50L83 34L91 52Z" fill="${dark}"/>
<ellipse cx="96" cy="80" rx="13" ry="10" fill="${snout}"/>
<circle cx="92" cy="79" r="2" fill="${O}" stroke="none"/><circle cx="100" cy="79" r="2" fill="${O}" stroke="none"/>
<path d="M87 87Q84 98 92 101Q91 94 93 88Z" fill="#fff6d6"/><path d="M104 86Q108 96 113 93Q109 90 109 84Z" fill="#fff6d6"/>
${eye(80, 64, 6)}${brow(73, 56, 86, 59)}${shine(42, 60, 13, 6)}`;
  } },

  flarefox: { shadow: 32, draw: () => {
    const body = '#ff8a3d', dark = '#c4511c', light = '#fff0d6', tip = '#ffd447';
    return `<path d="M44 84Q14 88 10 60Q20 70 25 63Q18 46 29 35Q32 53 40 56Q42 70 52 76Z" fill="${body}"/>
<path d="M20 62Q15 50 24 41Q26 53 33 58Q29 64 20 62Z" fill="${tip}" stroke="none"/>
<rect x="42" y="86" width="9" height="20" rx="4" fill="${dark}"/><rect x="64" y="86" width="9" height="20" rx="4" fill="${dark}"/>
<ellipse cx="57" cy="81" rx="23" ry="16" fill="${body}"/><ellipse cx="67" cy="86" rx="10" ry="8" fill="${light}" stroke="none"/>
<path d="M62 46L60 22L76 38Z" fill="${body}"/><path d="M80 40L92 20L95 44Z" fill="${body}"/>
<path d="M64 42L63 30L71 38Z" fill="${dark}" stroke="none"/><path d="M84 40L90 29L91 42Z" fill="${dark}" stroke="none"/>
<circle cx="76" cy="57" r="18" fill="${body}"/>
<path d="M84 55Q100 56 107 64Q99 73 83 70Z" fill="${light}"/><circle cx="106" cy="64" r="3" fill="${O}" stroke="none"/>
${eye(80, 53, 5.5)}${brow(74, 46, 86, 49)}${shine(68, 48, 7, 4)}`;
  } },

  emberwisp: { shadow: 18, draw: () => {
    const body = '#ff8f3a', inner = '#ffd65a';
    return `<path d="M60 16Q67 33 79 40Q93 50 91 70Q89 93 60 95Q31 93 29 70Q27 52 43 41Q42 56 50 58Q46 35 60 16Z" fill="${body}"/>
<path d="M60 42Q66 55 74 61Q81 71 75 82Q67 90 59 89Q44 87 44 75Q44 64 52 59Q54 67 58 67Q54 53 60 42Z" fill="${inner}" stroke="none"/>
<path d="M16 46l4-8 4 8-4 8Z" fill="${inner}" stroke-width="2"/><path d="M98 28l3-6 3 6-3 6Z" fill="${inner}" stroke-width="2"/>
<path d="M100 80l3-6 3 6-3 6Z" fill="${inner}" stroke-width="2"/>
${eye(51, 70, 6)}${eye(69, 70, 6)}${smile(60, 80, 8)}${cheek(43, 79)}${cheek(77, 79)}${shine(45, 50, 6, 10, 20)}`;
  } },

  thornhog: { shadow: 40, draw: () => {
    const body = '#43b553', spikes = '#2a7a36', face = '#f5dcb0', feet = '#8a5a3a';
    return `<ellipse cx="44" cy="104" rx="9" ry="5" fill="${feet}"/><ellipse cx="78" cy="104" rx="9" ry="5" fill="${feet}"/>
<path d="M22 88L8 74L24 70L13 53L32 55L27 36L45 45L48 25L60 41L71 26L75 45L88 37L86 55L98 56L90 70Z" fill="${spikes}"/>
<ellipse cx="57" cy="78" rx="36" ry="26" fill="${body}"/>
<path d="M70 62Q97 58 107 80Q99 97 76 97Q65 82 70 62Z" fill="${face}"/><circle cx="106" cy="80" r="4" fill="${O}" stroke="none"/>
${eye(85, 73, 5.5)}${cheek(93, 86)}<path d="M88 90Q93 93 98 90" fill="none" stroke-width="2.5"/>
<path d="M48.5 30L50 44" fill="none" stroke-width="2.5"/>${flower(48.5, 23, '#ff8fb8')}${shine(42, 68, 14, 6)}`;
  } },

  vinelash: { shadow: 30, draw: () => {
    const body = '#5ccf63', dark = '#2f8f3b', blade = '#c9f59a';
    return `${rope('M48 90L40 106', dark, 4)}${rope('M58 92L56 106', dark, 4)}${rope('M67 90L74 106', dark, 4)}
<path d="M38 74Q20 58 30 50Q46 58 52 76Z" fill="#e2ffd4" opacity=".9"/>
<ellipse cx="44" cy="82" rx="21" ry="12" transform="rotate(-18 44 82)" fill="${body}"/>
<path d="M38 79q6 6 12 2M33 86q6 6 12 2" fill="none" stroke="${dark}" stroke-width="2"/>
<path d="M55 82Q59 56 72 49Q79 53 75 64Q71 80 62 89Z" fill="${body}"/>
<path d="M70 64Q90 58 98 71Q86 67 76 73Z" fill="${blade}"/>
<path d="M76 31Q71 14 59 9M87 33Q93 15 105 13" fill="none" stroke-width="2.5"/>
<path d="M64 46Q77 25 97 37Q99 50 85 58Q70 58 64 46Z" fill="${body}"/>
${eye(85, 41, 7)}<path d="M88 52Q92 54 95 51" fill="none" stroke-width="2"/>
<path d="M72 60Q100 48 111 69Q104 66 98 66Q102 74 98 80Q90 68 76 70Z" fill="${blade}"/>${shine(72, 40, 6, 3)}`;
  } },

  sproutling: { shadow: 30, draw: () => {
    const body = '#9be07a', light = '#effcd9', leaf = '#3fae4f';
    return `<path d="M46 54Q28 24 38 10Q56 28 55 53Z" fill="${leaf}"/><path d="M67 52Q71 20 89 14Q87 40 74 55Z" fill="${leaf}"/>
<path d="M41 19Q47 35 51 50M85 21Q78 37 71 50" fill="none" stroke="#2a7a36" stroke-width="2"/>
<path d="M60 48Q58 36 60 28" fill="none" stroke-width="2.5"/>${flower(60, 22, '#ff8fb8')}
<path d="M30 84Q28 49 60 47Q92 49 90 84Q88 104 60 104Q32 104 30 84Z" fill="${body}"/>
<ellipse cx="62" cy="88" rx="16" ry="12" fill="${light}" stroke="none"/>
<ellipse cx="44" cy="104" rx="10" ry="5" fill="${light}"/><ellipse cx="78" cy="104" rx="10" ry="5" fill="${light}"/>
${eye(52, 70, 6)}${eye(72, 70, 6)}${smile(63, 80, 7)}${cheek(43, 80)}${cheek(82, 80)}${shine(42, 60, 9, 5)}`;
  } },

  bouldrake: { shadow: 44, draw: () => {
    const rock = '#a08a72', dark = '#66543f', crystal = '#7fd3ff';
    return `<path d="M33 92L31 107L50 107L50 92Z" fill="${dark}"/><path d="M70 92L70 107L89 107L87 92Z" fill="${dark}"/>
<path d="M28 40L24 18L35 29L40 12L47 36Z" fill="${crystal}"/><path d="M82 36L89 13L93 29L102 21L98 46Z" fill="${crystal}"/>
<path d="M24 90L20 56L37 33L83 31L101 52L99 90Q60 100 24 90Z" fill="${rock}"/>
<path d="M38 46L46 54L42 63M28 72L37 76" fill="none" stroke="${dark}" stroke-width="2.5"/>
<path d="M97 58Q117 60 115 84Q111 97 98 93Z" fill="${dark}"/>
<path d="M58 49L94 49" fill="none" stroke-width="4"/>
<ellipse cx="68" cy="58" rx="5" ry="4" fill="#ffe36b"/><ellipse cx="86" cy="58" rx="5" ry="4" fill="#ffe36b"/>
<path d="M70 74L84 74" fill="none" stroke-width="3"/>${shine(44, 44, 12, 5)}`;
  } },

  gravelclaw: { shadow: 36, draw: () => {
    const shell = '#a88c6a', band = '#7a6248', skin = '#e3c9a8';
    return `<path d="M22 86L8 94L24 95Z" fill="${skin}"/>
<rect x="32" y="90" width="13" height="16" rx="5" fill="${skin}"/><rect x="56" y="90" width="13" height="16" rx="5" fill="${skin}"/>
<path d="M30 56L34 44L39 54Z" fill="${band}"/><path d="M46 50L50 38L55 48Z" fill="${band}"/><path d="M62 50L67 38L71 50Z" fill="${band}"/>
<path d="M18 92Q20 48 58 46Q90 46 96 72L94 92Z" fill="${shell}"/>
<path d="M38 50Q34 70 38 92M53 47Q49 69 53 92M68 48Q66 69 70 92" fill="none" stroke="${band}" stroke-width="3"/>
<path d="M84 62Q101 57 113 74Q105 85 88 84Q80 76 84 62Z" fill="${skin}"/><circle cx="112" cy="74" r="4" fill="#ff8fa8"/>
${eye(93, 68, 4.5)}${brow(87, 62, 98, 65)}
<path d="M80 80Q96 80 101 92L106 85L105 96L111 94L103 103Q88 105 80 93Z" fill="#f4f1ea"/>${shine(42, 58, 14, 5)}`;
  } },

  geowl: { shadow: 32, draw: () => {
    const body = '#b49a7c', belly = '#ecdcc6', crystal = '#8fe0ff', wing = '#8a6f55', beak = '#e8a23a';
    return `${rope('M50 100l-4 7M54 100v7M58 100l4 7', beak, 3)}${rope('M66 100l-4 7M70 100v7M74 100l4 7', beak, 3)}
<path d="M34 42L28 14L48 34Z" fill="${crystal}"/><path d="M86 42L92 14L72 34Z" fill="${crystal}"/>
<path d="M28 76Q26 34 60 32Q94 34 92 76Q90 104 60 104Q30 104 28 76Z" fill="${body}"/>
<path d="M42 80Q44 62 60 62Q76 62 78 80Q76 100 60 100Q44 100 42 80Z" fill="${belly}" stroke="none"/>
<path d="M52 76l4 4 4-4 4 4 4-4M52 86l4 4 4-4 4 4 4-4" fill="none" stroke="${wing}" stroke-width="2"/>
<path d="M29 62Q14 78 24 98Q35 88 35 72Z" fill="${wing}"/><path d="M91 62Q106 78 96 98Q85 88 85 72Z" fill="${wing}"/>
<circle cx="48" cy="53" r="11" fill="#fff4dc"/><circle cx="72" cy="53" r="11" fill="#fff4dc"/>
${eye(49, 53, 6)}${eye(73, 53, 6)}
<path d="M56 61L64 61L60 70Z" fill="${beak}" stroke-width="2"/><path d="M60 33L55 41L60 47L65 41Z" fill="${crystal}" stroke-width="2"/>
${shine(40, 44, 8, 4)}`;
  } },

  ohmhorn: { shadow: 44, draw: () => {
    const body = '#f2c230', dark = '#a87d0c', accent = '#7b5cff', horn = '#fff6a0';
    return `<rect x="26" y="86" width="14" height="20" rx="5" fill="${dark}"/><rect x="44" y="88" width="14" height="18" rx="5" fill="${dark}"/>
<rect x="66" y="88" width="14" height="18" rx="5" fill="${dark}"/><rect x="84" y="86" width="14" height="20" rx="5" fill="${dark}"/>
<ellipse cx="55" cy="72" rx="38" ry="26" fill="${body}"/>
<path d="M28 58Q42 44 60 46Q50 54 52 64Q40 60 28 58Z" fill="${accent}"/>
<path d="M36 78l8-6v8l8-6" fill="none" stroke="${accent}" stroke-width="3"/>
<path d="M80 52L77 39L88 47Z" fill="${dark}"/>
<path d="M76 54Q103 51 111 76Q109 93 88 93Q73 86 76 54Z" fill="${body}"/>
<path d="M99 58L107 41L101 41L110 22L94 45L100 45L92 58Z" fill="${horn}"/><path d="M85 56L88 46L92 55Z" fill="${horn}"/>
<ellipse cx="100" cy="82" rx="10" ry="7" fill="#ffeaa0" stroke="none"/><circle cx="106" cy="80" r="2" fill="${O}" stroke="none"/>
${eye(91, 66, 5.5)}${brow(84, 58, 97, 62)}${shine(40, 64, 13, 6)}`;
  } },

  joltcub: { shadow: 32, draw: () => {
    const body = '#ffd23f', stripe = '#7b5cff', dark = '#c99700';
    return `<path d="M38 80L20 70L26 66L8 52L30 60L25 64L42 74Z" fill="${body}"/>
<rect x="42" y="86" width="10" height="20" rx="4" fill="${dark}"/><rect x="62" y="86" width="10" height="20" rx="4" fill="${dark}"/>
<ellipse cx="56" cy="81" rx="22" ry="15" fill="${body}"/>
<path d="M46 69l4 8-3 4M57 67l3 8-3 4" fill="none" stroke="${stripe}" stroke-width="3"/>
<circle cx="62" cy="42" r="7" fill="${body}"/><circle cx="88" cy="40" r="7" fill="${body}"/>
<circle cx="62" cy="42" r="3" fill="${dark}" stroke="none"/><circle cx="88" cy="40" r="3" fill="${dark}" stroke="none"/>
<circle cx="76" cy="58" r="20" fill="${body}"/>
<path d="M73 39l2 6-2 4M81 39l-1 6 2 3" fill="none" stroke="${stripe}" stroke-width="3"/>
<ellipse cx="87" cy="66" rx="11" ry="7.5" fill="#fff6cf"/><path d="M90 61h5l-2.5 3.5Z" fill="${O}" stroke-width="1.5"/>
${eye(81, 54, 5.5)}<path d="M88 68q3 3 6 0" fill="none" stroke-width="2"/>
<path d="M97 64l10-2M97 68l10 2" fill="none" stroke-width="1.5"/>${cheek(68, 66)}
<path d="M104 30l-4 7h5l-4 7" fill="none" stroke="#fff6a0" stroke-width="3"/>${shine(66, 48, 7, 4)}`;
  } },

  buzzmoth: { shadow: 22, draw: () => {
    const body = '#ffe27a', wing = '#9b7bff', spot = '#ffd23f', dark = '#5b3fb8';
    return `<path d="M54 60Q24 18 10 44Q6 70 50 72Z" fill="${wing}"/><path d="M66 60Q96 18 110 44Q114 70 70 72Z" fill="${wing}"/>
<path d="M52 72Q22 80 26 100Q42 104 56 80Z" fill="${wing}"/><path d="M68 72Q98 80 94 100Q78 104 64 80Z" fill="${wing}"/>
<circle cx="30" cy="48" r="7" fill="${spot}"/><circle cx="30" cy="48" r="3" fill="${dark}" stroke="none"/>
<circle cx="90" cy="48" r="7" fill="${spot}"/><circle cx="90" cy="48" r="3" fill="${dark}" stroke="none"/>
<path d="M54 34Q46 18 36 16M66 34Q74 18 84 16" fill="none" stroke-width="3"/>
<path d="M37 12q-5 4 0 9M83 12q5 4 0 9" fill="none" stroke-width="2.5"/>
<ellipse cx="60" cy="74" rx="16" ry="25" fill="${body}"/>
<path d="M46 82Q60 86 74 82M48 92Q60 96 72 92" fill="none" stroke="${dark}" stroke-width="3"/>
<path d="M44 58q4-7 8 0q4-7 8 0q4-7 8 0q4-7 8 0L76 64L44 64Z" fill="#fff4c4" stroke-width="2"/>
<circle cx="60" cy="46" r="14" fill="${body}"/>
${eye(55, 46, 5)}${eye(67, 46, 5)}${smile(61, 53, 6)}${cheek(50, 53)}${cheek(72, 53)}${shine(54, 38, 5, 3)}`;
  } },

  shellguard: { shadow: 44, draw: () => {
    const shell = '#2f7fd6', dark = '#1d4f93', skin = '#8fd8ff', pat = '#5fb0ff';
    return `<path d="M22 90L10 94L24 97Z" fill="${skin}"/>
<rect x="28" y="88" width="15" height="18" rx="6" fill="${skin}"/><rect x="74" y="88" width="15" height="18" rx="6" fill="${skin}"/>
<path d="M18 92Q18 42 60 40Q102 42 102 92Z" fill="${shell}"/>
<path d="M60 52L73 60L73 76L60 84L47 76L47 60Z" fill="${pat}" stroke="${dark}" stroke-width="2.5"/>
<path d="M35 60L43 65L43 81L34 86L25 80Q25 68 35 60Z" fill="${pat}" stroke="${dark}" stroke-width="2.5"/>
<path d="M85 60L77 65L77 81L86 86L95 80Q95 68 85 60Z" fill="${pat}" stroke="${dark}" stroke-width="2.5"/>
<path d="M14 92L106 92Q106 101 97 101L23 101Q14 101 14 92Z" fill="${dark}"/>
<circle cx="97" cy="70" r="15" fill="${skin}"/>
${eye(101, 66, 6)}${smile(103, 78, 6)}${cheek(93, 78)}${shine(42, 54, 14, 6)}`;
  } },

  riptide: { shadow: 34, draw: () => {
    const body = '#3b8de0', dark = '#235a9e';
    return `<path d="M28 104Q34 96 40 104Q46 96 52 104Q58 96 64 104Q70 96 76 104Q82 96 88 104" fill="none" stroke="#9fe3ff" stroke-width="3"/>
<path d="M30 70L8 48L15 71L8 94Z" fill="${dark}"/><path d="M50 48Q58 20 75 28Q66 37 70 48Z" fill="${dark}"/>
<path d="M22 72Q28 46 66 44Q100 44 111 69Q101 94 64 96Q28 96 22 72Z" fill="${body}"/>
<path d="M38 84Q66 99 106 77Q99 93 64 94Q45 94 38 84Z" fill="#e4f4ff" stroke="none"/>
<path d="M62 61q-3 7 0 13M70 61q-3 7 0 13" fill="none" stroke="${dark}" stroke-width="2.5"/>
<path d="M60 84L50 102L74 90Z" fill="${dark}"/>
<path d="M82 79Q95 84 107 73" fill="none"/><path d="M86 80.5l3 5 3-4 3 4 3-5 3 3" fill="#fff" stroke-width="1.5"/>
${eye(90, 61, 6)}${brow(83, 52, 97, 56)}${shine(50, 55, 14, 5)}`;
  } },

  mistling: { shadow: 20, draw: () => {
    const bell = '#8ec9ff', tent = '#b49bff', glow = '#e8f6ff';
    return `${rope('M42 72Q36 84 44 94Q50 102 44 110', tent)}${rope('M54 74Q50 86 56 96Q60 104 56 112', tent)}
${rope('M66 74Q70 86 64 96Q60 104 64 112', tent)}${rope('M78 72Q84 84 76 94Q70 102 76 110', tent)}
<path d="M22 70Q20 26 60 24Q100 26 98 70Q90 79 82 71Q73 79 64 71Q56 79 47 71Q38 79 30 71Q26 75 22 70Z" fill="${bell}"/>
<path d="M34 58Q36 36 60 34Q84 36 86 58" fill="none" stroke="${glow}" stroke-width="3" opacity=".7"/>
<circle cx="40" cy="44" r="3" fill="${glow}" stroke="none"/><circle cx="82" cy="46" r="2.5" fill="${glow}" stroke="none"/>
${eye(50, 54, 6)}${eye(70, 54, 6)}${smile(60, 63, 7)}${cheek(42, 62)}${cheek(78, 62)}
<circle cx="106" cy="38" r="5" fill="none" stroke="${glow}" stroke-width="2"/><circle cx="12" cy="52" r="4" fill="none" stroke="${glow}" stroke-width="2"/>
${shine(42, 36, 10, 5)}`;
  } },
};

const jackArt = (crown) => {
    const face = '#ffd25a';
    const hat = crown
      ? `<path d="M40 22L44 8L50 18L56 4L62 18L68 6L72 20L78 10L80 24Z" fill="#2a1a10"/><circle cx="56" cy="16" r="3" fill="#ff8a1a" stroke="none"/>`
      : `<path d="M34 26Q58 18 84 24Q70 20 64 4Q58 10 52 2Q50 16 34 26Z" fill="#3a1e5a"/><path d="M40 24Q60 19 80 23" fill="none" stroke="#ff8a1a" stroke-width="3"/>`;
    return `<path d="M30 112Q34 74 46 62H74Q86 74 90 112L82 104L76 112L68 104L60 112L52 104L44 112L38 104Z" fill="#3a1e5a"/>
${rope('M48 70Q34 76 22 70', '#7a5230')}${rope('M72 70Q88 76 98 66', '#7a5230')}
<circle cx="100" cy="76" r="8" fill="#ff8a1a"/><path d="M96 75l2-3 2 3M101 75l2-3 2 3" fill="none" stroke-width="1.5"/>
<path d="M30 46Q30 22 60 22Q90 22 90 46Q90 66 60 66Q30 66 30 46Z" fill="#f07a1a"/>
<path d="M46 26Q44 46 48 64M74 26Q76 46 72 64" fill="none" stroke-width="2" opacity=".6"/>
<path d="M40 42L48 34L52 44Z M80 42L72 34L68 44Z" fill="${face}" stroke-width="2"/>
<path d="M40 52Q60 66 80 52Q72 56 66 54L64 58L58 54L54 58L50 54Q44 55 40 52Z" fill="${face}" stroke-width="2"/>
${hat}${shine(44, 32, 8, 4)}`;
  };
ART.hollowjack = { shadow: 26, draw: () => jackArt(false) };
ART.hollowking = { shadow: 30, draw: () => jackArt(true) };

const cache = new Map();
export function monsterArt(id) {
  if (!cache.has(id)) {
    const a = ART[id];
    const float = BY_ID[id].float ? ' float' : '';
    cache.set(id, `<svg class="mon${float}" viewBox="0 0 120 120" aria-hidden="true">` +
      `<ellipse class="shadow" cx="60" cy="110" rx="${a.shadow}" ry="5" fill="#000" opacity=".28"/>` +
      `<g class="body" stroke="${O}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${a.draw()}</g></svg>`);
  }
  return cache.get(id);
}

export const eggArt = () => `<svg class="egg" viewBox="0 0 60 70" aria-hidden="true">
<path d="M30 4C14 4 6 30 6 44C6 58 17 66 30 66C43 66 54 58 54 44C54 30 46 4 30 4Z" fill="#fff4dc" stroke="${O}" stroke-width="3"/>
<circle cx="20" cy="30" r="4" fill="#ff8fb8"/><circle cx="38" cy="22" r="3" fill="#7fd3ff"/><circle cx="40" cy="44" r="5" fill="#9be07a"/>
<circle cx="22" cy="52" r="3" fill="#ffc928"/><ellipse cx="20" cy="18" rx="5" ry="8" transform="rotate(25 20 18)" fill="#fff" opacity=".6"/></svg>`;

// The crest: a dark shield with a gold rim and a beast's face in it, two burning eyes over
// two fangs bound by a gold band with an ember gem.
export const logoArt = () => `<svg viewBox="0 0 40 40" aria-hidden="true">
<defs><linearGradient id="lgRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b0"/><stop offset=".55" stop-color="#d49a45"/><stop offset="1" stop-color="#6e4216"/></linearGradient>
<linearGradient id="lgField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b24"/><stop offset="1" stop-color="#0b0608"/></linearGradient>
<linearGradient id="lgFang" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".5" stop-color="#ff8a2a"/><stop offset="1" stop-color="#b8201a"/></linearGradient></defs>
<path d="M20 2.2L35 7.2V18.6C35 27.8 28.6 34.4 20 37.8C11.4 34.4 5 27.8 5 18.6V7.2Z" fill="url(#lgField)" stroke="url(#lgRim)" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M20 5.6L31.8 9.6V18.6C31.8 25.6 27 31 20 34.2" fill="none" stroke="#ffe9b0" stroke-opacity=".22" stroke-width=".9"/>
<g fill="#ff8a2a"><path d="M11.6 7.6L17.4 9.4L16.4 10.6Z"/><path d="M28.4 7.6L22.6 9.4L23.6 10.6Z"/></g>
<g fill="url(#lgFang)"><path d="M11.2 14.6C11.4 21.8 14.2 27.4 18.4 31.8C16.8 26.6 16.2 20.8 16.8 15.4Z"/><path d="M28.8 14.6C28.6 21.8 25.8 27.4 21.6 31.8C23.2 26.6 23.8 20.8 23.2 15.4Z"/></g>
<path d="M8.6 11.4Q20 15 31.4 11.4V14.6Q20 18.2 8.6 14.6Z" fill="url(#lgRim)" stroke="#2a1608" stroke-width=".7" stroke-linejoin="round"/>
<path d="M20 13L21.8 15.1L20 17.2L18.2 15.1Z" fill="#ff8a2a" stroke="#fff3b8" stroke-width=".5"/></svg>`;

// Small line glyphs for the elements and roles, drawn in currentColor.
const GLYPH = {
  ember: '<path d="M8 1C9.2 4.2 12.4 5.8 12.4 9.8A4.4 4.4 0 0 1 3.6 9.8C3.6 7.6 4.7 6.4 5.8 5.4C5.9 7 6.8 8.1 8 8.2C7.3 6.2 7 3.6 8 1Z"/>',
  bloom: '<path d="M13.4 2.2C6.8 2.4 3 5.8 3 10.4C3 11.6 3.3 12.5 3.7 13L2.2 14.6L3.1 15.4L4.6 13.8C5.3 14.2 6.1 14.4 7 14.4C11.6 14.4 13.6 9.4 13.4 2.2ZM5.6 12.2C6.8 9.8 8.6 7.8 11 6.2C9.2 8.2 7.6 10.2 6.6 12.8Z"/>',
  stone: '<path d="M1 14.2L5.8 5L8.4 9.2L10.4 6.6L15 14.2Z"/>',
  volt: '<path d="M9.6 1L3 9.2H7.4L6 15L13 6.6H8.6Z"/>',
  tide: '<path d="M8 1.4C8 1.4 3 7.4 3 10.6A5 5 0 0 0 13 10.6C13 7.4 8 1.4 8 1.4Z"/>',
  guard: '<path d="M8 1L14 3.4V8C14 11.6 11.6 13.9 8 15.2C4.4 13.9 2 11.6 2 8V3.4Z"/>',
  striker: '<path d="M2.5 2.5L11 11M13.5 2.5L5 11M9.2 13.6L13.4 9.4M2.6 9.4L6.8 13.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  mystic: '<path d="M8 1L9.6 6.4L15 8L9.6 9.6L8 15L6.4 9.6L1 8L6.4 6.4Z"/>',
  all: '<path d="M8 1L15 8L8 15L1 8Z"/>',
  egg: '<path d="M8 1C4.8 1 3 6 3 9.4C3 12.6 5.2 15 8 15S13 12.6 13 9.4C13 6 11.2 1 8 1Z"/>',
  claw: '<path d="M5.4 1.4C6 6 4.8 10.6 1.6 14.4C5.8 11.4 7.8 6.8 7.4 1.4Z M9.6 1.4C10.2 6.2 9 10.9 5.8 14.8C10 11.8 12 7 11.6 1.4Z M13.6 2.6C14 6.4 13 10.1 10.8 13.4C14 11 15.4 7.3 15.1 2.6Z"/>',
  crown: '<path d="M1.4 4.4L4.8 8L8 2.4L11.2 8L14.6 4.4L13.2 12.4H2.8Z M2.8 13.4H13.2V15H2.8Z"/>',
  ribbon: '<path d="M3.5 1H12.5V15L8 11.6L3.5 15Z"/>',
  tome: '<path d="M2.2 2.6C4.6 2 6.6 2.4 8 3.6C9.4 2.4 11.4 2 13.8 2.6V13.4C11.4 12.8 9.4 13.2 8 14.4C6.6 13.2 4.6 12.8 2.2 13.4Z M8 3.6V14.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  lock: '<path d="M3 7.2H13V15H3Z"/><path d="M5.2 7.2V5.2A2.8 2.8 0 0 1 10.8 5.2V7.2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  check: '<path d="M2.5 8.6L6.2 12.2L13.6 4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  // Night of Fangs
  candy: '<path d="M5.4 5.4A3.7 3.7 0 1 1 10.6 10.6A3.7 3.7 0 1 1 5.4 5.4Z M5.6 5.2L2.6 1.6L1.2 5.8Z M10.4 10.8L13.4 14.4L14.8 10.2Z"/>',
  pumpkin: '<path fill-rule="evenodd" d="M8 4.4C10.8 3.1 15 4.6 15 9.1C15 13 11.6 14.6 8 14.6C4.4 14.6 1 13 1 9.1C1 4.6 5.2 3.1 8 4.4Z M7.3 4.5C7.2 2.9 8 1.6 9.7 1.2L10.1 2.1C8.9 2.5 8.5 3.4 8.6 4.5Z M4.5 8.4L6.4 6.8L6.9 8.8Z M11.5 8.4L9.6 6.8L9.1 8.8Z M4.3 10.4Q8 13.6 11.7 10.4Q8 11.7 4.3 10.4Z"/>',
  ghost: '<path fill-rule="evenodd" d="M3 14.6V7.2A5 5 0 0 1 13 7.2V14.6L11.3 13.2L9.6 14.6L8 13.2L6.4 14.6L4.7 13.2Z M6 6.1A1 1.3 0 1 0 6 8.7A1 1.3 0 1 0 6 6.1Z M10 6.1A1 1.3 0 1 0 10 8.7A1 1.3 0 1 0 10 6.1Z"/>',
  bat: '<path d="M8 5.6L7 4L6.6 6C4.6 5 2.4 5.4 1 7C2.6 7 3.6 7.8 3.8 9.2C4.8 8.4 6 8.6 6.8 9.6L8 11.2L9.2 9.6C10 8.6 11.2 8.4 12.2 9.2C12.4 7.8 13.4 7 15 7C13.6 5.4 11.4 5 9.4 6L9 4Z"/>',
};
export const glyph = (name, cls = '') => `<svg class="gl ${cls}" viewBox="0 0 16 16" aria-hidden="true">${GLYPH[name] ?? GLYPH.all}</svg>`;
