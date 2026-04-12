import { Router } from 'express';
import { findAll, findOne, create, update, remove } from './cliente.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const clienteRouter = Router();

clienteRouter.use(authMiddleware);

// Todas las rutas protegidas para que solo el admin pueda manejarlas
clienteRouter.get('/', findAll);
clienteRouter.get('/:id', findOne);
clienteRouter.post('/', create);
clienteRouter.put('/:id', update);
clienteRouter.delete('/:id', remove);