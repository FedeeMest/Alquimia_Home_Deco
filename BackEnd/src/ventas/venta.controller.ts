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

        fecha: req.body.fecha,

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

        if (datos.fecha) {
            // datos.fecha llega como "YYYY-MM-DD"
            const [year, month, day] = datos.fecha.split('-');
            
            // Instanciamos una fecha actual (para conservar la hora del momento de carga)
            const fechaModificada = new Date();
            // Le forzamos el año, mes y día exactos seleccionados por el usuario
            fechaModificada.setFullYear(Number(year), Number(month) - 1, Number(day));
            
            nuevaVenta.fecha = fechaModificada;
        }

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

// ============================================================================
// ESTADÍSTICAS: todas se calculan a partir del DETALLE de cada venta COBRADA
// (cada renglón = producto, cantidad, precio al que se vendió).
// Ganancia de un renglón = subtotal vendido - (precio_costo actual del producto * cantidad)
// ============================================================================

interface FiltrosDetalle {
  fechaDesde?: string;
  fechaHasta?: string;
  clienteId?: number;
}

async function cargarDetallesCobrados(em: any, filtros: FiltrosDetalle = {}) {
  // Solo contamos ventas efectivamente cobradas (no anuladas ni pendientes)
  const where: any = { venta: { estado: 'COBRADA' } };

  if (filtros.fechaDesde && filtros.fechaHasta) {
    where.venta.fecha = {
      $gte: new Date(`${filtros.fechaDesde}T00:00:00.000Z`),
      $lte: new Date(`${filtros.fechaHasta}T23:59:59.999Z`)
    };
  }

  // Si se pide un cliente puntual (ej. una feria), filtramos solo sus ventas
  if (filtros.clienteId) {
    where.venta.cliente = { id: filtros.clienteId };
  }

  return em.find(DetalleVenta, where, { populate: ['producto', 'venta'] }) as Promise<DetalleVenta[]>;
}

function gananciaDeDetalle(d: DetalleVenta): number {
  const costo = Number(d.producto?.precio_costo ?? 0) * Number(d.cantidad);
  return Number(d.subtotal) - costo;
}

interface AcumuladoProducto {
  productoId: number;
  nombre: string;
  categoria: string | null;
  cantidad: number;
  recaudado: number;
  costo: number;
  ganancia: number;
  margen: number; // % de ganancia sobre lo recaudado
  cantidadVentas: number;
}

// Agrupa los renglones por producto (todos los productos vendidos, sin límite)
function agruparPorProducto(detalles: DetalleVenta[]): AcumuladoProducto[] {
  const acumulado = new Map<number, AcumuladoProducto & { _ventas: Set<number> }>();

  for (const d of detalles) {
    if (!d.producto) continue;
    const id = d.producto.id;
    const actual = acumulado.get(id) || {
      productoId: id,
      nombre: d.producto.nombre,
      categoria: d.producto.categoria || null,
      cantidad: 0,
      recaudado: 0,
      costo: 0,
      ganancia: 0,
      margen: 0,
      cantidadVentas: 0,
      _ventas: new Set<number>()
    };

    const subtotal = Number(d.subtotal);
    const costo = Number(d.producto.precio_costo) * Number(d.cantidad);

    actual.cantidad += Number(d.cantidad);
    actual.recaudado += subtotal;
    actual.costo += costo;
    actual.ganancia += subtotal - costo;
    actual._ventas.add(d.venta.id);
    acumulado.set(id, actual);
  }

  return Array.from(acumulado.values()).map(({ _ventas, ...p }) => ({
    ...p,
    cantidadVentas: _ventas.size,
    margen: p.recaudado > 0 ? (p.ganancia / p.recaudado) * 100 : 0
  }));
}

function resumenDeDetalles(detalles: DetalleVenta[]) {
  const ventas = new Set<number>();
  let unidades = 0;
  let facturado = 0;
  let ganancia = 0;

  for (const d of detalles) {
    ventas.add(d.venta.id);
    unidades += Number(d.cantidad);
    facturado += Number(d.subtotal);
    ganancia += gananciaDeDetalle(d);
  }

  return { unidades, facturado, ganancia, cantidadVentas: ventas.size };
}

function leerFiltros(req: Request): FiltrosDetalle {
  const { fechaDesde, fechaHasta, clienteId } = req.query;
  return {
    fechaDesde: fechaDesde as string | undefined,
    fechaHasta: fechaHasta as string | undefined,
    clienteId: clienteId ? Number(clienteId) : undefined
  };
}

// Top de productos más vendidos + resumen del período (calculado sobre TODAS las ventas, no solo el top)
const getEstadisticas = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const em = orm.em.fork();

    const detalles = await cargarDetallesCobrados(em, leerFiltros(req));

    const estadisticas = agruparPorProducto(detalles)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limit);

    return res.status(200).json({
      message: 'Estadísticas calculadas con éxito',
      data: estadisticas,
      resumen: resumenDeDetalles(detalles)
    });

  } catch (error: any) {
    console.error('Error calculando estadísticas:', error);
    return res.status(500).json({ message: error.message });
  }
};

// NUEVO: Reporte completo por producto: cuánto se vendió (unidades y $) y cuánto se ganó
const getReporteProductos = async (req: Request, res: Response) => {
  try {
    const em = orm.em.fork();

    const detalles = await cargarDetallesCobrados(em, leerFiltros(req));

    const data = agruparPorProducto(detalles).sort((a, b) => b.ganancia - a.ganancia);

    return res.status(200).json({
      data,
      resumen: resumenDeDetalles(detalles)
    });

  } catch (error: any) {
    console.error('Error calculando reporte de productos:', error);
    return res.status(500).json({ message: error.message });
  }
};

