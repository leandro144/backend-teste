import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Lumina Store is running. Use /api/products or /api/checkout. Or access the frontend to interact.');
});
app.use('/api', routes);

app.use(errorHandler);

// In Vercel serverless the app is imported directly — no listener needed
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`[server]: Server is running on port ${port}`);
  });
}

export default app;
