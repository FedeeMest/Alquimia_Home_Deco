import { Router } from 'express';
import { crearVenta, obtenerVentas, getMetricasDelDia, findOne, anularVenta, inputS, marcarPagada } from './venta.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const ventaRouter = Router();

ventaRouter.use(authMiddleware);

ventaRouter.post('/', inputS, crearVenta);                 // Nueva venta
ventaRouter.get('/', obtenerVentas);               // Historial completo paginado
ventaRouter.get('/dashboard', getMetricasDelDia);  // Métricas del día
ventaRouter.get('/:id', findOne);                     // Detalle de una venta  // Filtros para contabilidad
ventaRouter.delete('/:id', anularVenta);           // Anular y devolver stock
ventaRouter.patch('/:id/cobrar', marcarPagada);

