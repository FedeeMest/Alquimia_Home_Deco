import { Request, Response, NextFunction } from 'express';
import { orm } from '../shared/db/orm.js';
import { raw } from '@mikro-orm/core';
import { Venta } from './venta.entity.js';
import { DetalleVenta } from '../detalle_venta/detalle.entity.js';
import { Producto } from '../productos/producto.entity.js'; 
// NUEVO: Importamos el Cliente
import { Cliente } from '../cliente/cliente.entity.js'; 

function inputS(req: Request, res: Response, next: NextFunction) {
    req.body.inputS = {
        // --- Datos Críticos de la Venta ---
        items: req.body.items,           // El array de productos [{id, cantidad}]
        metodo_pago: req.body.metodo_pago, // 'EFECTIVO', 'TARJETA', etc.
        observaciones: req.body.observaciones,

        // --- NUEVO: Solo recibimos el ID del cliente desde el FrontEnd ---
        cliente_id: req.body.cliente_id,

        // --- Auditoría y Vendedor ---
        usuario_vendedor: req.body.usuario_vendedor,

        // --- Datos Fiscales / Internos ---
        tipo_comprobante: req.body.tipo_comprobante, 
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
            // NUEVO: Agregamos 'cliente' al populate para traer sus datos
            populate: ['detalles', 'detalles.producto', 'cliente'] 
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

        if (!datos.items || datos.items.length === 0) {
            return res.status(400).json({ message: 'El carrito no puede estar vacío' });
        }

        const nuevaVenta = new Venta();
        nuevaVenta.estado = datos.estado || 'COBRADA';
        nuevaVenta.metodo_pago = datos.metodo_pago;
        nuevaVenta.usuario_vendedor = datos.usuario_vendedor;
        nuevaVenta.observaciones = datos.observaciones;

        // Vinculamos el Cliente si nos enviaron un ID
        if (datos.cliente_id) {
            const clienteBD = await em.findOne(Cliente, { id: parseInt(datos.cliente_id) });
            if (!clienteBD) {
                return res.status(404).json({ message: 'El cliente seleccionado no existe en la base de datos' });
            }
            nuevaVenta.cliente = clienteBD;
        }

        const esFamilia = nuevaVenta.cliente?.tipo?.toLowerCase() === 'familia';
        
        let totalVenta = 0;

        for (const item of datos.items) {
            const producto = await em.findOneOrFail(Producto, { id: item.id_producto });

            if (producto.stock < item.cantidad) {
                return res.status(400).json({ 
                    message: `No hay suficiente stock de ${producto.nombre}. Stock actual: ${producto.stock}` 
                });
            }

            const detalle = new DetalleVenta();
            detalle.producto = producto;
            detalle.cantidad = item.cantidad;
            
            let precioNormal = 0;
            if (esFamilia) {
                precioNormal = producto.precio_costo;
            } else if (datos.metodo_pago === 'EFECTIVO') {
                precioNormal = producto.precio_efectivo;
            } else if (datos.metodo_pago === 'TARJETA') {
                precioNormal = producto.precio_tarjeta;
            } else {
                precioNormal = producto.precio_tarjeta_local; 
            } 

            // LÓGICA DE DESFASE: Si el frontend envió un precio modificado, usamos ese. Si no, usamos el normal.
            let precioFinal = item.precio_modificado !== undefined && item.precio_modificado !== null 
                              ? Number(item.precio_modificado) 
                              : precioNormal;

            
            detalle.precio_unitario_historico = precioFinal;
            detalle.subtotal = precioFinal * item.cantidad;

            nuevaVenta.detalles.add(detalle);
            totalVenta += detalle.subtotal;

            // ====================================================================
            // NUEVA LÓGICA DE DESCUENTO DE STOCK (ALMACÉN VS CAMIÓN)
            // ====================================================================
            
            // 1. Siempre restamos del general porque la mercadería salió del negocio
            producto.stock -= item.cantidad;

            // 2. Si el vendedor indicó explícitamente que lo sacó del camión, restamos ahí
            if (item.origen === 'camion') {
                producto.stock_camion = Math.max(0, (producto.stock_camion || 0) - item.cantidad);
            }

            // 3. Red de seguridad: El camión nunca puede figurar con más stock que el total del negocio
            if (producto.stock_camion !== null && producto.stock_camion > producto.stock) {
                producto.stock_camion = Math.max(0, producto.stock);
            }
            // ====================================================================
        }

        nuevaVenta.total = totalVenta;

        await em.persistAndFlush([nuevaVenta]);

        return res.status(201).json({ message: 'Venta registrada', id: nuevaVenta.id });

    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ message: 'Error al procesar la venta' });
    }
}

