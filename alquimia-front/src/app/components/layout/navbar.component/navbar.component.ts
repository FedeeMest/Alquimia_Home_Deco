import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router,RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth.service'; //
import { ProductoService } from '../../../services/producto.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-navbar',
  standalone: true, // Asegúrate de que esto coincida con tu config (puede ser standalone: true o no, según tu versión)
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  authService = inject(AuthService);
  productoService = inject(ProductoService);
  notificationService = inject(NotificationService);
  router = inject(Router);
  
  isMobileMenuOpen = false;
  cargandoSync = false;

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  logout() {
    this.authService.logout();
    this.closeMobileMenu();
  }
  descargarPrecios() {
    // El confirm nativo está bien por ahora para asegurar la intención
    if (!confirm('¿Deseas descargar la lista de precios actual para usarla sin internet?')) return;

    this.cargandoSync = true;
    this.closeMobileMenu(); // Cerramos el menú para que vea la pantalla

    this.productoService.sincronizarDatosOffline().subscribe({
      next: (exito) => {
        this.cargandoSync = false;
        if (exito) {
          // ÉXITO: Usamos tu servicio con tipo 'success'
          this.notificationService.show('✅ Precios descargados correctamente. Modo Offline listo.', 'success');
        } else {
          // ERROR LÓGICO: Usamos tu servicio con tipo 'error'
          this.notificationService.show('⚠️ Hubo un problema al guardar. Verifica el espacio en tu celular.', 'error');
        }
      },
      error: () => {
        this.cargandoSync = false;
        // ERROR DE RED: Usamos tu servicio con tipo 'error'
        this.notificationService.show('❌ Error de conexión al intentar descargar.', 'error');
      }
    });
  }
}