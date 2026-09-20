ALTER TABLE products ADD COLUMN weight_kg REAL NOT NULL DEFAULT 0.3;
ALTER TABLE products ADD COLUMN width_cm REAL NOT NULL DEFAULT 16;
ALTER TABLE products ADD COLUMN height_cm REAL NOT NULL DEFAULT 4;
ALTER TABLE products ADD COLUMN length_cm REAL NOT NULL DEFAULT 24;

CREATE TABLE IF NOT EXISTS product_gallery (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
  mime TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  UNIQUE(product_id, position)
);
CREATE INDEX IF NOT EXISTS product_gallery_product ON product_gallery(product_id, position);

CREATE TABLE IF NOT EXISTS shipping_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS shipping_attempts_ip ON shipping_attempts(ip, created_at);
