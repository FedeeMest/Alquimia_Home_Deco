import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environments';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = `${environment.apiUrl}/auth`;
  
  // Signal para saber reactivamente si está logueado (útil para el Navbar)
  isLoggedIn = signal<boolean>(this.hasToken());
  currentUser = signal<string>('');

  constructor() {
    // Recuperar nombre si existe
    const storedName = localStorage.getItem('usuario_nombre');
    if (storedName) this.currentUser.set(storedName);
  }

  login(credentials: { username: string; password: string }) {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        // Guardar token y datos
        localStorage.setItem('token', response.token);
        localStorage.setItem('usuario_nombre', response.usuario.nombre);
        
        // Actualizar estado
        this.isLoggedIn.set(true);
        this.currentUser.set(response.usuario.nombre);
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario_nombre');
    this.isLoggedIn.set(false);
    this.currentUser.set('');
    this.router.navigate(['/login']);
  }

  private hasToken(): boolean {
    return !!localStorage.getItem('token'); // Devuelve true si hay token
  }
}