import { getSetting, setSetting } from './db';

// 1mm 对应的 CSS 像素（96dpi）
export const MM_PX = 96 / 25.4;

// 可绑定到订单数据的字段目录（画布左侧“字段模块”来源）
export const FIELD_CATALOG = [
  { field: 'nickname', name: '买家昵称' },
  { field: 'goodsName', name: '商品名称' },
  { field: 'goodsQty', name: '数量' },
  { field: 'orderPrice', name: '实付金额' },
  { field: 'receiverName', name: '收货人' },
  { field: 'receiverArea', name: '省市区' },
  { field: 'orderTime', name: '下单时间' },
  { field: 'orderId', name: '订单编号' },
  { field: 'orderSeq', name: '单号序号' },
  { field: 'shopName', name: '店铺名称' },
  { field: 'goodsNotice', name: '说明备注' },
];

let uid = 1;
export const nextId = () => `el${Date.now().toString(36)}${uid++}`;

// 元素：type = field | text | divider
// 坐标单位一律 mm，相对于“内容设计盒”左上角；fontSize 也用 mm 保证打印物理尺寸一致
export function makeEl(partial) {
  return {
    id: nextId(),
    type: 'field',
    field: '',
    text: '',
    x: 3,
    y: 3,
    w: 30,
    h: 4,
    fontSize: 3,
    bold: false,
    align: 'left',
    ...partial,
  };
}

// 依据进纸尺寸生成默认布局（内容盒为横向 paperH × paperW，还原老版 70×50 观感）
export function defaultLayout(paperW, paperH) {
  const Wd = paperH; // 内容盒宽
  const Hd = paperW; // 内容盒高
  const m = 3; // 页边距
  const r = Wd - m; // 右边界
  const b = Hd - m; // 下边界
  const dividerY1 = 15.5;
  const dividerY2 = 38.5;
  const els = [
    makeEl({ type: 'field', field: 'orderSeq', x: m, y: 1.5, w: Wd * 0.4, h: 4, fontSize: 3, bold: true }),
    makeEl({ type: 'field', field: 'shopName', x: Wd * 0.45, y: 1.5, w: r - Wd * 0.45, h: 4, fontSize: 3, align: 'right' }),
    makeEl({ type: 'text', text: '昵称:', x: m, y: 6, w: 10, h: 6, fontSize: 4, bold: true }),
    makeEl({ type: 'field', field: 'nickname', x: m + 10, y: 6, w: r - (m + 10), h: 6, fontSize: 5.2, bold: true }),
    makeEl({ type: 'field', field: 'receiverName', x: m, y: 12.5, w: Wd * 0.4, h: 3.4, fontSize: 2.8, bold: true }),
    makeEl({ type: 'field', field: 'receiverArea', x: Wd * 0.42, y: 12.5, w: r - Wd * 0.42, h: 3.4, fontSize: 2.8, align: 'right' }),
    makeEl({ type: 'divider', x: m, y: dividerY1, w: r - m, h: 0.3, fontSize: 0 }),
    makeEl({ type: 'field', field: 'goodsName', x: m, y: dividerY1 + 1, w: r - m, h: 6, fontSize: 3.1, bold: true }),
    makeEl({ type: 'field', field: 'goodsNotice', x: m, y: dividerY1 + 7.5, w: r - m, h: 5, fontSize: 2.5 }),
    makeEl({ type: 'divider', x: m, y: dividerY2, w: r - m, h: 0.3, fontSize: 0 }),
    makeEl({ type: 'text', text: '数量:', x: m, y: dividerY2 + 1, w: 8, h: 4, fontSize: 3, bold: true }),
    makeEl({ type: 'field', field: 'goodsQty', x: m + 8, y: dividerY2 + 1, w: 8, h: 4, fontSize: 3, bold: true }),
    makeEl({ type: 'field', field: 'orderPrice', x: m + 20, y: dividerY2 + 1, w: 22, h: 4, fontSize: 3, bold: true }),
    makeEl({ type: 'field', field: 'orderTime', x: Wd * 0.6, y: dividerY2 + 1, w: r - Wd * 0.6, h: 4, fontSize: 2.6, align: 'right' }),
    makeEl({ type: 'field', field: 'orderId', x: m, y: b - 3.5, w: Wd * 0.55, h: 3, fontSize: 2.3 }),
    makeEl({ type: 'text', text: '一经售出概不退换', x: Wd * 0.55, y: b - 3.5, w: r - Wd * 0.55, h: 3, fontSize: 2.3, align: 'right' }),
  ];
  return { Wd, Hd, paperW, paperH, elements: els };
}

export async function loadLayout(paperW, paperH) {
  const raw = await getSetting('ticketLayout', '');
  if (raw) {
    try {
      const l = JSON.parse(raw);
      // 纸尺寸变了则重算内容盒，元素坐标保持（用户可再调）
      l.Wd = paperH;
      l.Hd = paperW;
      l.paperW = paperW;
      l.paperH = paperH;
      return l;
    } catch (e) {
      /* 落回默认 */
    }
  }
  return defaultLayout(paperW, paperH);
}

export async function saveLayout(layout) {
  await setSetting('ticketLayout', JSON.stringify(layout));
}
