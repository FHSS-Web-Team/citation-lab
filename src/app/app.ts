import { Component } from '@angular/core';
import { LabComponent } from './components/lab/lab.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LabComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {}
