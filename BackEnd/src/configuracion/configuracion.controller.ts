import { Request, Response } from 'express';
import { orm } from '../shared/db/orm.js';
import { Configuracion } from './configuracion.entity.js';
import { Producto } from '../productos/producto.entity.js';

const em = orm.em;

async function obtener(req: Request, res: Response) {
    try {
        const emFork = em.fork();
        let config = await emFork.findOne(Configuracion, { id: 1 });

        // Si es la primera vez que se ejecuta el sistema, creamos la config inicial
        if (!config) {
            config = emFork.create(Configuracion, {
                id: 1,
                porcentaje_efectivo: 10, // Valor inicial por defecto
                porcentaje_tarjeta: 15,
                porcentaje_local: 6
            });
            await emFork.persistAndFlush(config);
        }
        return res.json(config);
    } catch (error) {
        return res.status(500).json({ message: 'Error al obtener configuración' });
    }
}

async function guardar(req: Request, res: Response) {
    try {
        const emFork = em.fork();
        const config = await emFork.findOneOrFail(Configuracion, { id: 1 });
        
        // Actualizamos los valores
        emFork.assign(config, req.body);
        await emFork.flush();
        
        return res.json({ message: 'Configuración guardada', data: config });
    } catch (error) {
        return res.status(500).json({ message: 'Error al guardar configuración' });
    }
}

// Lógica crítica: Actualizar productos existentes y RECALCULAR precios
async function aplicarMasivo(req: Request, res: Response) {
    try {
        const emFork = em.fork();
        const config = await emFork.findOne(Configuracion, { id: 1 });
        if (!config) return res.status(404).json({ message: 'No hay configuración' });

        const productos = await emFork.find(Producto, {}); 

        let contador = 0;
        for (const p of productos) {
            // Sobreescribimos con los valores globales
            p.ajuste_efectivo_valor = config.porcentaje_efectivo;
            p.ajuste_tarjeta_valor = config.porcentaje_tarjeta;
            p.ajuste_tarjeta_local_valor = config.porcentaje_local;
            
            // Forzamos el recálculo matemático
            await p.calcularPrecios(); 
            contador++;
        }

        await emFork.flush();
        return res.json({ message: `Se actualizaron y recalcularon ${contador} productos.` });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error en actualización masiva' });
    }
}

export { obtener, guardar, aplicarMasivo };