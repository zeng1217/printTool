// 主题色：由一个主色 hex 推导出一整套深浅变量，写入 :root 覆盖 styles.scss 默认值。
// 仅做纯计算与 DOM 变量写入，不涉及持久化（持久化在 store 里做）。

export const THEME_PRESETS = [
  { name: '抖店蓝', hex: '#3370ff' },
  { name: '青碧', hex: '#0fc6c2' },
  { name: '紫罗兰', hex: '#7c5cff' },
  { name: '森绿', hex: '#00a843' },
  { name: '暖橙', hex: '#ff7d00' },
  { name: '玫红', hex: '#f53f7f' },
  { name: '石墨', hex: '#3d4d63' },
];

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
}
// 与白(t)或黑(f)按比例混合
function mix(hex, target, ratio) {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = hexToRgb(target);
  return rgbToHex(r + (tr - r) * ratio, g + (tg - g) * ratio, b + (tb - b) * ratio);
}

export function applyTheme(hex) {
  if (!/^#?[0-9a-fA-F]{3,6}$/.test(hex)) return;
  const base = hex.startsWith('#') ? hex : '#' + hex;
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  const [r, g, b] = hexToRgb(base);

  const hover = mix(base, '#000000', 0.12);
  const active = mix(base, '#000000', 0.22);
  // 把 hex 转成 Arco 需要的 "R, G, B" 三元组字符串
  const triple = (h) => { const c = hexToRgb(h); return `${c[0]}, ${c[1]}, ${c[2]}`; };

  // 自定义变量（hex 直接作颜色值）
  set('--primary', base);
  set('--primary-hover', hover);
  set('--primary-active', active);
  set('--primary-weak', mix(base, '#ffffff', 0.9));
  set('--primary-ring', `rgba(${r}, ${g}, ${b}, 0.16)`);

  // Arco 主色变量：--primary-N / --arcoblue-N 被 rgb(var(...)) 消费，必须是 "R, G, B" 三元组（非 hex）；
  // 覆盖 1~10 全色阶，否则 primary 按钮及其 hover/active 仍会回落到 Arco 默认蓝。
  const shades = {
    1: mix(base, '#ffffff', 0.9),
    2: mix(base, '#ffffff', 0.8),
    3: mix(base, '#ffffff', 0.6),
    4: mix(base, '#ffffff', 0.42),
    5: mix(base, '#ffffff', 0.22),
    6: base,
    7: hover,
    8: active,
    9: mix(base, '#000000', 0.32),
    10: mix(base, '#000000', 0.44),
  };
  for (let i = 1; i <= 10; i++) {
    const t = triple(shades[i]);
    set(`--primary-${i}`, t);
    set(`--arcoblue-${i}`, t);
  }
}
