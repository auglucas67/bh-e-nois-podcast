CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  delivery_type TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery_type IN ('pickup', 'shipping')),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_images (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data_base64 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'CREDIT_CARD')),
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  address_json TEXT,
  view_token_hash TEXT NOT NULL,
  asaas_customer_id TEXT,
  asaas_payment_id TEXT UNIQUE,
  invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'CREATING',
  stock_counted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_buyer_email ON orders(buyer_email);

CREATE TABLE IF NOT EXISTS checkout_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS checkout_attempts_ip ON checkout_attempts(ip, created_at);
