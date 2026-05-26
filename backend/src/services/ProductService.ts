import { ProductRepository, Product } from '../repositories/ProductRepository';

export class ProductService {
  private repository = new ProductRepository();

  async listProducts(): Promise<Product[]> {
    return this.repository.findAll();
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.repository.findById(id);
  }
}
