import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool;

export async function getDatabase(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('CRITICAL: DATABASE_URL is not defined in environment variables!');
  }

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Required for Neon/Supabase on some environments
    }
  });

  await setupDb(pool);
  return pool;
}

async function setupDb(p: Pool) {
  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        stock INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        productId TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        totalPrice DECIMAL(10,2) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(productId) REFERENCES products(id)
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        response_status INTEGER NOT NULL,
        response_body TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const seedProducts = [
      ['1', 'Capinha iPhone', 5, 99.00],
      ['2', 'Carregador MagSafe', 10, 249.00],
      ['3', 'AirPods Pro', 1, 1499.00]
    ];

    for (const [id, name, stock, price] of seedProducts) {
      await client.query(
        'INSERT INTO products (id, name, stock, price) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [id, name, stock, price]
      );
    }
  } finally {
    client.release();
  }
}
