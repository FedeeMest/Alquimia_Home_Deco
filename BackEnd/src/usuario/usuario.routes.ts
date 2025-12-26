import { Router } from 'express';
import { 
    getAll, 
    getOne, 
    add, 
    update, 
    remove, 
    sanitizeUsuarioInput 
} from './usuario.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';

export const usuarioRouter = Router();

usuarioRouter.use(authMiddleware);

// GET /api/usuarios -> Listar todos
usuarioRouter.get('/', getAll);

// GET /api/usuarios/:id -> Ver uno
usuarioRouter.get('/:id', getOne);

// POST /api/usuarios -> Crear (Usamos el sanitizer)
usuarioRouter.post('/', sanitizeUsuarioInput, add);

// PUT /api/usuarios/:id -> Editar
usuarioRouter.put('/:id', sanitizeUsuarioInput, update);

// DELETE /api/usuarios/:id -> Borrar
usuarioRouter.delete('/:id', remove);