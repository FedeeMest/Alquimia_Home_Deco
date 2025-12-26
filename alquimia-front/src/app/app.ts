import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common'; // <--- Importante para *ngIf
import { RouterOutlet, Router, NavigationEnd } from '@angular/router'; // <--- Importamos Router
import { NavbarComponent } from '../app/components/layout/navbar.component/navbar.component';
import { ToastComponent } from '../app/components/ui/toast/toast';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ToastComponent], // <--- Agregamos CommonModule
  templateUrl: './app.html',
  styleUrl: './app.css' // Asegúrate de que sea styleUrl (singular) o styleUrls (plural) según tu versión, tu código tenía styleUrl
})
export class App {
  title = 'alquimia-front';
  
  // Variable para controlar la visibilidad
  showNavbar = true; 

  private router = inject(Router);

  @ViewChild(NavbarComponent) navbar!: NavbarComponent;

  constructor() {
    // Escuchamos los cambios de ruta
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // Si la URL es '/login', ocultamos el navbar
      this.showNavbar = event.urlAfterRedirects !== '/login';
    });
  }

  toggleMobileMenu() {
    this.navbar.toggleMobileMenu();
  }
}