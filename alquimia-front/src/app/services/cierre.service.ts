import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CierreService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/cierre_caja`; // Asegúrate de crear la ruta en backend

  previsualizar(): Observable<any> {
    return this.http.get(`${this.apiUrl}/previsualizar`);
  }

  cerrar(datos: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/cerrar`, datos);
  }
  
  getHistorial(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}`);
  }
}