import Database from '@tauri-apps/plugin-sql';

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
