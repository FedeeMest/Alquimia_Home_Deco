import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Producto } from '../Interfaces/producto.interface';
import { environment } from '../../environments/environment.prod';

export interface ProductoResponse {
  data: Producto[];
  total: number;
  page: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class ProductoService {
  private http = inject(HttpClient);
  // Usamos la URL del entorno + la ruta específica
  private apiUrl = `${environment.apiUrl}/productos`; 

  constructor() { }

  getAll(buscar: string = '', activo: boolean = true, page: number = 1, limit: number = 10): Observable<ProductoResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('activo', activo.toString());

    if (buscar) params = params.set('buscar', buscar);

    return this.http.get<ProductoResponse>(this.apiUrl, { params });
  }

  getOne(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.apiUrl}/${id}`);
  }

  create(producto: Producto): Observable<Producto> {
    return this.http.post<Producto>(this.apiUrl, producto);
  }

  update(id: number, producto: Partial<Producto>): Observable<Producto> {
    return this.http.put<Producto>(`${this.apiUrl}/${id}`, producto);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  restaurar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/restaurar`, {});
  }

  fixPrecios() {
    return this.http.post(`${this.apiUrl}/fix-precios`, {});
  }

  updateGananciaMasiva(nuevaGanancia: number): Observable<any> {
  return this.http.put(`${this.apiUrl}/productos/actualizar-ganancias-masivo`, { nueva_ganancia: nuevaGanancia });
}
}