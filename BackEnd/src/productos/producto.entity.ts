import { Entity , Property, PrimaryKey, BeforeCreate, BeforeUpdate} from "@mikro-orm/core";

export type TipoAjuste = 'DESCUENTO' | 'RECARGO' | 'NINGUNO';


@Entity()
export class Producto {

    @PrimaryKey()
    id!: number;

    // --- IDENTIFICACIÓN ---
    @Property({ nullable: true, unique: true })
    codigo_barra?: string;

    @Property({ nullable: false })
    nombre!: string;

    @Property({ nullable: true })
    proveedor?: string;

    @Property({ nullable: true })
    categoria?: string;

    @Property()
    activo: boolean = true;

    // --- BASE ECONÓMICA ---
    // Este es el valor que escribes en el formulario (Input)
    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_compra!: number;

    @Property()
    tiene_iva: boolean = false;

    // Este lo usamos para cálculos internos
    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_costo!: number;

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    ganancia!: number;

    // --- CONFIGURACIÓN DE AJUSTES ---
    // 1. Efectivo
    @Property()
    ajuste_efectivo_tipo: string = 'DESCUENTO'; 

    @Property({ type: 'decimal', precision: 5, scale: 2 })
    ajuste_efectivo_valor!: number;

    // 2. Tarjeta
    @Property()
    ajuste_tarjeta_tipo: string = 'RECARGO';

    @Property({ type: 'decimal', precision: 5, scale: 2 })
    ajuste_tarjeta_valor!: number;

    // 3. Tarjeta Local

    @Property()
    ajuste_tarjeta_local_tipo: string = 'RECARGO';

    @Property({ type: 'decimal', precision: 5, scale: 2 })
    ajuste_tarjeta_local_valor!: number;


    // --- PRECIOS CALCULADOS ---
    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_venta_base!: number;

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_efectivo!: number;

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_tarjeta!: number;

    @Property({ type: 'decimal', precision: 10, scale: 2 })
    precio_tarjeta_local!: number;

    // --- AUDITORÍA Y STOCK ---
    @Property({ onCreate: () => new Date() })
    fecha_creacion = new Date();

    @Property({ onUpdate: () => new Date() })
    fecha_actualizacion = new Date();

    @Property({ nullable: false, default: 0 })
    stock!: number;

    @Property({ nullable: false, default: 0 })
    stock_minimo!: number; 


    @BeforeCreate()
    @BeforeUpdate()
    async calcularPrecios() {
        // 1. COSTO (Costo1 + IVA si corresponde)
        let costo = Number(this.precio_compra) || 0;
        if (this.tiene_iva) costo *= 1.21;
        
        this.precio_costo = Number(costo.toFixed(2));

        // 2. PRECIO BASE (Usando MARGEN / DIVISIÓN)
        // IMPORTANTE: Aquí estaba el error. Antes multiplicabas (*), ahora debes dividir (/)
        const gananciaNum = Number(this.ganancia); 
        const porcentaje = gananciaNum / 100;
        
        let precioBaseCalculado = 0;
        
        // Fórmula del Excel: Costo / (1 - %Ganancia)
        // Si ganancia es 40% (0.4), dividimos por 0.6
        if (porcentaje >= 1) {
            precioBaseCalculado = costo * 2; // Protección contra división por cero
        } else {
            precioBaseCalculado = costo / (1 - porcentaje);
        }

        // 3. REDONDEO TIPO EXCEL (Hacia arriba al mil más cercano)
        // Esto transformará los $11.817,66 en $12.000
        this.precio_venta_base = this.redondearComoExcel(precioBaseCalculado);

        // 4. PRECIOS FINALES (Efectivo/Tarjeta)
        this.precio_efectivo = this.aplicarRegla(
            this.precio_venta_base, 
            this.ajuste_efectivo_tipo, 
            Number(this.ajuste_efectivo_valor)
        );

        this.precio_tarjeta = this.aplicarRegla(
            this.precio_venta_base, 
            this.ajuste_tarjeta_tipo, 
            Number(this.ajuste_tarjeta_valor)
        );

        this.precio_tarjeta_local = this.aplicarRegla(
            this.precio_venta_base, 
            this.ajuste_tarjeta_local_tipo, 
            Number(this.ajuste_tarjeta_local_valor)
        );
    }

    private aplicarRegla(base: number, tipo: string, valor: number): number {
        let resultado = base;
        if (tipo === 'DESCUENTO') resultado = base * (1 - valor/100);
        if (tipo === 'RECARGO') resultado = base * (1 + valor/100);
        
        return this.redondearComoExcel(resultado);
    }

    // Lógica de Redondeo separada (Igual a REDONDEAR.MAS(x; -3))
    private redondearComoExcel(valor: number): number {
        return Math.ceil(valor / 1000) * 1000;
    }


}