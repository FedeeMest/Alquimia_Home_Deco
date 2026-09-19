import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login } from './auth.controller.js';

export const authRouter = Router();

// Freno anti fuerza-bruta: máximo 10 intentos de login cada 15 min por IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' }
});

authRouter.post('/login', loginLimiter, login);