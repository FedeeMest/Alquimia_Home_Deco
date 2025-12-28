import { Request, Response, NextFunction } from 'express';
import { orm } from '../shared/db/orm.js';
import { Venta } from './venta.entity.js';
import { DetalleVenta } from '../detalle_venta/detalle.entity.js';
import { Producto } from '../productos/producto.entity.js'; // Ajusta ruta

function inputS(req: Request, res: Response, next: NextFunction) {
    req.body.inputS = {
        // --- Datos Críticos de la Venta ---
        items: req.body.items,           // El array de productos [{id, cantidad}]
        metodo_pago: req.body.metodo_pago, // 'EFECTIVO', 'TARJETA', etc.

        // --- Datos del Cliente (Opcionales) ---
        cliente_nombre: req.body.cliente_nombre,
        cliente_cuit: req.body.cliente_cuit,
        cliente_direccion: req.body.cliente_direccion,

        // --- Auditoría y Vendedor ---
        usuario_vendedor: req.body.usuario_vendedor,

        // --- Datos Fiscales / Internos ---
        tipo_comprobante: req.body.tipo_comprobante, // Ej: 'TICKET_X'
        numero_comprobante: req.body.numero_comprobante,

        // --- Detalles Financieros Extra ---
        monto_descuento_recargo: req.body.monto_descuento_recargo,
        cuotas: req.body.cuotas,

        estado: req.body.estado
    };

    // Eliminar campos no definidos (limpieza)
    Object.keys(req.body.inputS).forEach((key) => {
        if (req.body.inputS[key] === undefined) {
            delete req.body.inputS[key];
        }
    });

    next();
}

async function findOne(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);
        const venta = await em.findOne(Venta, { id }, { 
            populate: ['detalles', 'detalles.producto'] // Fundamental traer los nombres de productos
        });

        if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });

        return res.status(200).json(venta);
    } catch (error) {
        return res.status(500).json({ message: 'Error al buscar venta' });
    }
}

async function marcarPagada(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);
        const venta = await em.findOne(Venta, { id });

        if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });

        if (venta.estado !== 'PENDIENTE') {
            return res.status(400).json({ message: 'Solo se pueden cobrar ventas pendientes' });
        }

        // CAMBIO DE ESTADO
        venta.estado = 'COBRADA';
        
        await em.flush();
        
        return res.status(200).json({ message: 'Venta marcada como COBRADA exitosamente' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al actualizar venta' });
    }
}


async function crearVenta(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const datos = req.body.inputS; 
        // 'items' es un array: [{ id_producto: 1, cantidad: 2 }, ...]

        if (!datos.items || datos.items.length === 0) {
            return res.status(400).json({ message: 'El carrito no puede estar vacío' });
        }

        const nuevaVenta = new Venta();
        nuevaVenta.estado = datos.estado || 'COBRADA';
        nuevaVenta.metodo_pago = datos.metodo_pago;
        nuevaVenta.cliente_nombre = datos.cliente_nombre;
        nuevaVenta.cliente_cuit = datos.cliente_cuit;
        nuevaVenta.usuario_vendedor = datos.usuario_vendedor;
        
        let totalVenta = 0;

        // Iteramos sobre los productos del carrito
        for (const item of datos.items) {
            // 1. Buscamos el producto real en la BD
            const producto = await em.findOneOrFail(Producto, { id: item.id_producto });

            // 2. VALIDACIÓN DE STOCK
            if (producto.stock < item.cantidad) {
                return res.status(400).json({ 
                    message: `No hay suficiente stock de ${producto.nombre}. Stock actual: ${producto.stock}` 
                });
            }

            // 3. Crear el detalle (Renglón)
            const detalle = new DetalleVenta();
            detalle.producto = producto;
            detalle.cantidad = item.cantidad;
            
            // 4. Determinamos el precio según el método de pago
            // Usamos la lógica que ya creaste en tu entidad Producto
            let precioFinal = 0;
            if (datos.metodo_pago === 'EFECTIVO') precioFinal = producto.precio_efectivo;
            else if (datos.metodo_pago === 'TARJETA') precioFinal = producto.precio_tarjeta;
            else precioFinal = producto.precio_tarjeta_local; // Ejemplo

            detalle.precio_unitario_historico = precioFinal;
            detalle.subtotal = precioFinal * item.cantidad;

            // 5. Agregar a la venta y sumar al total
            nuevaVenta.detalles.add(detalle);
            totalVenta += detalle.subtotal;

            // 6. DESCONTAR STOCK (Fundamental)
            producto.stock -= item.cantidad;
        }

        nuevaVenta.total = totalVenta;

        // Guardamos todo junto (Venta, Detalles y Actualización de Stock)
        // Gracias a MikroORM, esto se hace en una sola transacción segura.
        await em.persistAndFlush([nuevaVenta]);

        return res.status(201).json({ message: 'Venta registrada', id: nuevaVenta.id });

    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ message: 'Error al procesar la venta' });
    }
}

// Para ver el historial (Auditoría)
async function obtenerVentas(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        // 1. Recogemos los parámetros de Paginación y Filtros
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10; // 10 ventas por página
        const estado = req.query.estado as string; // 'COBRADA', 'PENDIENTE', etc.
        const desde = req.query.desde as string;
        const hasta = req.query.hasta as string;

        console.log('--- DEBUG BACKEND ---');
        console.log('1. Params recibidos:', { estado, desde, hasta });

        // 2. Construimos el objeto de búsqueda dinámico
        const where: any = {};

        // Filtro por Estado (Opcional)
        if (estado) {
            where.estado = estado;
        }

        // Filtro por Fechas (Opcional)
        if (desde && hasta) {
            const fechaDesde = new Date(`${desde}T00:00:00`); 
            const fechaHasta = new Date(`${hasta}T23:59:59`);
            
            where.fecha = {
                $gte: fechaDesde,
                $lte: fechaHasta
            };
        }

        // 3. Ejecutamos la consulta con Paginación (findAndCount es la clave)
        const [ventas, total] = await em.findAndCount(Venta, where, {
            populate: ['detalles', 'detalles.producto'],
            orderBy: { fecha: 'DESC' },
            limit: limit,
            offset: (page - 1) * limit
        });

        // 4. Devolvemos estructura paginada profesional
        return res.status(200).json({
            data: ventas,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al obtener ventas' });
    }
}

async function anularVenta(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);

        // 1. Buscamos la venta con sus detalles y los productos asociados
        const venta = await em.findOne(Venta, { id }, { populate: ['detalles', 'detalles.producto'] });

        if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
        
        // Evitar anular dos veces
        if (venta.estado === 'ANULADA') { // Asumiendo que agregaste este campo
             return res.status(400).json({ message: 'Esta venta ya fue anulada' });
        }

        // 2. DEVOLUCIÓN DE STOCK
        for (const detalle of venta.detalles) {
            const producto = detalle.producto;
            producto.stock += detalle.cantidad; // ¡Aquí recuperas el stock!
        }

        // 3. Marcar como anulada
        venta.estado = 'ANULADA'; 
        // Opcional: venta.total = 0; // Para que no sume en el cierre de caja

        await em.flush();

        return res.status(200).json({ message: 'Venta anulada y stock restaurado' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al anular venta' });
    }
}

async function getMetricasDelDia(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        // 1. OBTENER PARÁMETROS
        const fechaQuery = req.query.fecha as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 5; // Por defecto 5 en el dashboard

        let fechaInicio: Date;
        let fechaFin: Date;

        if (fechaQuery) {
            fechaInicio = new Date(`${fechaQuery}T00:00:00`);
            fechaFin = new Date(`${fechaQuery}T23:59:59`);
        } else {
            fechaInicio = new Date();
            fechaInicio.setHours(0, 0, 0, 0);
            fechaFin = new Date();
            fechaFin.setHours(23, 59, 59, 999);
        }

        // 2. BUSCAR TODAS LAS VENTAS DEL DÍA (Para calcular los totales reales)
        const todasLasVentas = await em.find(Venta, {
            fecha: { 
                $gte: fechaInicio, 
                $lte: fechaFin 
            },
            estado: { $in: ['COBRADA', 'PENDIENTE'] }
        }, {
            orderBy: { fecha: 'DESC' }
        });

        // 3. CALCULAR MÉTRICAS (Usando TODAS las ventas)
        const efectivo = todasLasVentas
            .filter(v => v.estado === 'COBRADA' && v.metodo_pago === 'EFECTIVO')
            .reduce((sum, v) => sum + Number(v.total), 0);

        const tarjeta = todasLasVentas
            .filter(v => v.estado === 'COBRADA' && v.metodo_pago.includes('TARJETA'))
            .reduce((sum, v) => sum + Number(v.total), 0);

        const totalCaja = todasLasVentas
            .filter(v => v.estado === 'COBRADA')
            .reduce((sum, v) => sum + Number(v.total), 0);

        const totalFiado = todasLasVentas
            .filter(v => v.estado === 'PENDIENTE')
            .reduce((sum, v) => sum + Number(v.total), 0);

        // 4. PAGINAR LA LISTA PARA LA TABLA (Slice en memoria)
        const inicio = (page - 1) * limit;
        const ventasPaginadas = todasLasVentas.slice(inicio, inicio + limit);

        return res.status(200).json({
            fecha: fechaInicio,
            // KPIs Generales
            ventas_totales: todasLasVentas.length,
            total_caja: totalCaja,
            total_pendiente: totalFiado,
            desglose: { efectivo, tarjeta },
            
            // Lista Paginada
            ventas: ventasPaginadas,
            
            // Metadatos de Paginación
            meta: {
                total: todasLasVentas.length,
                page,
                limit,
                totalPages: Math.ceil(todasLasVentas.length / limit)
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error obteniendo métricas' });
    }
}

export { crearVenta, obtenerVentas, anularVenta, findOne, getMetricasDelDia, inputS, marcarPagada };