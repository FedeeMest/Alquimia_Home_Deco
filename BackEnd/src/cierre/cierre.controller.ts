import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { CierreCaja } from './cierre.entity.js';
import { Venta } from '../ventas/venta.entity.js';

async function previsualizarHoy(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const hoyInicio = new Date();
        hoyInicio.setHours(0, 0, 0, 0);
        const hoyFin = new Date();
        hoyFin.setHours(23, 59, 59, 999);

        // Buscamos ventas COBRADAS de hoy
        const ventas = await em.find(Venta, {
            fecha: { $gte: hoyInicio, $lte: hoyFin },
            estado: 'COBRADA'
        });

        // Calculamos totales teóricos
        let efectivo = 0;
        let tarjeta = 0;
        let otros = 0;

        for (const v of ventas) {
            const total = Number(v.total);
            if (v.metodo_pago === 'EFECTIVO') efectivo += total;
            else if (v.metodo_pago.includes('TARJETA')) tarjeta += total;
            else otros += total;
        }

        return res.json({
            fecha: new Date(),
            sistema_efectivo: efectivo,
            sistema_tarjeta: tarjeta,
            sistema_otros: otros,
            cantidad_ventas: ventas.length
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al calcular totales' });
    }
}

async function cerrarCaja(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const body = req.body;
        
        const cierre = new CierreCaja();
        cierre.usuario_responsable = body.usuario || 'Admin'; // O req.user.nombre
        cierre.sistema_efectivo = body.sistema_efectivo;
        cierre.sistema_tarjeta = body.sistema_tarjeta;
        cierre.sistema_otros = body.sistema_otros;
        
        cierre.real_efectivo = body.real_efectivo;
        cierre.real_tarjeta = body.real_tarjeta || 0; // Opcional
        
        // Calculamos diferencia (solo sobre efectivo suele ser lo crítico)
        cierre.diferencia = Number(cierre.real_efectivo) - Number(cierre.sistema_efectivo);
        
        cierre.observaciones = body.observaciones;

        await em.persistAndFlush(cierre);

        return res.status(201).json({ message: 'Caja cerrada exitosamente', id: cierre.id });
    } catch (error) {
        return res.status(500).json({ message: 'Error al cerrar caja' });
    }
    
}

async function obtenerHistorial(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const cierres = await em.find(CierreCaja, {}, {
            orderBy: { fecha_cierre: 'DESC' }, // Ordenar: Más nuevos primero
            limit: 50 // Traer los últimos 50 para que sea rápido
        });
        return res.json(cierres);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener historial' });
    }
}

export { previsualizarHoy, cerrarCaja, obtenerHistorial };