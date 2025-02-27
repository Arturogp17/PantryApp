import { useState, useEffect } from "react";
import { TextField, Grid, Box, Typography, List, ListItem, ListItemText, Paper, Button } from "@mui/material";
import api from "../../api/client";
import { Product } from "../../types";

interface ProductSearchProps {
  onAdd: (product: Product, quantity: number) => void;
}

const debounce = <T extends (...args: any[]) => void>(
  func: T,
  wait: number
) => {
  let timeout: NodeJS.Timeout;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

const ProductSearch = ({ onAdd }: ProductSearchProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get(`/products?search=${searchTerm}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error("Error buscando productos:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProduct) {
      setSearchResults([]);
      return;
    }

    const debouncedSearch = debounce(handleSearch, 300);
    debouncedSearch();
    return () => debouncedSearch.cancel();
  }, [searchTerm, selectedProduct]);

  const handleSelectProduct = (product: Product) => {
    setSearchTerm(product.name);
    setSelectedProduct(product);
    setSearchResults([]);
  };

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant="h6" gutterBottom>
        Buscar Producto
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label="Buscar producto..."
            variant="outlined"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (selectedProduct) setSelectedProduct(null);
            }}
          />
          
          <Paper sx={{ marginTop: 1, maxHeight: 200, overflow: "auto" }}>
            {isLoading ? (
              <ListItem>
                <ListItemText primary="Buscando productos..." />
              </ListItem>
            ) : (
              searchResults.length > 0 && (
                <List>
                  {searchResults.map((product) => (
                    <ListItem
                      key={product.id}
                      component="div"
                      sx={{ 
                        cursor: "pointer",
                        "&:hover": { backgroundColor: "#f5f5f5" }
                      }}
                      onClick={() => handleSelectProduct(product)}
                    >
                      <ListItemText
                        primary={product.name}
                        secondary={
                          <>
                            <Typography variant="body2" component="span" display="block">
                              Stock actual: {product.quantity} {product.unitOfMeasure}
                            </Typography>
                            <Typography variant="body2" component="span">
                              Precio: ${product.price.toFixed(2)}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} sm={2}>
          <TextField
            fullWidth
            label="Cantidad"
            type="number"
            variant="outlined"
            inputProps={{ min: 1 }}
            value={quantity}
            onChange={(e) => {
              const value = Math.max(1, Number(e.target.value));
              setQuantity(value);
            }}
          />
        </Grid>

        <Grid item xs={12} sm={2}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={() => {
              if (selectedProduct) {
                onAdd(selectedProduct, quantity);
                setSelectedProduct(null);
                setSearchTerm("");
                setQuantity(1);
              }
            }}
            sx={{ height: '56px' }}
            disabled={!selectedProduct}
          >
            Agregar
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProductSearch;