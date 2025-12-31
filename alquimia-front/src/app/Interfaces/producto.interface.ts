export type TipoAjuste = 'DESCUENTO' | 'RECARGO' | 'NINGUNO';

export interface Producto {
  id?: number; // Opcional al crear, obligatorio al leer
  codigo_barra?: string;
  codigo_proveedor?: string;
  nombre: string;
  proveedor?: string;
  categoria?: string;

  // Base Económica
  precio_compra: number; // En tu entity está como string, cuidado con las conversiones
  tiene_iva: boolean;
  precio_costo: number;
  ganancia: number;
  

  // Ajustes
  ajuste_efectivo_tipo: TipoAjuste;
  ajuste_efectivo_valor: number;
  
  ajuste_tarjeta_tipo: TipoAjuste;
  ajuste_tarjeta_valor: number;

  ajuste_tarjeta_local_tipo: TipoAjuste;
  ajuste_tarjeta_local_valor: number;

  // Precios Calculados (Solo lectura generalmente desde el front)
  precio_venta_base?: number;
  precio_efectivo?: number;
  precio_tarjeta?: number;
  precio_tarjeta_local?: number;

  stock: number;
  stock_minimo: number;
  
  fecha_creacion?: Date;
  fecha_actualizacion?: Date;
}