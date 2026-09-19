import { Router } from 'express';
import { registrar, topProductosVistos } from './evento.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const eventoRouter = Router();

// Pública: el catálogo público la llama sin estar logueado
eventoRouter.post('/registrar', registrar);

// Protegida: solo el panel de admin puede ver las estadísticas
eventoRouter.get('/top-productos', authMiddleware, topProductosVistos);