import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Cliente } from './cliente.entity.js';

export const findAll = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();
        // Traemos todos los clientes activos ordenados alfabéticamente
        const clientes = await em.find(Cliente, { activo: true }, { orderBy: { nombre: 'ASC' } });
        res.status(200).json({ data: clientes });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const findOne = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();
        const cliente = await em.findOneOrFail(Cliente, { id: Number(req.params.id) });
        res.status(200).json({ data: cliente });
    } catch (error: any) {
        res.status(404).json({ message: 'Cliente no encontrado' });
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();
        const cliente = em.create(Cliente, req.body);
        await em.flush();
        res.status(201).json({ message: 'Cliente creado con éxito', data: cliente });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();
        const cliente = await em.findOneOrFail(Cliente, { id: Number(req.params.id) });
        em.assign(cliente, req.body);
        await em.flush();
        res.status(200).json({ message: 'Cliente actualizado', data: cliente });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};