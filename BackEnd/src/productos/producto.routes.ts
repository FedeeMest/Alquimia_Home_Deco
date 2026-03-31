import { Router } from 'express';
import { findAll, findOne, add, update, remove, inputS, restaurar, fixPrecios, actualizarGananciasMasivo, vaciarCamion, ventaFeria, updateStockRapido,findByBarcode, getPublicCatalog } from './producto.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const productoRouter = Router();

productoRouter.get('/public/catalogo', getPublicCatalog);

productoRouter.use(authMiddleware);

productoRouter.get('/', findAll);           // Obtener todos (con paginación)
productoRouter.post('/vaciar-camion', vaciarCamion);
productoRouter.post('/venta-feria', ventaFeria);
productoRouter.patch('/:id/stock', updateStockRapido);
productoRouter.get('/:id', findOne);        // Obtener uno
productoRouter.get('/codigo/:codigo', findByBarcode); // Obtener por código de barra
productoRouter.post('/', inputS, add); 
productoRouter.put('/actualizar-ganancias-masivo', actualizarGananciasMasivo);     // Crear (Pasa por sanitización)
productoRouter.put('/:id', inputS, update); // Editar (Pasa por sanitización)
productoRouter.delete('/:id', remove);      // Borrar
productoRouter.patch('/:id/restaurar', restaurar);        // Restaurar producto eliminado
productoRouter.post('/fix-precios', fixPrecios);
