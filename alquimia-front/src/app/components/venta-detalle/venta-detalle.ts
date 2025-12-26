import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { Venta } from '../../Interfaces/venta.interface';

@Component({
  selector: 'app-venta-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './venta-detalle.html'
})
export class VentaDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private ventaService = inject(VentaService);
  private cd = inject(ChangeDetectorRef);

  venta?: Venta;
  loading = true;

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
}