// async function crearVenta(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const datos = req.body.inputS; 

//         if (!datos.items || datos.items.length === 0) {
//             return res.status(400).json({ message: 'El carrito no puede estar vacío' });
//         }

//         const nuevaVenta = new Venta();
//         nuevaVenta.estado = datos.estado || 'COBRADA';
//         nuevaVenta.metodo_pago = datos.metodo_pago;
//         nuevaVenta.usuario_vendedor = datos.usuario_vendedor;
//         nuevaVenta.observaciones = datos.observaciones;

//         // NUEVO: Vinculamos el Cliente si nos enviaron un ID
//         if (datos.cliente_id) {
//             const clienteBD = await em.findOne(Cliente, { id: parseInt(datos.cliente_id) });
//             if (!clienteBD) {
//                 return res.status(404).json({ message: 'El cliente seleccionado no existe en la base de datos' });
//             }
//             nuevaVenta.cliente = clienteBD;
//         }
        
//         let totalVenta = 0;

//         for (const item of datos.items) {
//             const producto = await em.findOneOrFail(Producto, { id: item.id_producto });

//             if (producto.stock < item.cantidad) {
//                 return res.status(400).json({ 
//                     message: `No hay suficiente stock de ${producto.nombre}. Stock actual: ${producto.stock}` 
//                 });
//             }

//             const detalle = new DetalleVenta();
//             detalle.producto = producto;
//             detalle.cantidad = item.cantidad;
            
//             // let precioFinal = 0;
//             // if (datos.metodo_pago === 'EFECTIVO') precioFinal = producto.precio_efectivo;
//             // else if (datos.metodo_pago === 'TARJETA') precioFinal = producto.precio_tarjeta;
//             // else precioFinal = producto.precio_tarjeta_local; 

//             let precioNormal = 0;
//             if (datos.metodo_pago === 'EFECTIVO') precioNormal = producto.precio_efectivo;
//             else if (datos.metodo_pago === 'TARJETA') precioNormal = producto.precio_tarjeta;
//             else precioNormal = producto.precio_tarjeta_local; 

//             // LÓGICA DE DESFASE: Si el frontend envió un precio modificado, usamos ese. Si no, usamos el normal.
//             let precioFinal = item.precio_modificado !== undefined && item.precio_modificado !== null 
//                               ? Number(item.precio_modificado) 
//                               : precioNormal;

            
//             detalle.precio_unitario_historico = precioFinal;
//             detalle.subtotal = precioFinal * item.cantidad;

//             nuevaVenta.detalles.add(detalle);
//             totalVenta += detalle.subtotal;

//             producto.stock -= item.cantidad;
//         }

//         nuevaVenta.total = totalVenta;

//         await em.persistAndFlush([nuevaVenta]);

//         return res.status(201).json({ message: 'Venta registrada', id: nuevaVenta.id });

//     } catch (error: any) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al procesar la venta' });
//     }
// }

