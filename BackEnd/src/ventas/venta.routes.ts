import { Router } from 'express';
import { crearVenta, obtenerVentas, getMetricasDelDia, findOne, anularVenta, inputS, marcarPagada, update, getEstadisticas } from './venta.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const ventaRouter = Router();

ventaRouter.use(authMiddleware);

ventaRouter.get('/estadisticas', getEstadisticas);
ventaRouter.post('/', inputS, crearVenta);                 // Nueva venta
ventaRouter.get('/', obtenerVentas);               // Historial completo paginado
ventaRouter.get('/dashboard', getMetricasDelDia);
ventaRouter.put('/:id', update);                    // Actualizar venta
ventaRouter.get('/:id', findOne);                     // Detalle de una venta  // Filtros para contabilidad
ventaRouter.delete('/:id', anularVenta);           // Anular y devolver stock
ventaRouter.patch('/:id/cobrar', marcarPagada);


// Nota: No hay ruta para eliminar ventas, solo anularlas (por cuestiones legales)