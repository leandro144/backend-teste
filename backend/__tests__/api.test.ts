import request from 'supertest';
import app from '../src/app';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { CheckoutService } from '../src/services/CheckoutService';

// Controllers/services/repos are singletons created at module load time.
// We must spy on prototypes so the already-instantiated objects pick up the mocks.
const mockProduct = { id: '1', name: 'Capinha iPhone', stock: 5, price: 99 };
const mockOrder = { id: 'test-uuid-1', productId: '1', quantity: 1, totalPrice: 99 };

beforeEach(() => {
  jest.spyOn(ProductRepository.prototype, 'findAll').mockResolvedValue([mockProduct]);
  jest.spyOn(ProductRepository.prototype, 'findById').mockResolvedValue(mockProduct);
  jest.spyOn(ProductRepository.prototype, 'decrementStock').mockResolvedValue(true);
  jest.spyOn(ProductRepository.prototype, 'incrementStock').mockResolvedValue();
  jest.spyOn(OrderRepository.prototype, 'create').mockResolvedValue();
  jest.spyOn(OrderRepository.prototype, 'findById').mockResolvedValue(mockOrder);
  jest.spyOn(OrderRepository.prototype, 'findByIdempotencyKey').mockResolvedValue(null);
  jest.spyOn(OrderRepository.prototype, 'saveIdempotencyKey').mockResolvedValue();
  jest.spyOn(CheckoutService.prototype as any, 'simulateERP').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── GET /api/products ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  it('returns 200 with product list', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([mockProduct]);
  });
});

// ─── POST /api/checkout ───────────────────────────────────────────────────────

describe('POST /api/checkout', () => {
  it('returns 201 on success', async () => {
    const res = await request(app)
      .post('/api/checkout')
      .set('Idempotency-Key', 'key-001')
      .send({ productId: '1', quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ productId: '1', quantity: 1, totalPrice: 99 });
  });

  it('returns 400 when productId is missing', async () => {
    const res = await request(app)
      .post('/api/checkout')
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when quantity is 0', async () => {
    const res = await request(app)
      .post('/api/checkout')
      .send({ productId: '1', quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when product does not exist', async () => {
    jest.spyOn(ProductRepository.prototype, 'findById').mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/checkout')
      .send({ productId: '999', quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('PRODUCT_NOT_FOUND');
  });

  it('returns 409 when stock is insufficient', async () => {
    jest.spyOn(ProductRepository.prototype, 'decrementStock').mockResolvedValue(false);

    const res = await request(app)
      .post('/api/checkout')
      .send({ productId: '1', quantity: 99 });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INSUFFICIENT_STOCK');
  });

  it('returns 503 and rolls back stock on ERP failure', async () => {
    jest
      .spyOn(CheckoutService.prototype as any, 'simulateERP')
      .mockRejectedValue(new Error('ERP Timeout'));

    const res = await request(app)
      .post('/api/checkout')
      .send({ productId: '1', quantity: 1 });

    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe('ERP_ERROR');
    expect(ProductRepository.prototype.incrementStock).toHaveBeenCalledWith('1', 1);
  });

  it('returns cached response on duplicate Idempotency-Key', async () => {
    const cached = { status: 201, body: { message: 'Order created successfully', order: mockOrder } };
    jest.spyOn(OrderRepository.prototype, 'findByIdempotencyKey').mockResolvedValue(cached);

    const res = await request(app)
      .post('/api/checkout')
      .set('Idempotency-Key', 'key-dup')
      .send({ productId: '1', quantity: 1 });

    expect(res.status).toBe(201);
    expect(ProductRepository.prototype.decrementStock).not.toHaveBeenCalled();
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  it('returns 200 with order when found', async () => {
    const res = await request(app).get('/api/orders/test-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(mockOrder);
  });

  it('returns 404 when order does not exist', async () => {
    jest.spyOn(OrderRepository.prototype, 'findById').mockResolvedValue(null);

    const res = await request(app).get('/api/orders/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('ORDER_NOT_FOUND');
  });
});
