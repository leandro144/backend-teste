import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const status = err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${status} ${errorCode}:`, err.message);
  }

  res.status(status).json({
    status,
    errorCode,
    message,
  });
}
