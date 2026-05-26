import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShoppingCart, Package, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  text: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/products`);
      setProducts(response.data);
    } catch (error) {
      showToast('error', 'Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleCheckout = async (
    productId: string,
    quantity: number,
    idempotencyKey: string,
    onSuccess: () => void,
  ) => {
    setProcessingId(productId);

    try {
      const response = await axios.post(
        `${API_URL}/checkout`,
        { productId, quantity },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );

      showToast('success', `Sucesso! Pedido #${response.data.order.id.slice(0, 8)} criado.`);
      onSuccess(); // rotate key so next purchase is a fresh attempt
      fetchProducts();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Falha na integração com ERP';
      showToast('error', msg);
      if (error.response?.status === 409) fetchProducts();
      // keep the same idempotencyKey so a retry is safe
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Lumina Store</h1>
        <p className="subtitle">Experiência premium em tecnologia com alta performance e resiliência.</p>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <Loader2 className="loading-spinner" style={{ width: '40px', height: '40px' }} />
        </div>
      ) : (
        <div className="product-grid">
          {products.map(product => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onCheckout={handleCheckout}
              disabled={processingId !== null}
              isProcessing={processingId === product.id}
            />
          ))}
        </div>
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  onCheckout: (id: string, qty: number, key: string, onSuccess: () => void) => void;
  disabled: boolean;
  isProcessing: boolean;
}

function ProductCard({ product, onCheckout, disabled, isProcessing }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  // Stable per-attempt key: generated once per card mount and reset after a successful purchase.
  // This ensures that network retries re-use the same key while a new attempt gets a fresh one.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => uuidv4());

  const handleBuy = () => {
    onCheckout(product.id, quantity, idempotencyKey, () => setIdempotencyKey(uuidv4()));
  };

  return (
    <div className="product-card">
      <div className="product-name">{product.name}</div>
      <div className="product-price">R$ {product.price.toLocaleString('pt-BR')}</div>
      <div className="product-stock">
        <Package size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
        {product.stock > 0 ? `${product.stock} unidades em estoque` : 'Esgotado'}
      </div>
      
      <div className="product-actions">
        <input 
          type="number" 
          min="1" 
          max={product.stock} 
          value={quantity} 
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          disabled={disabled || product.stock === 0}
        />
        <button
          onClick={handleBuy}
          disabled={disabled || product.stock === 0}
        >
          {isProcessing ? (
            <Loader2 className="loading-spinner" />
          ) : (
            <>
              <ShoppingCart size={18} />
              Comprar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default App;
