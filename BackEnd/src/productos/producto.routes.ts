import { Router } from 'express';
import { findAll, findOne, add, update, remove, inputS, restaurar, fixPrecios, actualizarGananciasMasivo } from './producto.controller.js';

export const productoRouter = Router();

productoRouter.get('/', findAll);           // Obtener todos (con paginación)
productoRouter.get('/:id', findOne);        // Obtener uno
productoRouter.post('/', inputS, add);      // Crear (Pasa por sanitización)
productoRouter.put('/:id', inputS, update); // Editar (Pasa por sanitización)
productoRouter.delete('/:id', remove);      // Borrar
productoRouter.patch('/:id/restaurar', restaurar);        // Restaurar producto eliminado
productoRouter.post('/fix-precios', fixPrecios);
productoRouter.post('/actualizar-ganancias-masivo', actualizarGananciasMasivo);