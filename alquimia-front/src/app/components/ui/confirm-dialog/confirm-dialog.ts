import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService, ConfirmOptions } from '../../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.html'
})
export class ConfirmDialogComponent implements OnInit {
  private confirmService = inject(ConfirmService);
  
  isOpen = false;
  options!: ConfirmOptions & { resolve: Function };

  ngOnInit() {
    this.confirmService.confirmState$.subscribe((opts) => {
      this.options = opts;
      this.isOpen = true;
    });
  }

  respond(result: boolean) {
    this.isOpen = false;
    setTimeout(() => {
      if (this.options && this.options.resolve) {
        this.options.resolve(result);
      }
    }, 200); // Pequeño delay para la animación de cierre
  }
}