import { getDatabase } from '../database/db';

export interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
}

export class ProductRepository {
  async findAll(): Promise<Product[]> {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM products');
    return result.rows;
  }

  async findById(id: string): Promise<Product | undefined> {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0];
  }

  async updateStock(id: string, newStock: number): Promise<void> {
    const db = await getDatabase();
    await db.query('UPDATE products SET stock = $1 WHERE id = $2', [newStock, id]);
  }

  /**
   * Atomic stock decrement
   * This ensures we don't oversell by checking stock >= quantity in the same query.
   */
  async decrementStock(id: string, quantity: number): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $3',
      [quantity, id, quantity]
    );
    return (result.rowCount || 0) > 0;
  }
}
