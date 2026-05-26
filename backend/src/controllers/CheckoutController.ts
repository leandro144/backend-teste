import { Request, Response, NextFunction } from 'express';
import { CheckoutService } from '../services/CheckoutService';

const checkoutService = new CheckoutService();

export class CheckoutController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, quantity } = req.body;
      const order = await checkoutService.processCheckout(productId, quantity);
      res.status(201).json({
        message: 'Order created successfully',
        order
      });
    } catch (error) {
      next(error);
    }
  }
}
