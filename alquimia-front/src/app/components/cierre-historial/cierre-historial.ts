import { Component, OnInit, inject } from '@angular/core';
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
  
  cierres: any[] = [];
  loading = true;
  expandedId: number | null = null; 

  ngOnInit() {
    this.cierreService.getHistorial().subscribe({
      next: (data) => {
        this.cierres = data;
        this.loading = false;
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