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
import { Product, PurchaseResponse, ApiError } from "../types";

const Purchases = () => {
  const [cart, setCart] = useState<Array<{
    product: Product;
    quantity: number;
    unitPrice: number;
  }>>([]);
  const [total, setTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddToCart = (product: Product, quantity: number) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => item.product.id === product.id);
      const newCart = [...prevCart];
      
      if (existingItemIndex >= 0) {
        newCart[existingItemIndex].quantity += quantity;
      } else {
        newCart.push({ 
          product, 
          quantity, 
          unitPrice: product.price 
        });
      }
      
      // Calcular el total inmediatamente con el nuevo carrito
      const newTotal = newCart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
      setTotal(newTotal);
      
      return newCart;
    });
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    if (newQuantity > 0) {
      setCart(prevCart => {
        const updatedCart = [...prevCart];
        updatedCart[index].quantity = newQuantity;
        
        // Recalcular el total
        const newTotal = updatedCart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
        setTotal(newTotal);
        
        return updatedCart;
      });
    }
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    if (newPrice >= 0) {
      setCart(prevCart => {
        const updatedCart = [...prevCart];
        updatedCart[index].unitPrice = newPrice;
        
        // Recalcular el total
        const newTotal = updatedCart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
        setTotal(newTotal);
        
        return updatedCart;
      });
    }
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(prevCart => {
      const updatedCart = prevCart.filter((_, i) => i !== index);
      
      // Recalcular el total
      const newTotal = updatedCart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
      setTotal(newTotal);
      
      return updatedCart;
    });
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
          purchasePrice: item.unitPrice,
          currentStock: item.product.quantity
        }))
      };

      await api.post<PurchaseResponse>("/purchases", purchaseData);
      
      alert("¡Compra registrada y stock actualizado exitosamente!");
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
      errorMessage = error.response?.data?.message || 
                    error.message || 
                    errorMessage;
      
      if (error.response?.data?.errors) {
        errorMessage = Object.values(error.response.data.errors)
          .flat()
          .join('\n');
      }
    } else if (error instanceof Error) {
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
                    <Box component="div">
                      <Box 
                        component="div"
                        sx={{ 
                          display: 'flex', 
                          gap: 2, 
                          alignItems: 'center', 
                          mt: 1,
                          flexWrap: 'wrap' 
                        }}
                      >
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
                        
                        <Typography variant="body2" component="div">
                          {item.product.unitOfMeasure}
                        </Typography>
                        
                        <Typography variant="body2" component="div">
                          Stock disponible: {item.product.quantity}
                        </Typography>
                      </Box>
                      
                      <Typography 
                        variant="body2" 
                        component="div" 
                        sx={{ mt: 1 }}
                      >
                        Subtotal: ${(item.quantity * item.unitPrice).toLocaleString('es-CL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </Typography>
                    </Box>
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