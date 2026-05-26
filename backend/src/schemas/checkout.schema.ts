import { z } from 'zod';

export const checkoutSchema = z.object({
  body: z.object({
    productId: z.string().min(1, "productId is required"),
    quantity: z.number().min(1, "quantity must be at least 1"),
  }),
});
