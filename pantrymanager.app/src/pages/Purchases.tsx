import { useState } from "react";
import { 
  Button, 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  IconButton,
  TextField
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import api from "../api/client";
import ProductSearch from "../components/Purchases/ProductSearch";
import { Product, PurchaseItem, PurchaseResponse, ApiError } from "../types";

const Purchases = () => {
  const [cart, setCart] = useState<Array<{
    product: Product;
    quantity: number;
    unitPrice: number;
  }>>([]);
  const [total, setTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddToCart = (product: Product, quantity: number) => {
    const existingItemIndex = cart.findIndex(item => item.product.id === product.id);
    
    if (existingItemIndex >= 0) {
      const updatedCart = [...cart];
      updatedCart[existingItemIndex].quantity += quantity;
      setCart(updatedCart);
    } else {
      setCart([...cart, { 
        product, 
        quantity, 
        unitPrice: product.price 
      }]);
    }
    
    recalculateTotal();
  };

  const recalculateTotal = () => {
    const newTotal = cart.reduce((acc, item) => 
      acc + (item.quantity * item.unitPrice), 0);
    setTotal(newTotal);
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    if (newQuantity > 0) {
      const updatedCart = [...cart];
      updatedCart[index].quantity = newQuantity;
      setCart(updatedCart);
      recalculateTotal();
    }
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    if (newPrice >= 0) {
      const updatedCart = [...cart];
      updatedCart[index].unitPrice = newPrice;
      setCart(updatedCart);
      recalculateTotal();
    }
  };

  const handleRemoveFromCart = (index: number) => {
    const updatedCart = cart.filter((_, i) => i !== index);
    setCart(updatedCart);
    recalculateTotal();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (cart.some(item => item.unitPrice <= 0)) {
        alert("Todos los precios deben ser mayores a 0");
        return;
      }

      const purchaseData = {
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          currentStock: item.product.quantity
        } as PurchaseItem))
      };

      const response = await api.post<PurchaseResponse>("/purchases", purchaseData);
      alert(`Compra registrada con éxito. ID: ${response.data.id}`);
      setCart([]);
      setTotal(0);
      window.dispatchEvent(new Event('inventory-updated'));

    } catch (error) {
      handleSubmissionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmissionError = (error: unknown) => {
    let errorMessage = "Error al registrar la compra";
    
    if (isApiError(error)) {
      // Manejo de errores de Axios
      errorMessage = error.response?.data?.message || 
                    error.message || 
                    errorMessage;
      
      // Manejo de errores de validación del backend
      if (error.response?.data?.errors) {
        errorMessage = Object.values(error.response.data.errors)
          .flat()
          .join('\n');
      }
    } else if (error instanceof Error) {
      // Manejo de errores estándar
      errorMessage = error.message;
    }

    console.error("Error en compra:", error);
    alert(errorMessage);
  };

  const isApiError = (error: unknown): error is ApiError => {
    return typeof error === 'object' && 
           error !== null && 
           'isAxiosError' in error && 
           (error as ApiError).isAxiosError;
  };

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant="h4" gutterBottom>
        Registrar Compra
      </Typography>

      <ProductSearch onAdd={handleAddToCart} />

      <Typography variant="h6" gutterBottom sx={{ marginTop: 3 }}>
        Productos en el Carrito
      </Typography>
      
      {cart.length > 0 ? (
        <Paper>
          <List>
            {cart.map((item, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton edge="end" onClick={() => handleRemoveFromCart(index)}>
                    <Delete color="error" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={item.product.name}
                  secondary={
                    <>
                      <Box sx={{ 
                        display: 'flex', 
                        gap: 2, 
                        alignItems: 'center', 
                        mt: 1,
                        flexWrap: 'wrap' 
                      }}>
                        <TextField
                          label="Cantidad"
                          type="number"
                          variant="outlined"
                          size="small"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(index, Math.max(1, Number(e.target.value)))}
                          inputProps={{ 
                            min: 1,
                            step: item.product.stockType === 'Units' ? 1 : 0.1
                          }}
                          sx={{ width: 120 }}
                        />
                        
                        <TextField
                          label="Precio Unitario"
                          type="number"
                          variant="outlined"
                          size="small"
                          value={item.unitPrice}
                          onChange={(e) => handlePriceChange(index, Number(e.target.value))}
                          inputProps={{ 
                            min: 0.01,
                            step: 0.01
                          }}
                          sx={{ width: 140 }}
                        />
                        <Typography variant="body2">
                          Stock: {item.product.quantity} {item.product.unitOfMeasure}
                        </Typography>
                        <Typography variant="body2">
                          {item.product.unitOfMeasure}
                        </Typography>
                      </Box>
                      
                      <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                        Subtotal: ${(item.quantity * item.unitPrice).toLocaleString('es-CL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      ) : (
        <Typography variant="body1" sx={{ marginTop: 2 }}>
          No hay productos en el carrito.
        </Typography>
      )}

      <Box sx={{ marginTop: 3 }}>
        <Typography variant="h6">
          Total: ${total.toLocaleString('es-CL', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
          })}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          sx={{ marginTop: 2 }}
          disabled={cart.length === 0 || isSubmitting}
        >
          {isSubmitting ? "Procesando..." : "Finalizar Compra"}
        </Button>
      </Box>
    </Box>
  );
};

export default Purchases;