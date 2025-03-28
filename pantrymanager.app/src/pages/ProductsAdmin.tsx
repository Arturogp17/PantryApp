import React, { useEffect, useState } from 'react';
import { Button, Grid, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Dialog, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { Delete, Edit, Add } from '@mui/icons-material';
import api from '../api/client';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ProductsAdmin = () => {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({
    name: '',
    description: '',
    quantity: 0,
    imageUrl: ''
  });

  // Cargar productos al montar el componente
  useEffect(() => {
    if (isAdmin) {
      loadProducts();
    }
  }, [isAdmin]);

  const loadProducts = async () => {
    try {
      const response = await api.get('/products'); // Asegúrate de que la URL sea correcta
      setProducts(response.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const handleOpenCreate = () => {
    setCurrentProduct({
      name: '',
      description: '',
      quantity: 0,
      imageUrl: ''
    });
    setEditMode(false);
    setOpenDialog(true);
  };

  const handleOpenEdit = (product: Product) => {
    setCurrentProduct(product);
    setEditMode(true);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSubmit = async () => {
    if (!currentProduct.name || !currentProduct.description || currentProduct.quantity === undefined) {
      alert('Por favor, completa todos los campos obligatorios.');
      return;
    }

    try {
      if (editMode) {
        await api.put(`/products/${currentProduct.id}`, currentProduct); // Actualizar producto
      } else {
        await api.post('/products', currentProduct); // Crear producto
      }
      loadProducts();
      handleCloseDialog();
      alert(editMode ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');
    } catch (error) {
      console.error('Error guardando producto:', error);
      alert('Error al guardar el producto. Por favor, inténtalo de nuevo.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/products/${id}`); // Eliminar producto
      loadProducts();
    } catch (error) {
      console.error('Error eliminando producto:', error);
    }
  };

  if (!isAdmin) return <div>Acceso no autorizado</div>;

  return (
    <Grid container spacing={3} padding={4}>
      <Grid item xs={12}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Add />}
          onClick={handleOpenCreate}
        >
          Nuevo Producto
        </Button>
      </Grid>

      <Grid item xs={12}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>Imagen</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.description}</TableCell>
                  <TableCell>{product.quantity}</TableCell>
                  <TableCell>
                    {product.imageUrl && (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        style={{ width: 50, height: 50, objectFit: 'cover' }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleOpenEdit(product)}>
                      <Edit color="primary" />
                    </IconButton>
                    <IconButton onClick={() => product.id && handleDelete(product.id)}>
                      <Delete color="error" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Grid>

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {editMode ? 'Editar Producto' : 'Nuevo Producto'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} padding={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nombre"
                value={currentProduct.name}
                onChange={(e) => setCurrentProduct({...currentProduct, name: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descripción"
                multiline
                rows={3}
                value={currentProduct.description}
                onChange={(e) => setCurrentProduct({...currentProduct, description: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Stock"
                type="number"
                value={currentProduct.quantity}
                onChange={(e) => setCurrentProduct({...currentProduct, quantity: Number(e.target.value)})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="URL de la imagen"
                value={currentProduct.imageUrl}
                onChange={(e) => setCurrentProduct({...currentProduct, imageUrl: e.target.value})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {editMode ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
};

export default ProductsAdmin;