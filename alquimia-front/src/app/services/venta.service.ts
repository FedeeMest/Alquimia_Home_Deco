import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Venta } from '../Interfaces/venta.interface';
import { environment } from '../../environments/environment.prod'; // <--- Corregido (sin .prod)

export interface ItemVenta {
  id_producto: number;
  cantidad: number;
}

export interface VentaRequest {
  items: ItemVenta[];
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TARJETA_LOCAL';
  cliente_nombre?: string;
  cliente_cuit?: string;
  cliente_direccion?: string;
  usuario_vendedor?: string;
  cuotas?: number;
  monto_descuento_recargo?: number;
}

@Injectable({ providedIn: 'root' })
export class VentaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/ventas`;

  crear(venta: VentaRequest): Observable<any> {
    return this.http.post(this.apiUrl, venta);
  }

  getAll(): Observable<Venta[]> {
    return this.http.get<Venta[]>(this.apiUrl);
  }

  getOne(id: number): Observable<Venta> {
    return this.http.get<Venta>(`${this.apiUrl}/${id}`);
  }

  // --- NUEVA FUNCIÓN ---
  anular(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // 1. Para el Buscador por Fechas
  filtrarPorFechas(desde: string, hasta: string): Observable<any> {
    const params = new HttpParams()
      .set('desde', desde)
      .set('hasta', hasta);
    return this.http.get<any>(`${this.apiUrl}/reporte`, { params });
  }

  // 2. Para las Métricas (Dashboard)
  getMetricasDia(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/dashboard`);
  }
}