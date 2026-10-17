import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

// 老版篡改猴把订单即打即丢、去重和序号还放内存里（页面刷新即失效）。
// exe 版统一落到本地 SQLite：order_id 唯一约束天然去重，序号用自增 id 计算，持久可靠。
let db = null;

export async function initDb() {
  if (db) return db;
  db = await Database.load('sqlite:doudian.db');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id      TEXT UNIQUE NOT NULL,
      order_seq     TEXT,
      shop_name     TEXT,
      nickname      TEXT,
      goods_name    TEXT,
      goods_qty     TEXT,
      order_price   TEXT,
      order_time    TEXT,
      receiver_name TEXT,
      receiver_area TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  return db;
}

// 保存一条订单；返回 true 表示是新单（之前没存过），false 表示重复被忽略
export async function saveOrder(o) {
  const affected = await db.execute(
    `INSERT OR IGNORE INTO orders
      (order_id, order_seq, shop_name, nickname, goods_name, goods_qty,
       order_price, order_time, receiver_name, receiver_area)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      o.orderId,
      o.orderSeq || '',
      o.shopName || '',
      o.nickname || '',
      o.goodsName || '',
      o.goodsQty || '1',
      o.orderPrice || '',
      o.orderTime || '',
      o.receiverName || '',
      o.receiverArea || '',
    ],
  );
  return affected.rowsAffected > 0;
}

// 按自增 id 计算“第 N 单”，供重新打印时展示（不依赖内存计数器）
export async function listOrders(keyword = '') {
  if (keyword) {
    const like = `%${keyword}%`;
    return db.select(
      `SELECT o.*, '第' || o.id || '单' AS seq FROM orders o
       WHERE o.nickname LIKE $1 OR o.order_id LIKE $1 OR o.goods_name LIKE $1
       ORDER BY o.id DESC LIMIT 500`,
      [like],
    );
  }
  return db.select(
    `SELECT o.*, '第' || o.id || '单' AS seq FROM orders o ORDER BY o.id DESC LIMIT 500`,
  );
}

// 分页 + 关键字 + 下单时间范围查询；返回 { rows, total }。order_time 为 'YYYY-MM-DD HH:MM:SS' 文本，按字典序比较即可。
export async function listOrdersPaged(opts = {}) {
  const { keyword = '', page = 1, pageSize = 20, timeFrom = '', timeTo = '' } = opts;
  const conds = [];
  const params = [];
  if (keyword) {
    const i = params.length + 1;
    conds.push(`(o.nickname LIKE $${i} OR o.order_id LIKE $${i} OR o.goods_name LIKE $${i})`);
    params.push(`%${keyword}%`);
  }
  if (timeFrom) { params.push(`${timeFrom} 00:00:00`); conds.push(`o.order_time >= $${params.length}`); }
  if (timeTo) { params.push(`${timeTo} 23:59:59`); conds.push(`o.order_time <= $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const cnt = await db.select(`SELECT COUNT(*) AS c FROM orders o ${where}`, params);
  const total = cnt.length ? Number(cnt[0].c) : 0;
  const offset = Math.max(0, (page - 1) * pageSize);
  const li = params.length + 1;
  const rows = await db.select(
    `SELECT o.*, '第' || o.id || '单' AS seq FROM orders o ${where} ORDER BY o.id DESC LIMIT $${li} OFFSET $${li + 1}`,
    [...params, pageSize, offset],
  );
  return { rows, total };
}

export async function getSetting(key, fallback = '') {
  const rows = await db.select('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key, value) {
  await db.execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, String(value)],
  );
}

// CSV 单元格转义：含逗号/引号/换行时加双引号，内部双引号翻倍
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 拼装全量订单的 CSV 文本（带 BOM 的 UTF-8）；不写盘，供“选位置导出”与自动镜像复用。
export async function buildOrdersCsv() {
  const rows = await db.select(
    `SELECT id, order_id, order_seq, shop_name, nickname, goods_name, goods_qty,
            order_price, order_time, receiver_name, receiver_area, created_at
     FROM orders ORDER BY id ASC`,
  );
  const header = ['序号(id)', '订单号', '商家编号', '店铺', '买家昵称', '商品名称', '数量', '实付金额', '下单时间', '收货人', '省市区', '入库时间'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.order_id, r.order_seq, r.shop_name, r.nickname, r.goods_name, r.goods_qty,
      r.order_price, r.order_time, r.receiver_name, r.receiver_area, r.created_at].map(csvCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// 自动镜像：全量导出到应用数据目录 orders.csv（启动/新单时调用）
export async function exportOrdersCsv() {
  const csv = await buildOrdersCsv();
  return invoke('write_app_file', { name: 'orders.csv', content: csv });
}
