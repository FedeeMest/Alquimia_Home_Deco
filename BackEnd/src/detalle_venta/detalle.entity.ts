import { Entity, ManyToOne, Property, PrimaryKey } from "@mikro-orm/core";
// CAMBIO 1: Usamos 'import type' para importar solo la definición, no el valor
import type { Venta } from "../ventas/venta.entity.js"; 
import { Producto } from "../productos/producto.entity.js";

@Entity()
export class DetalleVenta {
    @PrimaryKey()
    id!: number;

    // CAMBIO 2: En lugar de pasar la clase Venta directamente (() => Venta),
    // pasamos el nombre como string ('Venta'). Esto evita el error de inicialización.
    @ManyToOne('Venta') 
    venta!: Venta;

    @ManyToOne(() => Producto)
    producto!: Producto;

    @Property()
    cantidad!: number;

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_unitario_historico!: number; 

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    subtotal!: number; 
}