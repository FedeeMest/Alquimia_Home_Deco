import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Producto } from '../productos/producto.entity.js';
import { EventoProducto } from './Evento.entity.js';

const TIPOS_VALIDOS = ['vista', 'carrito', 'whatsapp'];

// PÚBLICO: lo llama el catálogo público (sin login) cada vez que alguien
// ve un producto, lo agrega al carrito, o consulta por WhatsApp.
async function registrar(req: Request, res: Response) {
    try {
        const { productoId, tipo } = req.body;

        if (!productoId || !TIPOS_VALIDOS.includes(tipo)) {
            return res.status(400).json({ message: 'Datos inválidos' });
        }

        const em = orm.em.fork();
        const producto = await em.findOne(Producto, { id: Number(productoId) });

        if (!producto) {
            // No es un error grave para el visitante: simplemente no registramos nada
            return res.status(200).json({ message: 'ignorado' });
        }

        const evento = em.create(EventoProducto, { producto, tipo, fecha: new Date() });
        await em.persistAndFlush(evento);

        return res.status(201).json({ message: 'ok' });
    } catch (error: any) {
        // El tracking NUNCA debe romper la experiencia de compra del cliente
        console.error('Error registrando evento:', error);
        return res.status(200).json({ message: 'ignorado' });
    }
}

// PROTEGIDO: para el panel de Estadísticas del admin
async function topProductosVistos(req: Request, res: Response) {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const tipo = (req.query.tipo as string) || 'vista';

        if (!TIPOS_VALIDOS.includes(tipo)) {
            return res.status(400).json({ message: 'Tipo inválido' });
        }

        const em = orm.em.fork();
        const eventos = await em.find(EventoProducto, { tipo }, { populate: ['producto'] });

        const acumulado = new Map<number, { nombre: string; categoria: string | null; cantidad: number }>();

        for (const e of eventos) {
            // Puede haber eventos huérfanos si el producto fue borrado después
            if (!e.producto) continue;

            const id = e.producto.id;
            const actual = acumulado.get(id) || {
                nombre: e.producto.nombre,
                categoria: e.producto.categoria || null,
                cantidad: 0
            };
            actual.cantidad += 1;
            acumulado.set(id, actual);
        }

        const data = Array.from(acumulado.values())
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, limit);

        return res.status(200).json({ tipo, data });
    } catch (error: any) {
        console.error('Error calculando productos más vistos:', error);
        return res.status(500).json({ message: error.message });
    }
}

export { registrar, topProductosVistos };