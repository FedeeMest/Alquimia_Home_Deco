import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
    throw new Error('❌ FATAL ERROR: JWT_SECRET no está definido en las variables de entorno.');
}

// Extendemos la interfaz Request para que TS no se queje si queremos guardar el usuario ahí
export interface AuthRequest extends Request {
    user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Obtener el header "Authorization"
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Acceso denegado: No se proporcionó token' });
    }

    // 2. El formato debe ser "Bearer <token>"
    const token = authHeader.split(' ')[1]; // Tomamos la parte después de "Bearer"

    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado: Formato de token inválido' });
    }

    try {
        // 3. Verificar el token
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; // Guardamos los datos del usuario en la request por si los necesitas luego
        next(); // ¡Todo bien! Pasa a la siguiente función (el controlador)
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido o expirado' });
    }
};