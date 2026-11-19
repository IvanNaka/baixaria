import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="page">
      <header class="page-head">
        <h1>Baixaria</h1>
        <p class="muted">Estudo de contrabaixo: exercícios curtos e repetidos para fixar o braço do baixo na memória.</p>
      </header>

      <div class="cards">
        <a class="card link-card" routerLink="/notas">
          <h2>Notas no braço</h2>
          <p>Identifique a nota de uma posição, encontre uma nota numa corda ou todas as suas ocorrências.</p>
        </a>
        <a class="card link-card" routerLink="/intervalos">
          <h2>Intervalos</h2>
          <p>Reconheça as formas dos intervalos no braço, toque-os a partir de uma tônica e treine o ouvido.</p>
        </a>
        <a class="card link-card" routerLink="/microfone">
          <h2>🎤 Tocar no baixo</h2>
          <p>Responda tocando o instrumento: afinador, toque a nota, intervalos e desafios cronometrados.</p>
        </a>
        <a class="card link-card" routerLink="/mapa">
          <h2>Mapa do braço</h2>
          <p>Consulte todas as notas ou os intervalos a partir de qualquer tônica. Clique para ouvir.</p>
        </a>
        <a class="card link-card" routerLink="/mapa" [queryParams]="{ ver: 'intervalos' }">
          <h2>Mapa de intervalos</h2>
          <p>Escolha uma tônica no braço e veja onde ficam terças, quintas, arpejos e escalas, com cores e formas.</p>
        </a>
        <a class="card link-card" routerLink="/estatisticas">
          <h2>Estatísticas</h2>
          <p>Veja sua precisão por nota, posição e intervalo, e descubra seus pontos fracos.</p>
        </a>
      </div>

      <div class="card tips">
        <h2>Como estudar</h2>
        <ul>
          <li>Ajuste a afinação, a notação (C D E… ou Dó Ré Mi…) e o som no topo da página.</li>
          <li>Faça sessões curtas (5–10 minutos) todos os dias — a regularidade vale mais que a duração.</li>
          <li>Restrinja a faixa de casas no início e amplie quando passar de ~90% de acerto.</li>
          <li>Tenha o baixo em mãos: toque cada resposta no instrumento enquanto responde.</li>
        </ul>
      </div>
    </section>
  `,
})
export class Inicio {}
