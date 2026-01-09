import { Router } from 'express';
import {previsualizarHoy, cerrarCaja } from './cierre.controller.js'
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const cierreRouter = Router();

cierreRouter.use(authMiddleware);

cierreRouter.get('/previsualizar', previsualizarHoy); // Para ver los totales antes de cerrar
cierreRouter.post('/cerrar', cerrarCaja);