import React, { useEffect, useState } from 'react';
import { Typography, Button, Box } from '@mui/material';
import ProductGrid from '../components/Products/ProductGrid';
import api from '../api/client';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { isAuthenticated } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (isAuthenticated) {
      loadProducts();
    }
  }, [isAuthenticated]);

  const loadProducts = async () => {
    try {
      const response = await api.get('/products'); // URL corregida
      console.log('Respuesta de la API:', response.data); // Depuración
      setProducts(response.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  };

  if (!isAuthenticated) return <div>Acceso no autorizado</div>;

  return (
    <Box sx={{ padding: 5 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={toggleViewMode}
        sx={{ marginBottom: 3 }}
      >
        Cambiar a {viewMode === 'grid' ? 'Lista' : 'Mosaico'}
      </Button>
      <ProductGrid products={products} mode={viewMode} />
    </Box>
  );
};

export default Dashboard;