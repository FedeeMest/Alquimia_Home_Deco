import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment.prod';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/clientes`;

  // Se agregaron los parámetros para paginación y búsqueda
  // getClientes(page?: number, limit?: number, search?: string): Observable<any> {
  //   let params = new HttpParams();
    
  //   if (page) params = params.set('page', page.toString());
  //   if (limit) params = params.set('limit', limit.toString());
  //   if (search) params = params.set('search', search); 

  //   return this.http.get(this.apiUrl, { params });
  // }

  getClientes(page?: number, limit?: number, search?: string, tipo?: string, orden?: string): Observable<any> {
    let params = new HttpParams();
    
    if (page) params = params.set('page', page.toString());
    if (limit) params = params.set('limit', limit.toString());
    if (search) params = params.set('search', search); 
    if (tipo) params = params.set('tipo', tipo); 
    if (orden) params = params.set('orden', orden); 

    return this.http.get(this.apiUrl, { params });
  }

  getCliente(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  crearCliente(cliente: any): Observable<any> {
    return this.http.post(this.apiUrl, cliente);
  }

  actualizarCliente(id: number, cliente: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, cliente);
  }

  // NUEVA FUNCIÓN PARA ELIMINAR
  eliminarCliente(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
