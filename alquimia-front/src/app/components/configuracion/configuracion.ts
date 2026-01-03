import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core'; // <--- 1. Importar ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../services/configuracion.service';
import { NotificationService } from '../../services/notification.service';
import { ProductoService } from '../../services/producto.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html'
})
export class ConfiguracionComponent implements OnInit {
  private configService = inject(ConfiguracionService);
  private notification = inject(NotificationService);
  private cd = inject(ChangeDetectorRef); // <--- 2. Inyectar el detector
  private productoService = inject(ProductoService)

  loadingFix = false;
  gananciaMasiva: number | null = null;
  loadingMasivo: boolean = false;
  
  config: any = { porcentaje_efectivo: 0, porcentaje_tarjeta: 0, porcentaje_local: 0 };

  ngOnInit() {
    this.configService.obtener().subscribe({
      next: (res) => {
        this.config = res;
        this.cd.detectChanges(); // <--- 3. Forzar la actualización aquí
      },
      error: (err) => {
        console.error(err);
        this.notification.show('Error al cargar configuración', 'error');
      }
    });
  }

  guardar() {
    this.configService.guardar(this.config).subscribe({
      next: () => this.notification.show('Configuración guardada', 'success'),
      error: () => this.notification.show('Error al guardar', 'error')
    });
  }

  aplicarATodos() {
    if(confirm('¿Seguro? Esto recalculará el precio de TODOS los productos usando estos porcentajes.')) {
      this.configService.aplicarMasivo().subscribe({
        next: (res: any) => this.notification.show(res.message, 'success'),
        error: () => this.notification.show('Error en actualización', 'error')
      });
    }
  }

  aplicarGananciaMasiva() {
    if (this.gananciaMasiva === null || this.gananciaMasiva < 0) {
      this.notification.show('Ingresa un porcentaje válido', 'error');
      return;
    }

    // Confirmación de seguridad (¡Muy importante!)
    if (!confirm(`⚠️ PRECAUCIÓN: \n\nEsto cambiará el precio de TODOS los productos usando una ganancia del ${this.gananciaMasiva}%. \n\n¿Estás seguro de continuar?`)) {
      return;
    }

    this.loadingMasivo = true;
    this.productoService.updateGananciaMasiva(this.gananciaMasiva).subscribe({
      next: (res: any) => {
        this.notification.show(res.message, 'success');
        this.loadingMasivo = false;
        this.gananciaMasiva = null; // Limpiamos el input
      },
      error: (err) => {
        console.error(err);
        this.notification.show('Error al actualizar precios', 'error');
        this.loadingMasivo = false;
      }
    });
  }

  recalcularPrecios() {
    if (!confirm('¿Estás seguro? Esto recalculará los precios de TODOS los productos basándose en su costo y ganancia.')) {
      return;
    }

    this.loadingFix = true;
    this.productoService.fixPrecios().subscribe({
      next: (resp: any) => {
        this.notification.show(`Éxito: ${resp.productos_actualizados} productos actualizados`, 'success');
        this.loadingFix = false;
      },
      error: (err) => {
        console.error(err);
        this.notification.show('Error al recalcular precios', 'error');
        this.loadingFix = false;
      }
    });
  }
}