import { Producto } from "./producto.interface";

export interface DetalleVenta {
    id: number;
    cantidad: number;
    precio_unitario_historico: number;
    subtotal: number;
    producto: Producto; // El producto completo
}

export interface Venta {
    id: number;
    fecha: string; // Vienen como string del JSON
    total: number;
    metodo_pago: string;
    estado: string;
    
    // Campos opcionales (por si son ventas viejas o consumidores finales)
    cliente_nombre?: string;
    cliente_cuit?: string;
    cliente_direccion?: string;
    usuario_vendedor?: string;
    numero_comprobante?: string;
    cuotas?: number;

    detalles: DetalleVenta[];
}