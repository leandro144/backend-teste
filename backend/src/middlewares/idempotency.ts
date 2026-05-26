import { Request, Response, NextFunction } from 'express';
import { OrderRepository } from '../repositories/OrderRepository';

const orderRepository = new OrderRepository();

export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = req.header('Idempotency-Key');

  if (!key) {
    return next();
  }

  const cachedResponse = await orderRepository.findByIdempotencyKey(key);

  if (cachedResponse) {
    return res.status(cachedResponse.status).json(cachedResponse.body);
  }

  // Monkey patch res.json to catch the response and save it
  const originalJson = res.json;
  res.json = function (body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      orderRepository.saveIdempotencyKey(key, res.statusCode, body);
    }
    return originalJson.call(this, body);
  };

  next();
}
