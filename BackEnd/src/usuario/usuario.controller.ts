import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Usuario } from './usuario.entity.js';
import bcrypt from 'bcrypt';

async function getAll(req: Request, res: Response) {
    try {
        const em = orm.em.fork();
        const usuarios = await em.find(Usuario, {});
        // Importante: No devolvemos la contraseña
        const usuariosSinPass = usuarios.map(u => ({
            id: u.id,
            username: u.username,
            nombre_completo: u.nombre_completo,
            fecha_creacion: u.fecha_creacion
        }));
        res.status(200).json(usuariosSinPass);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function getOne(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const em = orm.em.fork();
        const usuario = await em.findOne(Usuario, { id });
        
        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.status(200).json({
            id: usuario.id,
            username: usuario.username,
            nombre_completo: usuario.nombre_completo
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function add(req: Request, res: Response) {
    try {
        const em = orm.em.fork();
        const { username, password, nombre_completo } = req.body;

        const existe = await em.findOne(Usuario, { username });
        if (existe) {
            return res.status(400).json({ message: 'El nombre de usuario ya existe' });
        }

        const nuevoUsuario = em.create(Usuario, {
            username,
            password: await bcrypt.hash(password, 10), // Encriptamos la clave
            nombre_completo
        });

        await em.persistAndFlush(nuevoUsuario);

        res.status(201).json({ message: 'Usuario creado exitosamente', id: nuevoUsuario.id });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function update(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const em = orm.em.fork();
        const usuario = await em.findOne(Usuario, { id });

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        req.body.sanitizedInput.id = id;
        const usuarioToUpdate = req.body.sanitizedInput;

        // Si viene password nueva, la encriptamos. Si no, la dejamos igual.
        if (usuarioToUpdate.password) {
            usuarioToUpdate.password = await bcrypt.hash(usuarioToUpdate.password, 10);
        } else {
            delete usuarioToUpdate.password; // Evitamos sobreescribir con undefined
        }

        em.assign(usuario, usuarioToUpdate);
        await em.flush();

        res.status(200).json({ message: 'Usuario actualizado' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

async function remove(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const em = orm.em.fork();
        const usuario = await em.findOne(Usuario, { id });

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        await em.removeAndFlush(usuario);
        res.status(200).json({ message: 'Usuario eliminado' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

// Middleware para filtrar datos antes de guardar/editar
function sanitizeUsuarioInput(req: Request, res: Response, next: Function) {
    req.body.sanitizedInput = {
        username: req.body.username,
        password: req.body.password,
        nombre_completo: req.body.nombre_completo,
    };

    Object.keys(req.body.sanitizedInput).forEach((key) => {
        if (req.body.sanitizedInput[key] === undefined) {
            delete req.body.sanitizedInput[key];
        }
    });
    next();
}

export { getAll, getOne, add, update, remove, sanitizeUsuarioInput };