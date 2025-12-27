import { Component, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar.component/navbar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, CommonModule],
  templateUrl: `./main-layout.html`
})
export class MainLayoutComponent {
  // Recuperamos la lógica del menú móvil
  @ViewChild(NavbarComponent) navbar!: NavbarComponent;

  toggleMobileMenu() {
    this.navbar.toggleMobileMenu();
  }
}