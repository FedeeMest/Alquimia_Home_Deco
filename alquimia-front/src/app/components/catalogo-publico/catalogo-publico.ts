import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent {
  // En el siguiente paso conectaremos esto al endpoint /public/catalogo
}