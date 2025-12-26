import { Entity, PrimaryKey, Property, OneToMany, Collection, Cascade } from "@mikro-orm/core";
import { DetalleVenta } from "../detalle_venta/detalle.entity.js"; // La crearemos abajo

@Entity()
export class Venta {
    @PrimaryKey()
    id!: number;

    // --- AUDITORÍA Y TIEMPO ---
    @Property({ onCreate: () => new Date() })
    fecha = new Date();

    // Nuevo: Saber QUIÉN hizo la venta (útil para comisiones o control de caja)
    @Property({ nullable: true })
    usuario_vendedor?: string;

    // --- DATOS DEL CLIENTE (Consumidor Final o Factura) ---
    // Si no tienes una tabla de "Clientes", guárdalos como texto aquí.
    @Property({ nullable: true })
    cliente_nombre?: string; // Ej: "Juan Perez" o "Consumidor Final"

    @Property({ nullable: true })
    cliente_cuit?: string;   // Ej: "20-12345678-9" (DNI o CUIT)

    @Property({ nullable: true })
    cliente_direccion?: string; // Necesario para Factura A

    // --- IDENTIFICACIÓN DE VENTA (Fiscal/Interna) ---
    // El ID numérico sirve para la base de datos, pero un negocio suele usar un formato compuesto
    @Property({ nullable: true })
    numero_comprobante?: string; // Ej: "0001-00004582"

    // --- DETALLES FINANCIEROS ---
    @Property()
    total!: number; // La suma de todos los subtotales

    @Property()
    metodo_pago!: string; // 'EFECTIVO', 'TARJETA', 'MERCADOPAGO'

    // Nuevo: Si pagó con tarjeta, ¿en cuántas cuotas?
    @Property({ nullable: true, default: 1 })
    cuotas?: number;

    // Nuevo: Guardar el recargo o descuento explícito que se aplicó al total
    @Property({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    monto_descuento_recargo: number = 0;

    // --- ESTADO ---
    @Property({ default: 'ACTIVA' }) 
    estado!: string;

    // Relación: Una venta tiene muchos detalles (renglones)
    // 'cascade: [Cascade.ALL]' permite guardar la venta y sus detalles de una sola vez
    @OneToMany(() => DetalleVenta, detalle => detalle.venta, { cascade: [Cascade.ALL] })
    detalles = new Collection<DetalleVenta>(this);
}