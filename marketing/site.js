const demo = document.querySelector('#demo');
if (demo) {
  const stage = document.querySelector('#demo-stage');
  const announce = document.querySelector('#demo-announcement');
  const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const button = (label, action, type = 'primary') => '<button type="button" class="button '+type+'" data-step="'+action+'">'+label+'</button>';
  let result = '';
  let feedback = '';
  const stages = {
    publish: () => '<p><strong>Treinador</strong> · Confirme a turma e publique a programação.</p><div class="demo-card"><h3>Semana da Turma Manhã</h3><p>Rodagem leve · 40 min · Ana Ribeiro</p><span class="pill review">Rascunho</span></div>'+button('Publicar semana','publish'),
    athlete: () => '<p><strong>Atleta</strong> · A semana de Ana está publicada. Registre a rodagem leve.</p><div class="demo-card"><h3>Rodagem leve · 40 min</h3><p>Turma Manhã · Ana Ribeiro</p><span class="pill">Publicado</span></div><form class="demo-form" id="record"><label for="outcome">Como foi o treino?</label><select id="outcome" name="outcome" required><option value="">Selecione</option><option>Concluído</option><option>Parcial</option><option>Não realizado</option></select><button class="button primary" type="submit">Enviar registro</button></form>',
    review: () => '<p><strong>Treinador</strong> · O registro de Ana chegou. Confira o resultado e responda.</p><div class="demo-card"><h3>Rodagem leve · Ana Ribeiro</h3><p>Previsto: 40 min · Resultado: '+escapeHtml(result)+'</p><span class="pill review">A revisar</span></div><form class="demo-form" id="reply"><label for="feedback">Feedback para Ana</label><textarea id="feedback" name="feedback" maxlength="240" rows="3" required placeholder="Ex.: Obrigado pelo registro, Ana."></textarea><button class="button primary" type="submit">Enviar feedback</button></form>',
    done: () => '<p><strong>Atleta</strong> · O retorno apareceu no treino de Ana.</p><div class="demo-card"><h3>Feedback do treinador</h3><p>'+escapeHtml(feedback)+'</p><span class="pill">Feedback enviado</span></div><div class="demo-footer">'+button('Recomeçar','reset','secondary')+'<button type="button" class="button primary" data-close-demo>Concluir demonstração</button></div>'
  };
  function render(step, message = '') {
    stage.innerHTML = stages[step]();
    if (message) {
      announce.textContent = message;
      stage.firstElementChild.tabIndex = -1;
      stage.firstElementChild.focus();
    }
  }
  function reset() {
    result = '';
    feedback = '';
    announce.textContent = '';
    render('publish');
  }
  document.querySelectorAll('[data-open-demo]').forEach(trigger => trigger.addEventListener('click', () => {
    reset();
    demo.showModal();
    demo.querySelector('#demo-title').focus();
  }));
  demo.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control) return;
    if (control.hasAttribute('data-close-demo')) demo.close();
    if (control.dataset.step === 'publish') render('athlete', 'Semana publicada.');
    if (control.dataset.step === 'reset') {
      reset();
      demo.querySelector('#demo-title').focus();
    }
  });
  demo.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    const values = new FormData(form);
    if (form.id === 'record') {
      result = values.get('outcome');
      render('review', 'Registro enviado.');
    }
    if (form.id === 'reply') {
      const field = form.elements.feedback;
      feedback = values.get('feedback').trim();
      if (!feedback) {
        field.setCustomValidity('Escreva uma resposta antes de enviar.');
        field.reportValidity();
        return;
      }
      render('done', 'Feedback enviado.');
    }
  });
  demo.addEventListener('input', event => {
    if (event.target.id === 'feedback') event.target.setCustomValidity('');
  });
}
