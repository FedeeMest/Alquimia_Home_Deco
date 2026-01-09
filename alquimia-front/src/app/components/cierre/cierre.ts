import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CierreService } from '../../services/cierre.service';
import { NotificationService } from '../../services/notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cierre-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre.html'
})
export class CierreCajaComponent implements OnInit {
  private cierreService = inject(CierreService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  fechaHoy = new Date();
  datosSistema: any = null;
  
  // Inputs del usuario
  efectivoReal: number | null = null;
  tarjetaReal: number | null = null;
  observaciones = '';

  // Calculados
  diferencia = 0;
  diferenciaTarjeta = 0;
  procesando = false;

  ngOnInit() {
    this.cargarDatosSistema();
    this.cd.detectChanges();
  }

  cargarDatosSistema() {
    this.cierreService.previsualizar().subscribe({
      next: (data) => {
        this.datosSistema = data;
        // Opcional: pre-cargar tarjeta real con lo del sistema si confías en los cupones
        // this.tarjetaReal = data.sistema_tarjeta; 
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al cargar datos del sistema', 'error');
      }
    });
  }

  calcularDiferencia() {
    if (!this.datosSistema) return;
    
    // Diferencia se basa principalmente en efectivo
    const efectivoSistema = Number(this.datosSistema.sistema_efectivo) || 0;
    const efectivoReal = Number(this.efectivoReal) || 0;
    
    this.diferencia = efectivoReal - efectivoSistema;
    this.cd.detectChanges();

    if (this.tarjetaReal !== null) {
        const tarjetaSistema = Number(this.datosSistema.sistema_tarjeta) || 0;
        const tarjetaReal = Number(this.tarjetaReal) || 0;
        this.diferenciaTarjeta = tarjetaReal - tarjetaSistema;
        this.cd.detectChanges();
    } else {
        this.diferenciaTarjeta = 0;
    }
  }

  confirmarCierre() {
    if (this.efectivoReal === null) {
      this.notificationService.show('Debes ingresar el efectivo contado', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de cerrar la caja? Esta acción no se puede deshacer.')) return;

    this.procesando = true;
    const payload = {
      ...this.datosSistema, // Incluye lo que dijo el sistema
      real_efectivo: this.efectivoReal,
      real_tarjeta: this.tarjetaReal,
      observaciones: this.observaciones,
      usuario: 'Admin' // Aquí podrías sacar el usuario real del Auth
    };

    this.cierreService.cerrar(payload).subscribe({
      next: () => {
        this.notificationService.show('Caja cerrada correctamente', 'success');
        this.router.navigate(['/dashboard']); // O a donde prefieras
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al guardar cierre', 'error');
        this.procesando = false;
      }
    });
  }
}