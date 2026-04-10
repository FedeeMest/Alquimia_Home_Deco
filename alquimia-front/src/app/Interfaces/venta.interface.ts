import { Producto } from "./producto.interface";
import { Cliente } from "./cliente.interface"; // <-- 1. Importar la interfaz Cliente

export interface DetalleVenta {
    id: number;
    cantidad: number;
    precio_unitario_historico: number;
    subtotal: number;
    producto: Producto;
}

export interface Venta {
    id: number;
    fecha: string;
    total: number;
    metodo_pago: string;
    estado: string;
    
    cliente_id?: number | null;
    cliente?: Cliente; // <-- 2. Agregar la propiedad cliente (opcional)
    
    usuario_vendedor?: string;
    numero_comprobante?: string;
    cuotas?: number;
    observaciones?: string;

    detalles: DetalleVenta[];
}