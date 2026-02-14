import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { Venta } from '../../Interfaces/venta.interface';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-venta-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './venta-detalle.html'
})
export class VentaDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private ventaService = inject(VentaService);
  private cd = inject(ChangeDetectorRef);
  private notificationService = inject(NotificationService);

  venta?: Venta;
  loading = true;

  editandoNotas = false;
  notasCache = '';

  // Variables para la navegación dinámica
  volverUrl = '/ventas'; 
  volverTexto = 'Volver al listado';

  ngOnInit() {
    // 1. DETECTAR ORIGEN PARA CAMBIAR EL BOTÓN VOLVER
    const origen = this.route.snapshot.queryParamMap.get('origen');
    
    if (origen === 'dashboard') {
        this.volverUrl = '/metricas'; // URL del Dashboard (Home)
        this.volverTexto = 'Volver al Dashboard';
    }

    // 2. CARGAR VENTA
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.ventaService.getOne(id).subscribe({
        next: (data) => {
          this.venta = data;
          this.loading = false;
          this.cd.detectChanges();
        },
        error: (err) => console.error(err)
      });
    }
  }

  toggleEdicionNotas() {
    this.editandoNotas = !this.editandoNotas;
    if (this.editandoNotas && this.venta) {
      // Copiamos el texto actual para editarlo
      this.notasCache = this.venta.observaciones || '';
    }
  }
  guardarNotas() {
    if (!this.venta) return;

    this.ventaService.update(this.venta.id, { observaciones: this.notasCache }).subscribe({
      next: () => {
        this.venta!.observaciones = this.notasCache; // Actualizamos la vista
        this.editandoNotas = false;
        this.notificationService.show('Nota guardada correctamente', 'success');
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al guardar nota', 'error');
      }
    });
  }
}