import { Request, Response, NextFunction } from 'express';
import { orm } from '../shared/db/orm.js';
import { Producto } from './producto.entity.js';
import { FilterQuery } from '@mikro-orm/core';


function inputS(req: Request, res: Response, next: NextFunction) {

    req.body.inputS = {
        // --- Identificación ---
        codigo_barra: req.body.codigo_barra || req.body.codigo, 
        nombre: req.body.nombre,
        proveedor: req.body.proveedor,
        categoria: req.body.categoria,

        // --- Inventario ---
        stock: req.body.stock,
        stock_minimo: req.body.stock_minimo, // ¡Nuevo!
        
        // Aceptamos los datos crudos para el cálculo
        precio_compra: req.body.precio_compra,
        tiene_iva: req.body.tiene_iva,

        // --- Base Económica ---
        precio_costo: req.body.precio_costo, 
        ganancia: req.body.ganancia,

        // --- Configuración de Ajustes (Para controlar los descuentos/recargos) ---
        // Efectivo
        ajuste_efectivo_tipo: req.body.ajuste_efectivo_tipo,
        ajuste_efectivo_valor: req.body.ajuste_efectivo_valor, 

        // Tarjeta
        ajuste_tarjeta_tipo: req.body.ajuste_tarjeta_tipo,
        ajuste_tarjeta_valor: req.body.ajuste_tarjeta_valor,

        // Tarjeta Local
        ajuste_tarjeta_local_tipo: req.body.ajuste_tarjeta_local_tipo,
        ajuste_tarjeta_local_valor: req.body.ajuste_tarjeta_local_valor,
    };

    // Eliminar campos no definidos (undefined) para no sobreescribir con nulls accidentalmente
    Object.keys(req.body.inputS).forEach((key) => {
        if (req.body.inputS[key] === undefined) {
            delete req.body.inputS[key];
        }
    });

    // Pasar al siguiente middleware (el controlador)
    next();
}

async function findAll(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const buscar = req.query.buscar as string || '';
        
        // NUEVO: Leemos si el frontend quiere ver activos o inactivos
        // Si no envía nada, por defecto mostramos los activos (true)
        const mostrarActivos = req.query.activo !== 'false'; 

        const offset = (page - 1) * limit;

        // Filtramos por el estado que nos pidan
        const filtros: FilterQuery<Producto> = { 
            activo: mostrarActivos 
        };

        if (buscar) {
            filtros.$or = [
                { nombre: { $like: `%${buscar}%` } },
                { codigo_barra: { $like: `%${buscar}%` } },
                { proveedor: { $like: `%${buscar}%` } }
            ];
        }

        const [productos, totalRegistros] = await em.findAndCount(Producto, filtros, {
            limit: limit,
            offset: offset,
            orderBy: { nombre: 'ASC' }
        });

        return res.status(200).json({
            data: productos,
            total: totalRegistros,
            page: page,
            totalPages: Math.ceil(totalRegistros / limit)
        });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error interno' });
    }
}

async function findOne(req: Request, res: Response) {
    const em = orm.em.fork(); // Crear un EntityManager para la consulta
    const id = parseInt(req.params.id); // Obtener el ID del producto desde los parámetros
    try {
        // Buscar el producto en la base de datos
        const producto = await em.findOne(Producto, { id });
        if (!producto) {
            // Si no se encuentra, devolver un error 404
            return res.status(404).json({ mensaje: 'Producto no encontrado' });
        }
        return res.status(200).json(producto); // Devolver el producto encontrado
    } catch (error) {
        console.error('Error al buscar el producto:', error); // Loguear el error
        return res.status(500).json({ Error: 'Error al buscar el producto.' }); // Devolver un error 500
    }
}

async function add(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const datos = req.body.inputS;

        const nuevoProducto = em.create(Producto, datos);
        await em.flush();

        return res.status(201).json({ 
            message: 'Producto creado con éxito', 
            data: nuevoProducto 
        });

    } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ya existe un producto con ese código de barras o nombre.' });
        }
        console.error('Error al crear producto:', error);
        return res.status(500).json({ message: error.message });
    }
}

async function update(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);
        const producto = await em.findOne(Producto, { id });

        if (!producto) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const datos = req.body.inputS;

        em.assign(producto, datos);
        await em.flush();

        return res.status(200).json({ 
            message: 'Producto actualizado correctamente', 
            data: producto 
        });

    } catch (error: any) {
        console.error('Error al actualizar producto:', error);
        return res.status(500).json({ message: 'Error interno al actualizar' });
    }
}

async function remove(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);

        // 1. Verificar si existe antes de intentar borrar
        const producto = await em.findOne(Producto, { id });

        if (!producto) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // 2. Marcar para borrar y ejecutar
        producto.activo = false;
        await em.flush();

        return res.status(200).json({ message: 'Producto eliminado correctamente' });

    } catch (error: any) {
        console.error('Error al eliminar producto:', error);
        return res.status(500).json({ message: 'Error interno al eliminar el producto' });
    }
}

async function restaurar(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);
        const producto = await em.findOne(Producto, { id });

        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' });

        producto.activo = true; // ¡Lo revivimos!
        await em.flush();

        return res.status(200).json({ message: 'Producto restaurado exitosamente' });
    } catch (error) {
        return res.status(500).json({ message: 'Error al restaurar producto' });
    }
}

async function fixPrecios(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        // CAMBIO AQUÍ: Filtramos para traer solo los que tienen precio base en 0
        const productos = await em.find(Producto, { 
            precio_venta_base: 0 
        });
        
        // Si no hay nada que arreglar, avisamos rápido
        if (productos.length === 0) {
            return res.json({ message: 'No se encontraron productos con precio $0 para actualizar.' });
        }

        console.log(`⏳ Encontrados ${productos.length} productos sin precio. Calculando...`);

        let contador = 0;
        for (const prod of productos) {
            await prod.calcularPrecios(); 
            contador++;
        }

        await em.flush();

        console.log('✅ ¡Recálculo terminado!');
        return res.json({ 
            message: 'Proceso completado', 
            productos_actualizados: contador 
        });

    } catch (error: any) {
        console.error('Error al recalcular:', error);
        return res.status(500).json({ error: error.message });
    }
}

export { inputS, findAll, findOne, add, update, remove, restaurar, fixPrecios};