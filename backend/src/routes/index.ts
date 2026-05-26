import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { CheckoutController } from '../controllers/CheckoutController';
import { validate } from '../middlewares/validation';
import { checkoutSchema } from '../schemas/checkout.schema';
import { idempotency } from '../middlewares/idempotency';

const router = Router();
const productController = new ProductController();
const checkoutController = new CheckoutController();

router.get('/products', productController.list);
router.post('/checkout', idempotency, validate(checkoutSchema), checkoutController.create);

export default router;
