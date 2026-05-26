import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err);

  const status = err.status || 500;
  const message = err.message || 'Unknown Error';
  
  res.status(status).json({
    status,
    message,
    detail: err,
    stack: err.stack,
    hasDatabaseUrl: !!process.env.DATABASE_URL
  });
}
