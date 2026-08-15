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
        codigo_proveedor: req.body.codigo_proveedor,

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

        imagenUrl: req.body.imagenUrl,
        publicarEnWeb: req.body.publicarEnWeb,
        descripcion: req.body.descripcion
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
        const productos = await em.find(Producto, {});
        
        // Si no hay nada que arreglar, avisamos rápido
        if (productos.length === 0) {
            return res.json({ message: 'No se encontraron productos con precio_compra para actualizar.' });
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

async function actualizarGananciasMasivo(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const { nueva_ganancia } = req.body;

        // Validamos que sea un número lógico (ej: entre 0 y 500%)
        if (nueva_ganancia === undefined || nueva_ganancia < 0) {
            return res.status(400).json({ message: 'El porcentaje de ganancia no es válido' });
        }

        // 1. Buscamos TODOS los productos
        const productos = await em.find(Producto, {});

        // 2. Actualizamos uno por uno (esto dispara los Hooks @BeforeUpdate)
        for (const prod of productos) {
            prod.ganancia = Number(nueva_ganancia);
            // Al hacer flush, MikroORM ejecutará calcularPrecios() automáticamente para cada uno
        }

        // 3. Guardamos todo en una sola transacción
        await em.flush();

        return res.status(200).json({ 
            message: `Se actualizaron los precios de ${productos.length} productos correctamente.` 
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al actualizar ganancias masivamente' });
    }
}

async function vaciarCamion(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        // Buscamos solo aquellos que tengan stock en el camión (> 0)
        const productosEnCamion = await em.find(Producto, { stock_camion: { $gt: 0 } });
        
        let contador = 0;
        for (const prod of productosEnCamion) {
            prod.stock_camion = 0; // Al ponerlo en 0, automáticamente "vuelve" a almacén lógicamente
            contador++;
        }

        await em.flush();

        return res.status(200).json({ 
            message: 'Camión vaciado correctamente', 
            productosRestablecidos: contador 
        });

    } catch (error: any) {
        console.error('Error al vaciar camión:', error);
        return res.status(500).json({ message: 'Error interno al vaciar el camión' });
    }
}

async function ventaFeria(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const { productoId, cantidad } = req.body;
        const producto = await em.findOneOrFail(Producto, { id: productoId });

        if (producto.stock_camion < cantidad) {
            return res.status(400).json({ message: 'Stock en camión insuficiente' });
        }

        // 1. Descontar stocks
        producto.stock -= cantidad;
        producto.stock_camion -= cantidad;

        // 2. Crear registro de Venta automático
        const nuevaVenta = em.create('Venta', {
            fecha: new Date(),
            cliente_nombre: 'Venta Feria (Persona)', // Corregido de 'cliente' a 'cliente_nombre'
            total: (producto.precio_efectivo || 0) * cantidad,
            metodo_pago: 'EFECTIVO', 
            estado: 'COBRADA' // Corregido de 'activo' a 'estado'
        });

        // 3. Crear el detalle de esa venta
        em.create('DetalleVenta', {
            venta: nuevaVenta,
            producto: producto,
            cantidad: cantidad,
            precio_unitario_historico: producto.precio_efectivo || 0, // Corregido el nombre
            subtotal: (producto.precio_efectivo || 0) * cantidad // Agregado el subtotal obligatorio
        });

        await em.flush();
        res.status(200).json({ message: 'Venta de feria procesada correctamente' });
    } catch (error: any) {
        console.error('Error en venta feria:', error);
        res.status(500).json({ message: error.message });
    }
}

