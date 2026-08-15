import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Cliente } from './cliente.entity.js';

export const findAll = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();

        // 1. Extraemos los parámetros que envía el frontend
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const search = req.query.search as string || '';
        const tipo = req.query.tipo as string || '';
        const orden = req.query.orden as string || 'nombre_asc';

        // 2. Armamos la consulta base (asumiendo que tenés la columna 'activo')
        const where: any = { activo: true };

        // 3. Si hay un término de búsqueda, lo aplicamos a varios campos
        if (search) {
            where.$or = [
                // CAMBIAMOS $ilike POR $like PARA MYSQL
                { nombre: { $like: `%${search}%` } },
                { cuit: { $like: `%${search}%` } },
                { telefono: { $like: `%${search}%` } },
                { email: { $like: `%${search}%` } }
            ];
        }
        // Filtro exacto por Tipo
        if (tipo) {
            where.tipo = tipo;
        }

        // Lógica de Ordenamiento
        let orderBy: any = { nombre: 'ASC' };
        if (orden === 'nombre_desc') orderBy = { nombre: 'DESC' };
        if (orden === 'recientes') orderBy = { id: 'DESC' };

        // 4. Usamos findAndCount para obtener los clientes paginados y el total real
        const [clientes, totalItems] = await em.findAndCount(Cliente, where, {
            orderBy: { nombre: 'ASC' },
            limit: limit,
            offset: (page - 1) * limit
        });

        // 5. Devolvemos la data + la metadata exacta que espera el frontend
        res.status(200).json({ 
            data: clientes,
            meta: {
                total: totalItems,
                page: page,
                limit: limit,
                totalPages: Math.ceil(totalItems / limit) || 1
            }
        });
    } catch (error: any) {
        console.error(error);
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
        const nombre = (req.body.nombre || '').trim();

        if (!nombre) {
            return res.status(400).json({ message: 'El nombre es obligatorio' });
        }

        const existente = await em.findOne(Cliente, {
            activo: true,
            nombre: { $like: nombre }
        });

        if (existente) {
            return res.status(409).json({ message: `Ya existe un cliente registrado con el nombre "${nombre}"` });
        }

        const cliente = em.create(Cliente, { ...req.body, nombre });
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

// NUEVO: Función para eliminar (Soft Delete)
export const remove = async (req: Request, res: Response) => {
    try {
        const em = orm.em.fork();
        const cliente = await em.findOneOrFail(Cliente, { id: Number(req.params.id) });
        
        // Hacemos Soft Delete (cambiamos a activo: false). 
        // Si querés borrarlo definitivo, cambiá la línea de abajo por: await em.removeAndFlush(cliente);
        cliente.activo = false; 
        await em.flush();
        
        res.status(200).json({ message: 'Cliente eliminado con éxito' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error al eliminar el cliente' });
    }
};
// import { Request, Response } from 'express';
// import { orm } from '../shared/db/orm.js';
// import { Cliente } from './cliente.entity.js';

// export const findAll = async (req: Request, res: Response) => {
//     try {
//         const em = orm.em.fork();
//         // Traemos todos los clientes activos ordenados alfabéticamente
//         const clientes = await em.find(Cliente, { activo: true }, { orderBy: { nombre: 'ASC' } });
//         res.status(200).json({ data: clientes });
//     } catch (error: any) {
//         res.status(500).json({ message: error.message });
//     }
// };

// export const findOne = async (req: Request, res: Response) => {
//     try {
//         const em = orm.em.fork();
//         const cliente = await em.findOneOrFail(Cliente, { id: Number(req.params.id) });
//         res.status(200).json({ data: cliente });
//     } catch (error: any) {
//         res.status(404).json({ message: 'Cliente no encontrado' });
//     }
// };

// export const create = async (req: Request, res: Response) => {
//     try {
//         const em = orm.em.fork();
//         const cliente = em.create(Cliente, req.body);
//         await em.flush();
//         res.status(201).json({ message: 'Cliente creado con éxito', data: cliente });
//     } catch (error: any) {
//         res.status(500).json({ message: error.message });
//     }
// };

// export const update = async (req: Request, res: Response) => {
//     try {
//         const em = orm.em.fork();
//         const cliente = await em.findOneOrFail(Cliente, { id: Number(req.params.id) });
//         em.assign(cliente, req.body);
//         await em.flush();
//         res.status(200).json({ message: 'Cliente actualizado', data: cliente });
//     } catch (error: any) {
//         res.status(500).json({ message: error.message });
//     }
// };