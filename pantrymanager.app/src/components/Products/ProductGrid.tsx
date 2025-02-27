import React from 'react';
import { Grid, Paper, Typography, Box, List, ListItem, ListItemText } from '@mui/material';
import { Product } from '../../types';
interface ProductGridProps {
  products: Product[];
  mode: 'grid' | 'list';
}

const ProductGrid = ({ products, mode }: ProductGridProps) => {
  if (mode === 'grid') {
    return (
      <Grid container spacing={3}>
        {products.map((product) => (
          <Grid item key={product.id} xs={12} sm={6} md={4}>
            <Paper sx={{ padding: 2 }}>
              <Typography variant="h6">{product.name}</Typography>
              <Typography variant="body1">{product.description}</Typography>
              <Typography variant="body2">Stock: {product.quantity}</Typography>
              {product.imageUrl && (
                <Box sx={{ marginTop: 2 }}>
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
                  />
                </Box>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  // Modo lista
  return (
    <List>
      {products.map((product) => (
        <ListItem key={product.id} sx={{ borderBottom: '1px solid #eee' }}>
          <ListItemText
            primary={product.name}
            secondary={
              <> {/* Usa un Fragment en lugar de anidar Typography */}
                <Typography variant="body2" component="div"> {/* Cambia el componente raíz a "div" */}
                  {product.description}
                </Typography>
                <Typography variant="body2" component="div"> {/* Cambia el componente raíz a "div" */}
                  Stock: {product.quantity}
                </Typography>
                {product.imageUrl && (
                  <Box sx={{ marginTop: 1 }}>
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      style={{ width: '100px', height: 'auto', borderRadius: '4px' }}
                    />
                  </Box>
                )}
              </>
            }
          />
        </ListItem>
      ))}
    </List>
  );
};

export default ProductGrid;