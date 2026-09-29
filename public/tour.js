// 聚焦式教學：每個頁面右上角的「？ 教學」。
//
// 用法（每頁一行）：Tour.mount({ anchor: 'header', steps: [...] })
//   step = { target: 'data-tour 的值', title: '標題', text: '說明', before: () => {} }
//   - 綁定一律用 data-tour，不用 id/class：UI 改版改掉 id/class 時教學才不會默默失效
//   - 找不到目標（被隱藏、還沒載入）就自動跳過那一步
//   - before：切到正確的分頁之類的準備動作
//
// 刻意不做遮罩：使用者常常邊看說明邊點，教學期間整個頁面照常可以操作。
// 只有卡片淡入 150ms，開啟「減少動態效果」時完全不動畫。
(function () {
  const CSS = `
    .tour-btn { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.35);
      border-radius: 16px; padding: 4px 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; }
    .tour-btn:hover { background: rgba(255,255,255,.25); }
    .tour-focus { outline: 3px solid #f2b53a !important; outline-offset: 4px; border-radius: 8px; }
    .tour-card { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 1000;
      width: calc(100% - 32px); max-width: 420px; background: #fff; color: #1b2420; border-radius: 14px;
      box-shadow: 0 10px 40px rgba(0,0,0,.25); padding: 16px 18px; font-size: 15px; line-height: 1.7;
      animation: tour-in 150ms ease-out; }
    .tour-card h4 { font-size: 16px; margin: 0 0 6px; color: #16513d; }
    .tour-card p { margin: 0; white-space: pre-line; }
    .tour-card .tour-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
    .tour-card .tour-count { color: #6b7670; font-size: 13px; margin-right: auto; }
    .tour-card button { border: none; border-radius: 10px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .tour-card .tour-next { background: #1f6f54; color: #fff; }
    .tour-card .tour-prev { background: #e8f2ed; color: #16513d; }
    .tour-card .tour-close { position: absolute; top: 8px; right: 10px; background: none; color: #6b7670; font-size: 18px; padding: 4px 8px; }
    @keyframes tour-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .tour-card { animation: none; } }
  `;

  let steps = [];
  let index = 0;
  let card = null;
  let focused = null;

  function findTarget(step) {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    // 被隱藏的元素（display:none、在收起來的分頁裡）就當作沒有
    return el && el.getClientRects().length > 0 ? el : null;
  }

  function clearFocus() {
    if (focused) focused.classList.remove('tour-focus');
    focused = null;
  }

  function end() {
    clearFocus();
    if (card) card.remove();
    card = null;
  }

  function show(i, dir) {
    if (i < 0) i = 0;
    if (i >= steps.length) return end();
    const step = steps[i];
    if (step.before) { try { step.before(); } catch (e) { /* 準備動作失敗就照樣找目標 */ } }
    const el = findTarget(step);
    if (!el) return show(i + (dir || 1), dir); // 找不到就跳過
    index = i;

    clearFocus();
    focused = el;
    el.classList.add('tour-focus');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });

    if (!card) {
      card = document.createElement('div');
      card.className = 'tour-card';
      card.setAttribute('role', 'dialog');
      document.body.appendChild(card);
    }
    const last = i === steps.length - 1;
    card.innerHTML = `
      <button class="tour-close" aria-label="結束教學">✕</button>
      <h4></h4><p></p>
      <div class="tour-row">
        <span class="tour-count">${i + 1} / ${steps.length}</span>
        ${i > 0 ? '<button class="tour-prev">上一步</button>' : ''}
        <button class="tour-next">${last ? '完成' : '下一步'}</button>
      </div>`;
    card.querySelector('h4').textContent = step.title;
    card.querySelector('p').textContent = step.text;
    card.querySelector('.tour-close').onclick = end;
    card.querySelector('.tour-next').onclick = () => show(i + 1, 1);
    const prev = card.querySelector('.tour-prev');
    if (prev) prev.onclick = () => show(i - 1, -1);
  }

  function mount({ anchor = 'header', steps: s = [] } = {}) {
    steps = s;
    if (!document.getElementById('tour-style')) {
      const style = document.createElement('style');
      style.id = 'tour-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const host = document.querySelector(anchor);
    if (!host || host.querySelector('.tour-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'tour-btn';
    btn.type = 'button';
    btn.textContent = '？ 教學';
    btn.onclick = () => { end(); show(0, 1); };
    host.appendChild(btn);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) end(); });
  window.Tour = { mount, start: () => show(0, 1), end };
})();
