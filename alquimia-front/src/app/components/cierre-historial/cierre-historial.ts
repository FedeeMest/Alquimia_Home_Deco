import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CierreService } from '../../services/cierre.service';

@Component({
  selector: 'app-cierre-historial',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cierre-historial.html'
})
export class CierreHistorialComponent implements OnInit {
  private cierreService = inject(CierreService);
  private cd = inject(ChangeDetectorRef);
  
  // --- SOLUCIÓN DEL ERROR ---
  // Exponemos la función global "Number" como una propiedad de la clase
  // para que el HTML pueda usarla.
  Number = Number; 

  cierres: any[] = [];
  loading = true;
  expandedId: number | null = null; 

  ngOnInit() {
    this.cierreService.getHistorial().subscribe({
      next: (data) => {
        this.cierres = data;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  toggleExpand(id: number) {
    if (this.expandedId === id) {
      this.expandedId = null; 
    } else {
      this.expandedId = id; 
    }
  }
}