async function updateStockRapido(req: Request, res: Response) {
    const em = orm.em.fork();
  try {
    const id = parseInt(req.params.id);
    const { stockAlmacen, stockCamion } = req.body;

    const producto = await em.findOneOrFail(Producto, { id });
    
    // Validamos qué nombre de variable usa tu entidad (stock_camion o stockCamion)
    // Asumiendo que es stock_camion por tu frontend:
    if (stockCamion !== undefined) producto.stock_camion = stockCamion;
    // Si tuvieras stock_almacen guardado, lo actualizarías aquí también
    // if (stockAlmacen !== undefined) producto.stock_almacen = stockAlmacen;

    await em.flush();
    res.json({ message: 'Stock actualizado', data: producto });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function findByBarcode(req: Request, res: Response) {
  try {
    const { codigo } = req.params;
    const em = orm.em.fork();
    
    // Buscamos coincidencia exacta y que el producto esté activo
    const producto = await em.findOne(Producto, { codigo_barra: codigo, activo: true });
    
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    return res.status(200).json({ data: producto });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function getPublicCatalog(req: Request, res: Response){
    try {
        const em = orm.em.fork();
        
        const productos = await em.find(Producto, 
            { publicarEnWeb: true, activo: true },
            { 
                fields: [
                    'id', 
                    'nombre', 
                    'codigo_barra', 
                    'precio_efectivo',
                    'precio_tarjeta', 
                    'imagenUrl', 
                    'categoria', 
                    'proveedor', 
                    'stock', 
                    'stock_camion',
                    'descripcion',      // NUEVO: faltaba, por eso nunca se veía en el modal
                    'grupo_variante',   // NUEVO: agrupa variantes del mismo estampado
                    'tamano'            // NUEVO: tamaño de esa variante puntual
                ] 
            }
        );

        const catalogo = productos.map(p => {
            const stockGeneral = p.stock || 0;
            const stockCamion = p.stock_camion || 0; 
            let stockDisponible = stockGeneral - stockCamion;

            if (stockDisponible < 0) {
                stockDisponible = 0;
            }

            return {
                id: p.id,
                nombre: p.nombre,
                codigo_barra: p.codigo_barra,
                precio: p.precio_tarjeta, 
                precio_efectivo: p.precio_efectivo,
                precio_tarjeta: p.precio_tarjeta,
                imagenUrl: p.imagenUrl,
                categoria: p.categoria,
                proveedor: p.proveedor,
                stock: stockDisponible, 
                disponible: stockDisponible > 0, 
                descripcion: p.descripcion,           // NUEVO
                grupo_variante: p.grupo_variante,     // NUEVO
                tamano: p.tamano,                     // NUEVO
            };
        });

        res.status(200).json({
            message: 'Catálogo cargado con éxito',
            data: catalogo
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
/* async function getPublicCatalog(req: Request, res: Response){
    try {
        const em = orm.em.fork();
        
        // 1. Buscamos usando los nombres exactos de tu entidad
        const productos = await em.find(Producto, 
            { publicarEnWeb: true, activo: true },
            { 
                // Seleccionamos los campos exactos declarados en producto.entity.ts
                fields: [
                    'id', 
                    'nombre', 
                    'codigo_barra', 
                    'precio_efectivo', // Usamos el precio de contado para la web
                    'imagenUrl', 
                    'categoria', 
                    'proveedor', 
                    'stock', 
                    'stock_camion'
                ] 
            }
        );

        // 2. Formateamos el catálogo y aplicamos tu lógica de resta
        const catalogo = productos.map(p => {
            
            // LÓGICA DE STOCK SEGURO: Stock general menos Stock en Camión
            const stockGeneral = p.stock || 0;
            const stockCamion = p.stock_camion || 0; 
            let stockDisponible = stockGeneral - stockCamion;

            // Por seguridad, evitamos stocks negativos
            if (stockDisponible < 0) {
                stockDisponible = 0;
            }

            return {
                id: p.id,
                nombre: p.nombre,
                codigo_barra: p.codigo_barra,
                // Mapeamos el precio interno de tu BD a 'precio' para que el frontend lo lea igual
                precio: p.precio_efectivo, 
                imagenUrl: p.imagenUrl,
                categoria: p.categoria,
                proveedor: p.proveedor,
                stock: stockDisponible, 
                disponible: stockDisponible > 0, 
            };
        });

        res.status(200).json({
            message: 'Catálogo cargado con éxito',
            data: catalogo
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}; */

async function actualizarStockMasivo(req: Request, res: Response) {
    const em = orm.em.fork();
    try {
        const { ajustes } = req.body;

        if (!ajustes || !Array.isArray(ajustes)) {
            return res.status(400).json({ message: 'Formato de datos inválido' });
        }

        let contador = 0;
        
        // Recorremos el arreglo de ajustes que nos manda el frontend
        for (const ajuste of ajustes) {
            const producto = await em.findOne(Producto, { id: ajuste.id });
            if (producto) {
                // Actualizamos el stock general al nuevo stock real contado
                producto.stock = ajuste.stock_real;
                contador++;
            }
        }

        // Guardamos todos los cambios en la base de datos en una sola transacción
        await em.flush();

        return res.status(200).json({ 
            message: `Se actualizó el stock de ${contador} productos correctamente.` 
        });

    } catch (error) {
        console.error('Error al actualizar stock masivo:', error);
        return res.status(500).json({ message: 'Error interno al actualizar el stock' });
    }
}
// async function getPublicCatalog(req: Request, res: Response) {
//     try {
//       // Buscamos SOLO los que están marcados para publicar en la web
//       const productos = await orm.em.find(Producto, { publicarEnWeb: true });

//       // Filtramos y "limpiamos" los datos antes de enviarlos al frontend
//       const catalogoSeguro = productos.map(p => ({
//         id: p.id,
//         nombre: p.nombre,
//         categoria: p.categoria,
//         precio: p.precio_efectivo, // Precio principal de venta
//         precio_tarjeta: p.precio_tarjeta,
//         imagenUrl: p.imagenUrl,
//         codigo_barra: p.codigo_barra,
//         // Ocultamos el número real, solo decimos si hay disponibilidad
//         disponible: (p.stock || 0) > 0,
//         descripcion: p.descripcion
//       }));

//       res.status(200).json({ data: catalogoSeguro });
//     } catch (error: any) {
//       res.status(500).json({ message: error.message });
//     }
//   }



export { inputS, findAll, findOne, add, update, remove, restaurar, fixPrecios, actualizarGananciasMasivo, vaciarCamion, ventaFeria, updateStockRapido, findByBarcode, getPublicCatalog, actualizarStockMasivo };