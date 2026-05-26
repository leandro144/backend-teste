import { getDatabase } from '../database/db';

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  totalPrice: number;
}

export class OrderRepository {
  async create(order: Order): Promise<void> {
    const db = await getDatabase();
    await db.query(
      'INSERT INTO orders (id, productId, quantity, totalPrice) VALUES ($1, $2, $3, $4)',
      [order.id, order.productId, order.quantity, order.totalPrice]
    );
  }

  async findByIdempotencyKey(key: string): Promise<any | null> {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM idempotency_keys WHERE key = $1', [key]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      status: row.response_status,
      body: JSON.parse(row.response_body)
    };
  }

  async saveIdempotencyKey(key: string, status: number, body: any): Promise<void> {
    const db = await getDatabase();
    await db.query(
      'INSERT INTO idempotency_keys (key, response_status, response_body) VALUES ($1, $2, $3)',
      [key, status, JSON.stringify(body)]
    );
  }
}
