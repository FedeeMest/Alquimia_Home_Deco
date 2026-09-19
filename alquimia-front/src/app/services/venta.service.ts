import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Venta } from '../Interfaces/venta.interface';
import { environment } from '../../environments/environment.prod';

export interface ItemVenta {
  id_producto: number;
  cantidad: number;
  precio_modificado?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface VentaRequest {
  items: ItemVenta[];
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TARJETA_LOCAL';
  cliente_id?: number | null;
  usuario_vendedor?: string;
  cuotas?: number;
  fecha?: string;
  monto_descuento_recargo?: number;
  estado?: 'COBRADA' | 'PENDIENTE';
  observaciones?: string;
}

@Injectable({ providedIn: 'root' })
export class VentaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/ventas`;

  crear(venta: VentaRequest): Observable<any> {
    return this.http.post(this.apiUrl, venta);
  }

  getAll(page: number, limit: number, estado?: string, desde?: string, hasta?: string, cliente_id?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
      
    if (estado) params = params.set('estado', estado);
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    if (cliente_id) params = params.set('cliente_id', cliente_id); // Enviamos la feria a filtrar

    return this.http.get(this.apiUrl, { params });
  }

  getOne(id: number): Observable<Venta> {
    return this.http.get<Venta>(`${this.apiUrl}/${id}`);
  }

  // --- NUEVA FUNCIÓN ---
  anular(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  cobrar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/cobrar`, {});
  }


  // 2. Para las Métricas (Dashboard)
  getMetricasDia(fecha?: string, page: number = 1, limit: number = 5): Observable<any> {
    let params = new HttpParams()
        .set('page', page)
        .set('limit', limit);

    if (fecha) {
        params = params.set('fecha', fecha);
    }

    return this.http.get<any>(`${this.apiUrl}/dashboard`, { params });
  }
  update(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  // 3. Para Estadísticas Generales (Top productos y ventas por mes)
  getEstadisticas(limit: number = 10, desde?: string, hasta?: string, clienteId?: number): Observable<any> {
    let params = new HttpParams().set('limit', limit.toString());
    if (desde) params = params.set('fechaDesde', desde);
    if (hasta) params = params.set('fechaHasta', hasta);
    if (clienteId) params = params.set('clienteId', clienteId.toString());

    return this.http.get<any>(`${this.apiUrl}/estadisticas`, { params });
  }

  getVentasPorMes(meses: number = 12): Observable<any> {
    const params = new HttpParams().set('meses', meses.toString());
    return this.http.get<any>(`${this.apiUrl}/estadisticas/mensual`, { params });
  }

  getCobranzas(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/cobranzas`);
  }

  getGananciasPorFeria(desde?: string, hasta?: string): Observable<any> {
    let params = new HttpParams();
    if (desde) params = params.set('fechaDesde', desde);
    if (hasta) params = params.set('fechaHasta', hasta);

    return this.http.get<any>(`${this.apiUrl}/ganancias-feria`, { params });
  }
}