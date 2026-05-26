import { CheckoutService } from '../src/services/CheckoutService';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';

jest.mock('../src/repositories/ProductRepository');
jest.mock('../src/repositories/OrderRepository');

const mockProduct = { id: '1', name: 'Capinha iPhone', stock: 5, price: 99 };

describe('CheckoutService', () => {
  let service: CheckoutService;
  let productRepo: jest.Mocked<ProductRepository>;
  let orderRepo: jest.Mocked<OrderRepository>;

  beforeEach(() => {
    productRepo = new ProductRepository() as jest.Mocked<ProductRepository>;
    orderRepo = new OrderRepository() as jest.Mocked<OrderRepository>;

    (ProductRepository as jest.Mock).mockReturnValue(productRepo);
    (OrderRepository as jest.Mock).mockReturnValue(orderRepo);

    service = new CheckoutService();

    // Default happy-path mocks
    productRepo.findById.mockResolvedValue(mockProduct);
    productRepo.decrementStock.mockResolvedValue(true);
    productRepo.incrementStock.mockResolvedValue();
    orderRepo.create.mockResolvedValue();

    // Bypass ERP delay/randomness in all tests by default
    jest.spyOn(service as any, 'simulateERP').mockResolvedValue(undefined);
  });

  describe('processCheckout — success', () => {
    it('decrements stock and creates order', async () => {
      const order = await service.processCheckout('1', 2);

      expect(productRepo.decrementStock).toHaveBeenCalledWith('1', 2);
      expect(orderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ productId: '1', quantity: 2, totalPrice: 198 })
      );
      expect(order.totalPrice).toBe(198);
    });
  });

  describe('processCheckout — product not found', () => {
    it('throws 404 PRODUCT_NOT_FOUND', async () => {
      productRepo.findById.mockResolvedValue(undefined);

      await expect(service.processCheckout('999', 1)).rejects.toMatchObject({
        status: 404,
        errorCode: 'PRODUCT_NOT_FOUND',
      });
    });
  });

  describe('processCheckout — insufficient stock', () => {
    it('throws 409 INSUFFICIENT_STOCK when decrement fails', async () => {
      productRepo.decrementStock.mockResolvedValue(false);

      await expect(service.processCheckout('1', 10)).rejects.toMatchObject({
        status: 409,
        errorCode: 'INSUFFICIENT_STOCK',
      });
      expect(orderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('processCheckout — ERP failure', () => {
    it('rolls back stock with relative increment and throws 503 ERP_ERROR', async () => {
      jest.spyOn(service as any, 'simulateERP').mockRejectedValue(new Error('ERP Timeout'));

      await expect(service.processCheckout('1', 2)).rejects.toMatchObject({
        status: 503,
        errorCode: 'ERP_ERROR',
      });

      // Must use relative increment, not absolute updateStock
      expect(productRepo.incrementStock).toHaveBeenCalledWith('1', 2);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('processCheckout — concurrency guard', () => {
    it('only one request succeeds when two race for the last unit', async () => {
      // First call wins the atomic lock; second loses
      productRepo.decrementStock
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const [result1, result2] = await Promise.allSettled([
        service.processCheckout('1', 1),
        service.processCheckout('1', 1),
      ]);

      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('rejected');
      expect((result2 as PromiseRejectedResult).reason).toMatchObject({
        errorCode: 'INSUFFICIENT_STOCK',
      });
    });
  });
});
