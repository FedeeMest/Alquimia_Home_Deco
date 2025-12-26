import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Usuario } from '../usuario/usuario.entity.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

async function login(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const { username, password } = req.body;
        
        // --- LOG 1: Ver qué llega del frontend --- 

        // 🔒 SEGURIDAD: Validación estricta
        // Si no existe la variable en el servidor, detenemos todo.
        if (!process.env.JWT_SECRET) {
            console.error('FATAL ERROR: La variable de entorno JWT_SECRET no está configurada.');
            return res.status(500).json({ message: 'Error interno de configuración de seguridad.' });
        }

        // 1. Buscar usuario
        const usuario = await em.findOne(Usuario, { username });
        
        if (!usuario) {
            console.log('❌ Error: Usuario NO encontrado en la BD');
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        console.log('✅ Usuario encontrado:', usuario.username);

        // 2. Verificar contraseña
        const isMatch = await bcrypt.compare(password, usuario.password);
        
        if (!isMatch) {
            console.log('❌ Error: La contraseña no coincide');
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        // 3. Generar Token
        // TypeScript ya sabe que process.env.JWT_SECRET es un string seguro gracias al if de arriba
        const token = jwt.sign(
            { id: usuario.id, username: usuario.username },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        return res.json({ 
            message: 'Login exitoso', 
            token, 
            usuario: { nombre: usuario.nombre_completo } 
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error en el servidor' });
    }
}

export { login };