// Evolución mensual (para el gráfico de tendencia), también basada en el detalle de las ventas
const getVentasPorMes = async (req: Request, res: Response) => {
  try {
    const meses = parseInt(req.query.meses as string) || 12;
    const em = orm.em.fork();

    // Primer día del mes, "meses" atrás (incluyendo el mes actual)
    const fechaLimite = new Date();
    fechaLimite.setDate(1);
    fechaLimite.setHours(0, 0, 0, 0);
    fechaLimite.setMonth(fechaLimite.getMonth() - (meses - 1));

    const detalles = await em.find(DetalleVenta, {
      venta: { estado: 'COBRADA', fecha: { $gte: fechaLimite } }
    }, { populate: ['producto', 'venta'] });

    // Agrupamos por año-mes en memoria
    const acumulado = new Map<string, { total: number; ganancia: number; unidades: number; ventas: Set<number> }>();

    for (const d of detalles) {
      const fecha = new Date(d.venta.fecha);
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

      const actual = acumulado.get(clave) || { total: 0, ganancia: 0, unidades: 0, ventas: new Set<number>() };
      actual.total += Number(d.subtotal);
      actual.ganancia += gananciaDeDetalle(d);
      actual.unidades += Number(d.cantidad);
      actual.ventas.add(d.venta.id);
      acumulado.set(clave, actual);
    }

    const data = Array.from(acumulado.entries())
      .map(([mes, v]) => ({
        mes,
        total: v.total,
        ganancia: v.ganancia,
        unidades: v.unidades,
        cantidad_ventas: v.ventas.size
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return res.status(200).json({ data });

  } catch (error: any) {
    console.error('Error calculando ventas por mes:', error);
    return res.status(500).json({ message: error.message });
  }
};

// NUEVO: Estado de cuentas por cobrar (ventas PENDIENTE agrupadas por cliente)
const getCobranzas = async (req: Request, res: Response) => {
  try {
    const em = orm.em.fork();

    const ventasPendientes = await em.find(Venta, { estado: 'PENDIENTE' }, {
      populate: ['cliente'],
      orderBy: { fecha: 'ASC' }
    });

    const acumulado = new Map<number, {
      clienteId: number;
      nombre: string;
      telefono: string | null;
      totalAdeudado: number;
      cantidadVentas: number;
      fechaMasAntigua: Date;
    }>();

    for (const venta of ventasPendientes) {
      const clienteId = venta.cliente?.id ?? 0;
      const nombre = venta.cliente?.nombre ?? 'Consumidor Final (sin datos)';
      const telefono = venta.cliente?.telefono ?? null;

      const actual = acumulado.get(clienteId) || {
        clienteId,
        nombre,
        telefono,
        totalAdeudado: 0,
        cantidadVentas: 0,
        fechaMasAntigua: venta.fecha
      };

      actual.totalAdeudado += Number(venta.total);
      actual.cantidadVentas += 1;
      if (new Date(venta.fecha) < new Date(actual.fechaMasAntigua)) {
        actual.fechaMasAntigua = venta.fecha;
      }

      acumulado.set(clienteId, actual);
    }

    const hoy = new Date();
    const deudores = Array.from(acumulado.values())
      .map(d => ({
        ...d,
        diasSinCobrar: Math.max(0, Math.floor((hoy.getTime() - new Date(d.fechaMasAntigua).getTime()) / (1000 * 60 * 60 * 24)))
      }))
      .sort((a, b) => b.totalAdeudado - a.totalAdeudado);

    const totalAdeudado = deudores.reduce((sum, d) => sum + d.totalAdeudado, 0);

    return res.status(200).json({
      totalAdeudado,
      cantidadDeudores: deudores.length,
      deudores
    });

  } catch (error: any) {
    console.error('Error calculando cobranzas:', error);
    return res.status(500).json({ message: error.message });
  }
};

// NUEVO: Ganancia real (facturado - costo) por cada cliente de tipo "Feria"
const getGananciasPorFeria = async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const em = orm.em.fork();

    const where: any = { estado: 'COBRADA', cliente: { tipo: 'Feria' } };

    if (fechaDesde && fechaHasta) {
      where.fecha = {
        $gte: new Date(`${fechaDesde}T00:00:00.000Z`),
        $lte: new Date(`${fechaHasta}T23:59:59.999Z`)
      };
    }

    const ventas = await em.find(Venta, where, {
      populate: ['cliente', 'detalles', 'detalles.producto']
    });

    const acumulado = new Map<number, {
      clienteId: number;
      nombre: string;
      facturado: number;
      ganancia: number;
      cantidadVentas: number;
    }>();

    for (const venta of ventas) {
      if (!venta.cliente) continue;

      const id = venta.cliente.id;
      const actual = acumulado.get(id) || {
        clienteId: id,
        nombre: venta.cliente.nombre,
        facturado: 0,
        ganancia: 0,
        cantidadVentas: 0
      };

      actual.cantidadVentas += 1;

      // Facturado y ganancia salen del detalle de productos de cada venta
      for (const detalle of venta.detalles) {
        if (!detalle.producto) continue;
        actual.facturado += Number(detalle.subtotal);
        actual.ganancia += gananciaDeDetalle(detalle);
      }

      acumulado.set(id, actual);
    }

    const data = Array.from(acumulado.values()).sort((a, b) => b.ganancia - a.ganancia);

    return res.status(200).json({ data });
  } catch (error: any) {
    console.error('Error calculando ganancias por feria:', error);
    return res.status(500).json({ message: error.message });
  }
};

export { crearVenta, obtenerVentas, anularVenta, findOne, getMetricasDelDia, inputS, marcarPagada, update, getEstadisticas, getVentasPorMes, getCobranzas, getGananciasPorFeria, getReporteProductos };