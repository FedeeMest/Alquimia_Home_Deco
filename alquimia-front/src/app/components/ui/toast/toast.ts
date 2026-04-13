import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.html',   // <--- Apunta al HTML
  styleUrl: './toast.css'        // <--- Apunta al CSS
})
export class ToastComponent {
  notificationService = inject(NotificationService);
}