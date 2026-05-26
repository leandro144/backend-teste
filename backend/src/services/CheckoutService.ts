import { ProductRepository } from '../repositories/ProductRepository';
import { OrderRepository, Order } from '../repositories/OrderRepository';
import { v4 as uuidv4 } from 'uuid';

export class CheckoutService {
  private productRepository = new ProductRepository();
  private orderRepository = new OrderRepository();

  async processCheckout(productId: string, quantity: number): Promise<Order> {
    const product = await this.productRepository.findById(productId);

    if (!product) {
      const error: any = new Error('Product not found');
      error.status = 404;
      error.errorCode = 'PRODUCT_NOT_FOUND';
      throw error;
    }

    // 1. ATOMIC STOCK LOCK
    // We try to decrement stock directly in the database with a condition stock >= quantity.
    // This avoids race conditions where two threads read the same stock and both try to decrement.
    const success = await this.productRepository.decrementStock(productId, quantity);

    if (!success) {
      const error: any = new Error('Insufficient stock');
      error.status = 409;
      error.errorCode = 'INSUFFICIENT_STOCK';
      throw error;
    }

    try {
      // 2. SIMULATE ERP COMMUNICATION
      await this.simulateERP();

      // 3. CREATE ORDER
      const order: Order = {
        id: uuidv4(),
        productId,
        quantity,
        totalPrice: product.price * quantity
      };

      await this.orderRepository.create(order);
      return order;

    } catch (err: any) {
      // Compensating transaction: restore the decremented units using a relative increment
      // so concurrent transactions that may have also modified stock are not affected.
      await this.productRepository.incrementStock(productId, quantity);

      const error: any = new Error(err.message || 'ERP Integration Failed');
      error.status = 503;
      error.errorCode = 'ERP_ERROR';
      throw error;
    }
  }

  private async simulateERP(): Promise<void> {
    // Artificial delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Random failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('ERP Timeout / Service Unavailable');
    }
  }
}
