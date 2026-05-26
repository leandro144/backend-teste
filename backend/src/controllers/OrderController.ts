import { Request, Response, NextFunction } from 'express';
import { OrderRepository } from '../repositories/OrderRepository';

const orderRepository = new OrderRepository();

export class OrderController {
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderRepository.findById(String(req.params.id));
      if (!order) {
        const err: any = new Error('Order not found');
        err.status = 404;
        err.errorCode = 'ORDER_NOT_FOUND';
        return next(err);
      }
      res.json(order);
    } catch (error) {
      next(error);
    }
  }
}
