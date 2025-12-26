import { Router } from 'express';
import { obtener, guardar, aplicarMasivo } from './configuracion.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const configuracionRouter = Router();

configuracionRouter.use(authMiddleware);

configuracionRouter.get('/', obtener);
configuracionRouter.put('/', guardar);
configuracionRouter.post('/aplicar-todos', aplicarMasivo);