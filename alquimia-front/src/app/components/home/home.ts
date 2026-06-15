import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html'
})
export class HomeComponent implements OnInit {
  private title = inject(Title);
  private meta = inject(Meta);

  ngOnInit() {
    this.title.setTitle('Alquimia Home Deco | La esencia de tu casa');
    this.meta.updateTag({ name: 'description', content: 'Encontrá fragancias y textiles que llenan tu hogar de calidez, armonía y estilo. Entregas programadas en Rosario y Funes.' });
    
    this.meta.updateTag({ property: 'og:title', content: 'Alquimia Home Deco | La esencia de tu casa' });
    this.meta.updateTag({ property: 'og:description', content: 'Encontrá fragancias y textiles que llenan tu hogar de calidez, armonía y estilo. Entregas programadas en Rosario y Funes.' });
    
    // URL de Vercel aplicada acá:
    this.meta.updateTag({ property: 'og:image', content: 'https://alquimia-home-deco.vercel.app/assets/images/hero_house.jpg' });
    this.meta.updateTag({ property: 'og:url', content: 'https://alquimia-home-deco.vercel.app/' });
    
    this.meta.updateTag({ property: 'twitter:card', content: 'summary_large_image' });
  }
}