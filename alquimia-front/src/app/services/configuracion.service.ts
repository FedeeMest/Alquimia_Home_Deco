import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environments';

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/configuracion`;

  obtener(): Observable<any> { return this.http.get(this.apiUrl); }
  guardar(data: any): Observable<any> { return this.http.put(this.apiUrl, data); }
  aplicarMasivo(): Observable<any> { return this.http.post(`${this.apiUrl}/aplicar-todos`, {}); }
}