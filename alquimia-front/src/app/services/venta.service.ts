import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Venta } from '../Interfaces/venta.interface';
import { environment } from '../../environments/environments'; // <--- Corregido (sin .prod)

export interface ItemVenta {
  id_producto: number;
  cantidad: number;
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
  cliente_nombre?: string;
  cliente_cuit?: string;
  cliente_direccion?: string;
  usuario_vendedor?: string;
  cuotas?: number;
  monto_descuento_recargo?: number;
  estado?: 'COBRADA' | 'PENDIENTE';
}

@Injectable({ providedIn: 'root' })
export class VentaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/ventas`;

  crear(venta: VentaRequest): Observable<any> {
    return this.http.post(this.apiUrl, venta);
  }

  getAll(page: number = 1, limit: number = 10, estado?: string, desde?: string, hasta?: string): Observable<PaginatedResponse<Venta>> {
    let params = new HttpParams()
      .set('page', page)
      .set('limit', limit);

    if (estado) params = params.set('estado', estado);
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);

    return this.http.get<PaginatedResponse<Venta>>(this.apiUrl, { params });
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
}