async function obtenerVentas(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const estado = req.query.estado as string;
        const desde = req.query.desde as string;
        const hasta = req.query.hasta as string;
        
        // NUEVO: Parámetro para filtrar por cliente desde el Frontend
        const cliente_id = req.query.cliente_id as string;

        const where: any = {};
        
        if (estado) {
            where.estado = estado;
        }
        
        // NUEVO: Agregamos la lógica para filtrar las ventas de un cliente específico
        if (cliente_id) {
            where.cliente = { id: parseInt(cliente_id) };
        }

        if (desde && hasta) {
            const fechaDesde = new Date(`${desde}T00:00:00`); 
            const fechaHasta = new Date(`${hasta}T23:59:59`);
            where.fecha = {
                $gte: fechaDesde,
                $lte: fechaHasta
            };
        }

        const [ventas, totalItems] = await em.findAndCount(Venta, where, {
            // NUEVO: Agregamos 'cliente' al populate para la tabla del FrontEnd
            populate: ['detalles', 'detalles.producto', 'cliente'],
            orderBy: { fecha: 'DESC' },
            limit: limit,
            offset: (page - 1) * limit
        });

        const qb = em.createQueryBuilder(Venta);
        
        const resultadoSuma = await qb
            .select(raw('sum(total) as totalSum')) 
            .where(where)
            .execute();
        
        const fila = resultadoSuma[0] as any;
        const totalDinero = (fila && fila.totalSum) ? Number(fila.totalSum) : 0;

        return res.status(200).json({
            data: ventas,
            meta: {
                total: totalItems, 
                page,
                limit,
                totalPages: Math.ceil(totalItems / limit),
                totalAmount: totalDinero 
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

        const venta = await em.findOne(Venta, { id }, { populate: ['detalles', 'detalles.producto'] });

        if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
        
        if (venta.estado === 'ANULADA') { 
             return res.status(400).json({ message: 'Esta venta ya fue anulada' });
        }

        for (const detalle of venta.detalles) {
            const producto = detalle.producto;
            producto.stock += detalle.cantidad; 
        }

        venta.estado = 'ANULADA'; 

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
        const fechaQuery = req.query.fecha as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 5; 

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

        const todasLasVentas = await em.find(Venta, {
            fecha: { 
                $gte: fechaInicio, 
                $lte: fechaFin 
            },
            estado: { $in: ['COBRADA', 'PENDIENTE'] }
        }, {
            // NUEVO: Populamos el cliente para que en el dashboard se vea de quién es la venta
            populate: ['cliente'],
            orderBy: { fecha: 'DESC' }
        });

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

        const inicio = (page - 1) * limit;
        const ventasPaginadas = todasLasVentas.slice(inicio, inicio + limit);

        return res.status(200).json({
            fecha: fechaInicio,
            ventas_totales: todasLasVentas.length,
            total_caja: totalCaja,
            total_pendiente: totalFiado,
            desglose: { efectivo, tarjeta },
            ventas: ventasPaginadas,
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

async function update(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const id = parseInt(req.params.id);
        const venta = await em.findOneOrFail(Venta, { id });

        if (req.body.observaciones !== undefined) {
            venta.observaciones = req.body.observaciones;
        }

        await em.flush();

        return res.status(200).json({ message: 'Venta actualizada', data: venta });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al actualizar venta' });
    }
}

const getEstadisticas = async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const em = orm.em.fork();

    const qb = em.createQueryBuilder(DetalleVenta, 'dv');

    qb.select([
      'p.nombre as nombre',
      'SUM(dv.cantidad) as cantidad',
      'SUM(dv.subtotal) as recaudado' 
    ])
    .join('dv.producto', 'p') 
    .join('dv.venta', 'v')    
    .groupBy('p.id')          
    .orderBy({ cantidad: 'DESC' }); 

    if (fechaDesde && fechaHasta) {
      qb.andWhere({
        'v.fechaEmision': { 
          $gte: new Date(`${fechaDesde}T00:00:00.000Z`), 
          $lte: new Date(`${fechaHasta}T23:59:59.999Z`) 
        }
      });
    }

    const resultados = await qb.execute();

    const estadisticas = resultados.map((row: any) => ({
      nombre: row.nombre,
      cantidad: Number(row.cantidad),
      recaudado: Number(row.recaudado)
    }));

    return res.status(200).json({
      message: 'Estadísticas calculadas con éxito',
      data: estadisticas
    });

  } catch (error: any) {
    console.error('Error calculando estadísticas:', error);
    return res.status(500).json({ message: error.message });
  }
};

export { crearVenta, obtenerVentas, anularVenta, findOne, getMetricasDelDia, inputS, marcarPagada, update, getEstadisticas };
// import { Request, Response, NextFunction } from 'express';
// import { orm } from '../shared/db/orm.js';
// import { raw } from '@mikro-orm/core';
// import { Venta } from './venta.entity.js';
// import { DetalleVenta } from '../detalle_venta/detalle.entity.js';
// import { Producto } from '../productos/producto.entity.js'; // Ajusta ruta

// function inputS(req: Request, res: Response, next: NextFunction) {
//     req.body.inputS = {
//         // --- Datos Críticos de la Venta ---
//         items: req.body.items,           // El array de productos [{id, cantidad}]
//         metodo_pago: req.body.metodo_pago, // 'EFECTIVO', 'TARJETA', etc.
//         observaciones: req.body.observaciones,

//         // --- Datos del Cliente (Opcionales) ---
//         cliente_nombre: req.body.cliente_nombre,
//         cliente_cuit: req.body.cliente_cuit,
//         cliente_direccion: req.body.cliente_direccion,

//         // --- Auditoría y Vendedor ---
//         usuario_vendedor: req.body.usuario_vendedor,

//         // --- Datos Fiscales / Internos ---
//         tipo_comprobante: req.body.tipo_comprobante, // Ej: 'TICKET_X'
//         numero_comprobante: req.body.numero_comprobante,

//         // --- Detalles Financieros Extra ---
//         monto_descuento_recargo: req.body.monto_descuento_recargo,
//         cuotas: req.body.cuotas,

//         estado: req.body.estado
//     };

//     // Eliminar campos no definidos (limpieza)
//     Object.keys(req.body.inputS).forEach((key) => {
//         if (req.body.inputS[key] === undefined) {
//             delete req.body.inputS[key];
//         }
//     });

//     next();
// }

// async function findOne(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const id = parseInt(req.params.id);
//         const venta = await em.findOne(Venta, { id }, { 
//             populate: ['detalles', 'detalles.producto'] // Fundamental traer los nombres de productos
//         });

//         if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });

//         return res.status(200).json(venta);
//     } catch (error) {
//         return res.status(500).json({ message: 'Error al buscar venta' });
//     }
// }

// async function marcarPagada(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const id = parseInt(req.params.id);
//         const venta = await em.findOne(Venta, { id });

//         if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });

//         if (venta.estado !== 'PENDIENTE') {
//             return res.status(400).json({ message: 'Solo se pueden cobrar ventas pendientes' });
//         }

//         // CAMBIO DE ESTADO
//         venta.estado = 'COBRADA';
        
//         await em.flush();
        
//         return res.status(200).json({ message: 'Venta marcada como COBRADA exitosamente' });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al actualizar venta' });
//     }
// }


// async function crearVenta(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const datos = req.body.inputS; 
//         // 'items' es un array: [{ id_producto: 1, cantidad: 2 }, ...]

//         if (!datos.items || datos.items.length === 0) {
//             return res.status(400).json({ message: 'El carrito no puede estar vacío' });
//         }

//         const nuevaVenta = new Venta();
//         nuevaVenta.estado = datos.estado || 'COBRADA';
//         nuevaVenta.metodo_pago = datos.metodo_pago;
//         nuevaVenta.cliente_nombre = datos.cliente_nombre;
//         nuevaVenta.cliente_cuit = datos.cliente_cuit;
//         nuevaVenta.usuario_vendedor = datos.usuario_vendedor;
//         nuevaVenta.observaciones = datos.observaciones
        
//         let totalVenta = 0;

//         // Iteramos sobre los productos del carrito
//         for (const item of datos.items) {
//             // 1. Buscamos el producto real en la BD
//             const producto = await em.findOneOrFail(Producto, { id: item.id_producto });

//             // 2. VALIDACIÓN DE STOCK
//             if (producto.stock < item.cantidad) {
//                 return res.status(400).json({ 
//                     message: `No hay suficiente stock de ${producto.nombre}. Stock actual: ${producto.stock}` 
//                 });
//             }

//             // 3. Crear el detalle (Renglón)
//             const detalle = new DetalleVenta();
//             detalle.producto = producto;
//             detalle.cantidad = item.cantidad;
            
//             // 4. Determinamos el precio según el método de pago
//             // Usamos la lógica que ya creaste en tu entidad Producto
//             let precioFinal = 0;
//             if (datos.metodo_pago === 'EFECTIVO') precioFinal = producto.precio_efectivo;
//             else if (datos.metodo_pago === 'TARJETA') precioFinal = producto.precio_tarjeta;
//             else precioFinal = producto.precio_tarjeta_local; // Ejemplo

//             detalle.precio_unitario_historico = precioFinal;
//             detalle.subtotal = precioFinal * item.cantidad;

//             // 5. Agregar a la venta y sumar al total
//             nuevaVenta.detalles.add(detalle);
//             totalVenta += detalle.subtotal;

//             // 6. DESCONTAR STOCK (Fundamental)
//             producto.stock -= item.cantidad;
//         }

//         nuevaVenta.total = totalVenta;

//         // Guardamos todo junto (Venta, Detalles y Actualización de Stock)
//         // Gracias a MikroORM, esto se hace en una sola transacción segura.
//         await em.persistAndFlush([nuevaVenta]);

//         return res.status(201).json({ message: 'Venta registrada', id: nuevaVenta.id });

//     } catch (error: any) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al procesar la venta' });
//     }
// }

// // Para ver el historial (Auditoría)
// async function obtenerVentas(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const page = parseInt(req.query.page as string) || 1;
//         const limit = parseInt(req.query.limit as string) || 10;
//         const estado = req.query.estado as string;
//         const desde = req.query.desde as string;
//         const hasta = req.query.hasta as string;

//         const where: any = {};
//         if (estado) {
//             where.estado = estado;
//         }
//         if (desde && hasta) {
//             const fechaDesde = new Date(`${desde}T00:00:00`); 
//             const fechaHasta = new Date(`${hasta}T23:59:59`);
//             where.fecha = {
//                 $gte: fechaDesde,
//                 $lte: fechaHasta
//             };
//         }

//         // 1. Consulta Principal
//         const [ventas, totalItems] = await em.findAndCount(Venta, where, {
//             populate: ['detalles', 'detalles.producto'],
//             orderBy: { fecha: 'DESC' },
//             limit: limit,
//             offset: (page - 1) * limit
//         });

//         // 2. Consulta de Total de Dinero (Optimizada)
//         const qb = em.createQueryBuilder(Venta);
        
//         // Usamos raw() para evitar el error de columna 'v0.sum(total)'
//         const resultadoSuma = await qb
//             .select(raw('sum(total) as totalSum')) 
//             .where(where)
//             .execute();
        
//         // CORRECCIÓN FINAL: Casting a 'any' para evitar error TS2339
//         const fila = resultadoSuma[0] as any;
//         const totalDinero = (fila && fila.totalSum) ? Number(fila.totalSum) : 0;

//         return res.status(200).json({
//             data: ventas,
//             meta: {
//                 total: totalItems, 
//                 page,
//                 limit,
//                 totalPages: Math.ceil(totalItems / limit),
//                 totalAmount: totalDinero 
//             }
//         });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al obtener ventas' });
//     }
// }

// async function anularVenta(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const id = parseInt(req.params.id);

//         // 1. Buscamos la venta con sus detalles y los productos asociados
//         const venta = await em.findOne(Venta, { id }, { populate: ['detalles', 'detalles.producto'] });

//         if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
        
//         // Evitar anular dos veces
//         if (venta.estado === 'ANULADA') { // Asumiendo que agregaste este campo
//              return res.status(400).json({ message: 'Esta venta ya fue anulada' });
//         }

//         // 2. DEVOLUCIÓN DE STOCK
//         for (const detalle of venta.detalles) {
//             const producto = detalle.producto;
//             producto.stock += detalle.cantidad; // ¡Aquí recuperas el stock!
//         }

//         // 3. Marcar como anulada
//         venta.estado = 'ANULADA'; 
//         // Opcional: venta.total = 0; // Para que no sume en el cierre de caja

//         await em.flush();

//         return res.status(200).json({ message: 'Venta anulada y stock restaurado' });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al anular venta' });
//     }
// }

// async function getMetricasDelDia(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         // 1. OBTENER PARÁMETROS
//         const fechaQuery = req.query.fecha as string;
//         const page = parseInt(req.query.page as string) || 1;
//         const limit = parseInt(req.query.limit as string) || 5; // Por defecto 5 en el dashboard

//         let fechaInicio: Date;
//         let fechaFin: Date;

//         if (fechaQuery) {
//             fechaInicio = new Date(`${fechaQuery}T00:00:00`);
//             fechaFin = new Date(`${fechaQuery}T23:59:59`);
//         } else {
//             fechaInicio = new Date();
//             fechaInicio.setHours(0, 0, 0, 0);
//             fechaFin = new Date();
//             fechaFin.setHours(23, 59, 59, 999);
//         }

//         // 2. BUSCAR TODAS LAS VENTAS DEL DÍA (Para calcular los totales reales)
//         const todasLasVentas = await em.find(Venta, {
//             fecha: { 
//                 $gte: fechaInicio, 
//                 $lte: fechaFin 
//             },
//             estado: { $in: ['COBRADA', 'PENDIENTE'] }
//         }, {
//             orderBy: { fecha: 'DESC' }
//         });

//         // 3. CALCULAR MÉTRICAS (Usando TODAS las ventas)
//         const efectivo = todasLasVentas
//             .filter(v => v.estado === 'COBRADA' && v.metodo_pago === 'EFECTIVO')
//             .reduce((sum, v) => sum + Number(v.total), 0);

//         const tarjeta = todasLasVentas
//             .filter(v => v.estado === 'COBRADA' && v.metodo_pago.includes('TARJETA'))
//             .reduce((sum, v) => sum + Number(v.total), 0);

//         const totalCaja = todasLasVentas
//             .filter(v => v.estado === 'COBRADA')
//             .reduce((sum, v) => sum + Number(v.total), 0);

//         const totalFiado = todasLasVentas
//             .filter(v => v.estado === 'PENDIENTE')
//             .reduce((sum, v) => sum + Number(v.total), 0);

//         // 4. PAGINAR LA LISTA PARA LA TABLA (Slice en memoria)
//         const inicio = (page - 1) * limit;
//         const ventasPaginadas = todasLasVentas.slice(inicio, inicio + limit);

//         return res.status(200).json({
//             fecha: fechaInicio,
//             // KPIs Generales
//             ventas_totales: todasLasVentas.length,
//             total_caja: totalCaja,
//             total_pendiente: totalFiado,
//             desglose: { efectivo, tarjeta },
            
//             // Lista Paginada
//             ventas: ventasPaginadas,
            
//             // Metadatos de Paginación
//             meta: {
//                 total: todasLasVentas.length,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(todasLasVentas.length / limit)
//             }
//         });

//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error obteniendo métricas' });
//     }
// }

// async function update(req: Request, res: Response) {
//     const em = orm.em.fork();
//     try {
//         const id = parseInt(req.params.id);
//         const venta = await em.findOneOrFail(Venta, { id });

//         // Solo actualizamos lo que nos envíen (en este caso, observaciones)
//         if (req.body.observaciones !== undefined) {
//             venta.observaciones = req.body.observaciones;
//         }

//         await em.flush();

//         return res.status(200).json({ message: 'Venta actualizada', data: venta });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: 'Error al actualizar venta' });
//     }
// }

// const getEstadisticas = async (req: Request, res: Response) => {
//   try {
//     const { fechaDesde, fechaHasta } = req.query;
//     const em = orm.em.fork();

//     // Iniciamos el QueryBuilder sobre la tabla DetalleVenta (que es la que vincula producto con la venta)
//     const qb = em.createQueryBuilder(DetalleVenta, 'dv');

//     // Seleccionamos el nombre del producto, sumamos cantidades y sumamos el dinero
//     qb.select([
//       'p.nombre as nombre',
//       'SUM(dv.cantidad) as cantidad',
//       'SUM(dv.subtotal) as recaudado' // Asegurate de que tu campo se llame subtotal en DetalleVenta
//     ])
//     .join('dv.producto', 'p') // Relación hacia Producto
//     .join('dv.venta', 'v')    // Relación hacia Venta
//     .groupBy('p.id')          // Agrupamos por el ID del producto
//     .orderBy({ cantidad: 'DESC' }); // Ordenamos de mayor a menor según unidades

//     // Si el front nos mandó fechas, aplicamos el filtro a la fecha de la venta
//     if (fechaDesde && fechaHasta) {
//       // Ajustá "fechaEmision" al nombre exacto de la columna de fecha en tu VentaEntity
//       qb.andWhere({
//         'v.fechaEmision': { 
//           $gte: new Date(`${fechaDesde}T00:00:00.000Z`), 
//           $lte: new Date(`${fechaHasta}T23:59:59.999Z`) 
//         }
//       });
//     }

//     const resultados = await qb.execute();

//     // Formateamos los números (porque SQL a veces devuelve strings en los SUM)
//     const estadisticas = resultados.map((row: any) => ({
//       nombre: row.nombre,
//       cantidad: Number(row.cantidad),
//       recaudado: Number(row.recaudado)
//     }));

//     return res.status(200).json({
//       message: 'Estadísticas calculadas con éxito',
//       data: estadisticas
//     });

//   } catch (error: any) {
//     console.error('Error calculando estadísticas:', error);
//     return res.status(500).json({ message: error.message });
//   }
// };

// export { crearVenta, obtenerVentas, anularVenta, findOne, getMetricasDelDia, inputS, marcarPagada, update, getEstadisticas };