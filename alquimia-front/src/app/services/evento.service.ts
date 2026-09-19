import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.prod';

export type TipoEvento = 'vista' | 'carrito' | 'whatsapp';

@Injectable({ providedIn: 'root' })
export class EventoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/eventos`;

  // "Fire and forget": nunca debe interrumpir la experiencia del visitante,
  // por eso el error se absorbe en silencio acá mismo.
  registrar(productoId: number, tipo: TipoEvento): void {
    this.http.post(`${this.apiUrl}/registrar`, { productoId, tipo }).subscribe({
      error: () => { /* silencioso a propósito */ }
    });
  }

  getTopProductos(tipo: TipoEvento = 'vista', limit: number = 10): Observable<any> {
    const params = new HttpParams()
      .set('tipo', tipo)
      .set('limit', limit.toString());

    return this.http.get<any>(`${this.apiUrl}/top-productos`, { params });
  }
}