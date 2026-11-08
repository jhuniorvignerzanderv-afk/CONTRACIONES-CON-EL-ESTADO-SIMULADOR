(function () {
  const STORAGE_KEY = 'OECE_CERT_STATE_2026_V1';

  const defaultState = {
    userName: 'JHUNIOR VARGAS GORDON',
    targetLevel: 'Intermedio', // Básico (58%), Intermedio (70%), Avanzado (80%)
    theme: 'dark',
    darkForcedV2: true,
    modulesCompleted: {}, // { M1: true, ... }
    answered: {}, // { [qid]: { selected: 'B', isCorrect: true, attempts: 1 } }
    bookmarks: {}, // { [qid]: true }
    notes: {}, // { [qid]: 'Mi apunte personal' }
    examHistory: [], // [{ id, date, mode, total, correct, scorePct, levelAchieved, durationSec }]
    topesLabScore: { solved: 0, correct: 0 },
    trainerFilter: {
      module: 'ALL',
      status: 'ALL',
      search: '',
      hideDuplicates: false,
      currentIndex: 0
    },
    activeAcademyModule: 'M1',
    flashcardIndex: 0,
    flashcardFlipped: false
  };

  let state = loadState();
  let activeExam = null;
  let examTimerInterval = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      const parsed = JSON.parse(raw);
      if (!parsed.darkForcedV2) {
        parsed.theme = 'dark';
        parsed.darkForcedV2 = true;
      }
      return Object.assign({}, defaultState, parsed, {
        trainerFilter: Object.assign({}, defaultState.trainerFilter, parsed.trainerFilter || {})
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Error guardando estado:', e);
    }
    updateSidebarMetrics();
  }

  function getLevelThreshold(level) {
    if (level === 'Básico') return 58;
    if (level === 'Avanzado') return 80;
    return 70; // Intermedio
  }

  function evaluateCertLevel(pct) {
    if (pct >= 80) return 'Avanzado';
    if (pct >= 70) return 'Intermedio';
    if (pct >= 58) return 'Básico';
    return 'En Proceso';
  }

  function computeGlobalStats() {
    const questions = window.OECE_QUESTIONS || [];
    const totalQ = questions.length;
    const answeredIds = Object.keys(state.answered);
    const totalAnswered = answeredIds.length;
    let totalCorrect = 0;
    let totalWrong = 0;

    answeredIds.forEach(id => {
      if (state.answered[id] && state.answered[id].isCorrect) totalCorrect++;
      else totalWrong++;
    });

    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const coverage = totalQ > 0 ? Math.round((totalAnswered / totalQ) * 100) : 0;
    const modDoneCount = Object.keys(state.modulesCompleted).filter(k => state.modulesCompleted[k]).length;
    const modPct = Math.round((modDoneCount / 8) * 100);

    // Readiness combines coverage (40%), accuracy (40%), and modules studied (20%)
    const readiness = Math.min(100, Math.round(coverage * 0.4 + accuracy * 0.4 + modPct * 0.2));

    return {
      totalQ,
      totalAnswered,
      totalCorrect,
      totalWrong,
      accuracy,
      coverage,
      modDoneCount,
      readiness,
      bookmarksCount: Object.keys(state.bookmarks).filter(k => state.bookmarks[k]).length
    };
  }

  function updateSidebarMetrics() {
    const stats = computeGlobalStats();
    const pctEl = document.getElementById('sidebarReadinessPct');
    const fillEl = document.getElementById('sidebarReadinessFill');
    const badgeTrainer = document.getElementById('navBadgeTrainer');
    const badgeCert = document.getElementById('navBadgeCert');

    if (pctEl) pctEl.textContent = `${stats.readiness}%`;
    if (fillEl) fillEl.style.width = `${stats.readiness}%`;
    if (badgeTrainer) badgeTrainer.textContent = `${stats.totalAnswered}/${stats.totalQ}`;
    if (badgeCert) badgeCert.textContent = state.examHistory.length;

    const topStatsPill = document.getElementById('topStatsPill');
    if (topStatsPill) {
      topStatsPill.innerHTML = `✅ <strong>${stats.totalCorrect}</strong> dominadas · 🎯 Precisión: <strong>${stats.accuracy}%</strong>`;
    }
  }

  // NAVIGATION
  window.switchView = function (viewId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (btn) btn.classList.add('active');

    const mobBtn = document.querySelector(`.mob-nav-btn[data-mob-view="${viewId}"]`);
    if (mobBtn) mobBtn.classList.add('active');

    // Close mobile sidebar if open
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('open');

    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'academy') renderAcademy();
    if (viewId === 'trainer') renderTrainer();
    if (viewId === 'topes') renderTopesSimulator();
    if (viewId === 'tools') renderTools();
    if (viewId === 'flashcards') renderFlashcards();
    if (viewId === 'simulator') renderSimulator();
    if (viewId === 'certificate') renderCertificate();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. DASHBOARD
  function renderDashboard() {
    const stats = computeGlobalStats();
    const threshold = getLevelThreshold(state.targetLevel);
    const modules = window.OECE_MODULES || [];
    const questions = window.OECE_QUESTIONS || [];

    const container = document.getElementById('dashboardContent');
    if (!container) return;

    let moduleCardsHtml = modules.map(m => {
      const mQuestions = questions.filter(q => q.module === m.id);
      const mAnswered = mQuestions.filter(q => state.answered[q.id]);
      const mCorrect = mQuestions.filter(q => state.answered[q.id] && state.answered[q.id].isCorrect);
      const pct = mQuestions.length > 0 ? Math.round((mCorrect.length / mQuestions.length) * 100) : 0;
      const isRead = !!state.modulesCompleted[m.id];

      return `
        <div class="module-card">
          <div>
            <div class="module-card-top">
              <div class="module-badge-icon" style="background:${m.color}">${m.icon}</div>
              <div>
                <div class="module-code">${m.code} ${isRead ? '· ✅ Teoría Leída' : ''}</div>
                <h3>${m.title}</h3>
              </div>
            </div>
            <p class="module-desc">${m.summary}</p>
          </div>
          <div>
            <div class="module-progress-row">
              <div class="module-progress-meta">
                <span>Dominio: <strong>${mCorrect.length}/${mQuestions.length}</strong> preguntas</span>
                <span><strong>${pct}%</strong></span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%; background:${m.color}"></div>
              </div>
            </div>
            <div class="module-actions">
              <button class="btn btn-outline btn-sm" style="flex:1" onclick="openAcademyModule('${m.id}')">
                📖 Explicación Teórica
              </button>
              <button class="btn btn-primary btn-sm" style="flex:1" onclick="practiceModule('${m.id}')">
                ✍️ Practicar (${mQuestions.length})
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="hero-banner">
        <div style="display:inline-block; background:rgba(251,191,36,0.2); color:#fde68a; padding:4px 12px; border-radius:99px; font-size:0.78rem; font-weight:700; margin-bottom:10px;">
          🏛️ PLATAFORMA INTEGRAL DE CERTIFICACIÓN OECE 2026 · LEY N° 32069 & D.S. N° 009-2025-EF
        </div>
        <h1>¡Bienvenido, ${escapeHtml(state.userName)}! Prepárate y Certifícate en el OECE</h1>
        <p>
          Aprende paso a paso con <strong>explicaciones normativas didácticas</strong> de los 8 módulos de la nueva Ley General de Contrataciones Públicas, entrena con las <strong>405 preguntas oficiales explicadas del Balotario Master 2026</strong> y rinde <strong>simulacros cronometrados</strong> para asegurar tu certificación en el nivel <strong>${state.targetLevel} (meta: ≥ ${threshold}%)</strong>.
        </p>
        <div class="hero-actions">
          <button class="btn btn-gold" onclick="switchView('academy')">
            📚 1. Aprender con Explicaciones (8 Módulos)
          </button>
          <button class="btn btn-primary" style="background:#10b981" onclick="switchView('trainer')">
            🧠 2. Entrenar con Preguntas (${stats.totalQ})
          </button>
          <button class="btn btn-primary" style="background:#8b5cf6" onclick="switchView('topes')">
            🎯 3. Simulador de Topes y Casuísticas
          </button>
          <button class="btn btn-primary" style="background:#0284c7" onclick="switchView('simulator'); startExam(35, 50, 'EXTERNAL_SIM', '🌐 Simulacro Portales Externos OECE / SICAN 2026')">
            🌐 4. Simulacro Fijas Portales Externos OECE
          </button>
          <button class="btn btn-outline" style="background:rgba(255,255,255,0.12); color:#fff; border-color:rgba(255,255,255,0.3)" onclick="switchView('simulator')">
            ⏱️ 5. Simulacro Oficial OECE (72 preg.)
          </button>
          <button class="btn btn-outline" style="background:rgba(239,68,68,0.22); color:#fca5a5; border-color:rgba(239,68,68,0.45)" onclick="switchView('simulator'); startExam(15, 25, 'ALL', '🔥 Reto Muerte Súbita (15 Sin Errores)', true)">
            🔥 5. Reto Muerte Súbita (Sin Errores)
          </button>
          <button class="btn btn-outline" style="background:rgba(56,189,248,0.2); color:#bae6fd; border-color:rgba(56,189,248,0.45)" onclick="openPocketSummary()">
            📄 6. Mi Resumen PDF de Bolsillo (1 Hoja)
          </button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--primary-light); color:var(--primary)">📊</div>
          <div>
            <div class="stat-value">${stats.totalAnswered} <span style="font-size:0.95rem; color:var(--text-muted); font-weight:500">/ ${stats.totalQ}</span></div>
            <div class="stat-label">Preguntas Practicadas (${stats.coverage}% del balotario)</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-light); color:var(--success)">🎯</div>
          <div>
            <div class="stat-value">${stats.accuracy}%</div>
            <div class="stat-label">Efectividad Global (${stats.totalCorrect} aciertos / ${stats.totalWrong} por reforzar)</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-light); color:#b45309">📚</div>
          <div>
            <div class="stat-value">${stats.modDoneCount} <span style="font-size:0.95rem; color:var(--text-muted); font-weight:500">/ 8</span></div>
            <div class="stat-label">Módulos Teóricos Estudiados</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#f3e8ff; color:#7c3aed">🎓</div>
          <div>
            <div class="stat-value">${evaluateCertLevel(stats.accuracy && stats.totalAnswered >= 20 ? stats.accuracy : stats.readiness)}</div>
            <div class="stat-label">Nivel Proyectado OECE (Meta: ${state.targetLevel} ≥ ${threshold}%)</div>
          </div>
        </div>
      </div>

      ${stats.totalWrong > 0 ? (() => {
        const wrongList = (window.OECE_QUESTIONS || []).filter(q => state.answered[q.id] && !state.answered[q.id].isCorrect).slice(0, 6);
        return `
          <div style="background:var(--danger-light); border:1px solid var(--danger); border-radius:var(--radius-md); padding:18px 20px; margin-bottom:26px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
              <div>
                <strong style="color:var(--danger); font-size:1.02rem;">📌 Bitácora «Para Tener en Cuenta la Próxima Vez»: Tienes ${stats.totalWrong} pregunta(s) por reforzar</strong>
                <div style="font-size:0.85rem; color:var(--text-secondary)">Aquí tienes el resumen directo de tus errores recientes (qué marcaste vs. cuál era la respuesta correcta):</div>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" style="background:var(--danger)" onclick="practiceMistakes()">
                  🔁 Entrenar mis ${stats.totalWrong} errores →
                </button>
                <button class="btn btn-gold btn-sm" onclick="switchView('simulator'); startExam(Math.min(${stats.totalWrong}, 20), 25, 'MISTAKES_ONLY', 'Simulacro de Refuerzo de Mis Errores')">
                  ⚡ Simulacro de Mis Errores
                </button>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:10px;">
              ${wrongList.map(wq => {
                const uSel = state.answered[wq.id].selected;
                const wOpt = (wq.options || []).find(o => o.letter === uSel);
                const cOpt = (wq.options || []).find(o => o.letter === wq.correct);
                return `
                  <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-left:4px solid #ef4444; border-radius:8px; padding:10px 12px; font-size:0.82rem;">
                    <div style="font-weight:700; color:var(--text-main); margin-bottom:4px;">#${wq.id}: ${escapeHtml(wq.question.slice(0, 95))}${wq.question.length > 95 ? '...' : ''}</div>
                    <div style="color:#f87171; margin-bottom:2px;">❌ <strong>Marcaste (${uSel}):</strong> ${escapeHtml(wOpt ? wOpt.text.slice(0, 70) : '')}</div>
                    <div style="color:#34d399;">✅ <strong>Ten en cuenta (${wq.correct}):</strong> ${escapeHtml(cOpt ? cOpt.text.slice(0, 80) : '')}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })() : ''}

      <div class="section-header">
        <div>
          <h2 class="section-title">🚦 Semáforo Oficial SICAN: Tu Dominio en las 3 Fases del Examen (72 Preguntas)</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">El examen oficial del OECE se divide en 3 fases. Identifica cuál es tu fase más débil y refuérzala con 1 clic:</p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="exportProgressCode()">
            📲 Copiar Progreso para mi Celular
          </button>
          <button class="btn btn-outline btn-sm" onclick="importProgressCode()">
            📥 Pegar Progreso desde otro dispositivo
          </button>
        </div>
      </div>

      ${(() => {
        const phases = [
          {
            name: 'Fase 1: Actuaciones Preparatorias y Marco General',
            weight: '25 preguntas en el examen oficial',
            mods: ['M1', 'M2'],
            color: '#38bdf8'
          },
          {
            name: 'Fase 2: Procedimientos de Selección e Impugnación',
            weight: '22 preguntas en el examen oficial',
            mods: ['M3', 'M8'],
            color: '#fbbf24'
          },
          {
            name: 'Fase 3: Ejecución Contractual, Obras, JPRD y Sanciones',
            weight: '25 preguntas en el examen oficial',
            mods: ['M4', 'M5', 'M6', 'M7'],
            color: '#34d399'
          }
        ];

        return `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; margin-bottom:28px;">
            ${phases.map(ph => {
              const phQs = questions.filter(q => ph.mods.includes(q.module));
              const phAns = phQs.filter(q => state.answered[q.id]);
              const phOk = phQs.filter(q => state.answered[q.id] && state.answered[q.id].isCorrect);
              const phAcc = phAns.length > 0 ? Math.round((phOk.length / phAns.length) * 100) : 0;
              return `
                <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-top:4px solid ${ph.color}; border-radius:12px; padding:16px;">
                  <div style="font-size:0.74rem; font-weight:800; color:${ph.color}; text-transform:uppercase;">${ph.weight}</div>
                  <div style="font-weight:800; font-size:0.98rem; margin:4px 0 8px;">${ph.name}</div>
                  <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:var(--text-secondary); margin-bottom:6px;">
                    <span>Respondidas: <strong>${phAns.length}/${phQs.length}</strong></span>
                    <span>Precisión: <strong style="color:${phAcc >= 70 ? '#34d399' : '#fbbf24'}">${phAcc}%</strong></span>
                  </div>
                  <div class="progress-bar-bg" style="margin-bottom:10px;">
                    <div class="progress-bar-fill" style="width:${phAcc}%; background:${ph.color}"></div>
                  </div>
                  <button class="btn btn-outline btn-sm" style="width:100%" onclick="practiceModule('${ph.mods[0]}')">
                    🎯 Reforzar esta Fase →
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      })()}

      <div class="section-header">
        <div>
          <h2 class="section-title">📅 Plan Recta Final de 7 Días para Aprobar en SICAN-OECE</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Marca cada día completado. Con 45 a 60 minutos diarios cubres el 100% de la Ley N° 32069 y D.S. N° 009-2025-EF:</p>
        </div>
      </div>

      ${(() => {
        const planDays = [
          { id: 'D1', day: 'Día 1', title: 'Principios, Actores (DEC, Oficial de Compras) y Montos UIT', action: "practiceModule('M1')" },
          { id: 'D2', day: 'Día 2', title: 'Actuaciones Preparatorias, PAC, PLADICOP y Estrategia', action: "practiceModule('M2')" },
          { id: 'D3', day: 'Día 3', title: 'Procedimientos (LP/CP/Abreviadas) y Plazos de Apelación (5d/8d)', action: "switchView('topes')" },
          { id: 'D4', day: 'Día 4', title: 'Contratos, Garantías (10%), Adicionales (25%) y Ampliación (10d)', action: "practiceModule('M4')" },
          { id: 'D5', day: 'Día 5', title: 'Obras (Adicionales 15%/30%/50%) y JPRD Obligatoria (≥240d)', action: "practiceModule('M5')" },
          { id: 'D6', day: 'Día 6', title: 'Tribunal (TCP >50 UIT), Sanciones y Emergencias (20d regularizar)', action: "practiceModule('M6')" },
          { id: 'D7', day: 'Día 7', title: 'Simulacro Oficial Completo (72 Preguntas en 120 min · Meta ≥58 pts)', action: "switchView('simulator')" }
        ];
        const donePlan = state.plan7Days || {};
        return `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:28px;">
            ${planDays.map(d => {
              const checked = !!donePlan[d.id];
              return `
                <div style="background:var(--bg-surface); border:1px solid ${checked ? '#10b981' : 'var(--border-color)'}; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:8px;">
                  <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; font-size:0.84rem;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="togglePlanDay('${d.id}', this.checked)" style="margin-top:3px;" />
                    <span><strong style="color:${checked ? '#34d399' : '#38bdf8'}">${d.day}:</strong> ${d.title}</span>
                  </label>
                  <button class="btn btn-outline btn-sm" style="width:100%; font-size:0.76rem;" onclick="${d.action}">
                    Ir a la meta del ${d.day} →
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      })()}

      <div class="section-header">
        <div>
          <h2 class="section-title">Ruta de Aprendizaje por Módulos (Ley N° 32069 y D.S. N° 009-2025-EF)</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Estudia primero la explicación teórica de cada módulo y luego resuelve sus preguntas oficiales con retroalimentación inmediata.</p>
        </div>
      </div>

      <div class="modules-grid">
        ${moduleCardsHtml}
      </div>
    `;
  }

  window.openAcademyModule = function (modId) {
    state.activeAcademyModule = modId;
    saveState();
    switchView('academy');
  };

  window.practiceModule = function (modId) {
    state.trainerFilter.module = modId;
    state.trainerFilter.status = 'ALL';
    state.trainerFilter.search = '';
    state.trainerFilter.currentIndex = 0;
    saveState();
    switchView('trainer');
  };

  window.practiceMistakes = function () {
    state.trainerFilter.module = 'ALL';
    state.trainerFilter.status = 'WRONG';
    state.trainerFilter.search = '';
    state.trainerFilter.currentIndex = 0;
    saveState();
    switchView('trainer');
  };

  // 2. ACADEMY (THEORETICAL EXPLANATIONS)
  function renderAcademy() {
    const modules = window.OECE_MODULES || [];
    const activeMod = modules.find(m => m.id === state.activeAcademyModule) || modules[0];
    const questions = (window.OECE_QUESTIONS || []).filter(q => q.module === activeMod.id);
    const isCompleted = !!state.modulesCompleted[activeMod.id];

    const tocEl = document.getElementById('academyToc');
    const readerEl = document.getElementById('academyReader');
    if (!tocEl || !readerEl) return;

    tocEl.innerHTML = `
      <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); padding:6px 10px 10px;">
        Módulos de Estudio (8)
      </div>
      ${modules.map(m => {
        const done = !!state.modulesCompleted[m.id];
        return `
          <button class="academy-toc-btn ${m.id === activeMod.id ? 'active' : ''}" onclick="openAcademyModule('${m.id}')">
            <span style="font-size:1.1rem">${m.icon}</span>
            <span style="flex:1">${m.code}: ${m.title.split(':')[0]}</span>
            ${done ? '<span title="Módulo completado">✅</span>' : ''}
          </button>
        `;
      }).join('')}
    `;

    readerEl.innerHTML = `
      <div class="reader-header">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <span class="pill-tag" style="background:${activeMod.color}20; color:${activeMod.color}">
            ${activeMod.icon} ${activeMod.code} · ${activeMod.competencia}
          </span>
          <div style="display:flex; gap:8px;">
            <button class="btn ${isCompleted ? 'btn-success' : 'btn-outline'} btn-sm" onclick="toggleModuleCompleted('${activeMod.id}')">
              ${isCompleted ? '✅ Módulo Estudiado' : '☑️ Marcar como Leído'}
            </button>
            <button class="btn btn-primary btn-sm" onclick="practiceModule('${activeMod.id}')">
              ✍️ Practicar las ${questions.length} preguntas de este Módulo →
            </button>
          </div>
        </div>
        <h2>${activeMod.title}</h2>
        <p style="color:var(--text-secondary); font-size:0.95rem;">${activeMod.summary}</p>
      </div>

      <div style="background:linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.10)); border:2px solid var(--primary); border-radius:14px; padding:18px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <h3 style="margin:0; font-size:1.02rem; color:var(--primary);">🎯 Guía Didáctica para Responder en 10 Segundos (${activeMod.code})</h3>
          <span class="pill-tag green">Fórmula: Si el caso dice [Pista] → Marca [Respuesta]</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px;">
          ${getModuleDidacticRules(activeMod.id).map(r => `
            <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-left:4px solid ${activeMod.color}; border-radius:10px; padding:12px;">
              <div style="font-size:0.78rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">🔎 SI LA PREGUNTA MENCIONA:</div>
              <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary); margin-bottom:6px;">${r.trigger}</div>
              <div style="font-size:0.78rem; color:#10b981; font-weight:700; margin-bottom:2px;">✅ MARCA SIEMPRE:</div>
              <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${r.answer}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        ${activeMod.keyPoints.map((kp, idx) => `
          <div class="keypoint-card">
            <h4><span>${idx + 1}.</span> ${kp.title}</h4>
            <div class="keypoint-body">${kp.body}</div>
            <div class="fija-alert">
              💡 <strong>${kp.highlight}</strong>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="margin-top:24px; background:var(--bg-elevated); border:2px solid #f59e0b; border-radius:14px; padding:18px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div>
            <h3 style="margin:0; font-size:1.05rem; color:#fbbf24;">📋 Casuísticas de Examen Real Resueltas Paso a Paso (${activeMod.code})</h3>
            <p style="margin:4px 0 0; font-size:0.84rem; color:var(--text-secondary);">Así es como vienen planteados los casos largos en el examen SICAN del OECE y cómo debes desarmarlos:</p>
          </div>
          <button class="btn btn-gold btn-sm" onclick="switchView('simulator'); startExam(35, 50, 'EXTERNAL_SIM', '📋 Simulacro Casuísticas Reales SICAN-OECE')">
            ⏱️ Rendir Simulacro de Casuísticas →
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:14px;">
          ${questions.filter(q => q.isTopeCasuistica || q.isWebFija).slice(-4).reverse().map(cq => {
            const winOpt = cq.options.find(o => o.letter === cq.correct) || { text: '' };
            return `
              <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:10px; padding:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                  <span class="pill-tag gold">Caso Oficial #${cq.id} · ${escapeHtml(cq.concept)}</span>
                  <span style="font-size:0.76rem; color:var(--text-muted); font-weight:700;">📖 ${escapeHtml(cq.legalRef || 'Ley N° 32069 y D.S. N° 009-2025-EF')}</span>
                </div>
                <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); line-height:1.5; margin-bottom:10px;">
                  ${escapeHtml(cq.question)}
                </div>
                <div style="background:rgba(16,185,129,0.12); border-left:4px solid #10b981; padding:10px 12px; border-radius:6px; margin-bottom:8px; font-size:0.86rem;">
                  <strong style="color:#34d399;">✅ Respuesta Correcta (${cq.correct}):</strong> ${escapeHtml(winOpt.text)}
                </div>
                <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45;">
                  🎯 <strong>Cómo detectarla en el examen:</strong> ${escapeHtml(cq.examTip)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:28px; padding-top:20px; border-top:1px solid var(--border-color);">
        <button class="btn btn- ${isCompleted ? 'btn-success' : 'btn-outline'}" onclick="toggleModuleCompleted('${activeMod.id}')">
          ${isCompleted ? '✅ Ya marcaste este módulo como estudiado' : '☑️ Marcar este Módulo como Estudiado'}
        </button>
        <button class="btn btn-primary" onclick="practiceModule('${activeMod.id}')">
          🧠 Poner a prueba lo aprendido (${questions.length} preguntas) →
        </button>
      </div>
    `;
  }

  function getModuleDidacticRules(modId) {
    const map = {
      M1: [
        { trigger: "«Elegir el menor precio sin evaluar soporte, ciclo de vida o calidad»", answer: "Vulneración del Principio de VALOR POR DINERO (Art. 5 Ley 32069: combina calidad + ciclo de vida + sostenibilidad + precio)." },
        { trigger: "«¿Qué hace el OECE?» vs. «¿El OECE firma contratos o da la buena pro?»", answer: "El OECE supervisa según su Plan Anual, administra la PLADICOP y certifica. NUNCA firma contratos ni adjudica procesos de las entidades." },
        { trigger: "«¿Qué fases integran la plataforma digital PLADICOP?»", answer: "Integra SEACE + RNP y cubre las 3 fases: 1) Actuaciones Preparatorias, 2) Selección y 3) Ejecución Contractual." },
        { trigger: "«Enfoque de la Ley N° 32069 frente a meros formalismos»", answer: "Gestión por Resultados y Valor por Dinero: priorizar la finalidad pública sobre formalidades no esenciales." }
      ],
      M2: [
        { trigger: "«Aprobar el PAC, aprobar el expediente, aprobar compatibilización o resolver apelación <= 50 UIT»", answer: "Autoridad de la Gestión Administrativa (AGA - Art. 25): Secretario General (Ministerio), Gerente General (GORE) o Gerente Municipal." },
        { trigger: "«Nivel de certificación exigido al Oficial de Compras vs. al Jefe de la DEC»", answer: "Oficial de Compras (comprador de la DEC) = Nivel Intermedio o Avanzado | Responsable/Jefe titular de la DEC = Nivel Avanzado." },
        { trigger: "«Hospital u obra de alta complejidad técnica al formular el requerimiento»", answer: "Área Técnica Estratégica (ATE): brinda soporte técnico especializado o formula el requerimiento complejo." },
        { trigger: "«¿Quién elabora la Estrategia de Contratación y conduce la Interacción con el Mercado?»", answer: "La Dependencia Encargada de las Contrataciones (DEC)." }
      ],
      M3: [
        { trigger: "«Segmentación de contrataciones: Rutinarias/Operacionales vs. Críticas/Estratégicas» (Art. 42 y 125)", answer: "Bajo riesgo (Rutinarias y Operacionales) = Atención oportuna y reducción de costos | Alto riesgo (Críticas y Estratégicas) = Disminuir riesgos." },
        { trigger: "«¿Cuándo una compra de bienes o servicios es de ALTO RIESGO en la segmentación?»", answer: "Últimos 2 años: 1) Declarada desierta, o 2) Promedio <= 3 postores en bienes o <= 2 en servicios, o 3) Disponibilidad limitada." },
        { trigger: "«Difusión del requerimiento en PLADICOP (Consultas técnicas de proveedores)»", answer: "Mínimo 5 días hábiles para que proveedores formulen consultas y 3 días hábiles para que la entidad las absuelva." },
        { trigger: "«Pedir una marca o modelo específico por tener equipos preexistentes»", answer: "Proceso de COMPATIBILIZACIÓN (Directiva N° 0001-2025-EF/54.01, antes llamado estandarización), aprobado por la AGA." }
      ],
      M4: [
        { trigger: "«Compra igual o menor a 8 UIT (<= S/ 42,800) y el hermano del Alcalde o un proveedor sin RNP»", answer: "Es un CONTRATO MENOR: SÍ le aplican todos los impedimentos del Art. 30 (hasta 2° grado), SÍ exige RNP vigente y SÍ se registra en PLADICOP." },
        { trigger: "«¿Quiénes están impedidos por parentesco según el Art. 30 de la Ley 32069?»", answer: "Cónyuge, conviviente y parientes hasta el SEGUNDO (2°) GRADO de consanguinidad (padres, hijos, hermanos, abuelos, nietos) y de afinidad." },
        { trigger: "«Persona jurídica donde una autoridad impedida tiene acciones o participaciones»", answer: "Impedida cuando la participación directa o indirecta supera el 30% (> 30%) del capital o patrimonio social." },
        { trigger: "«¿Se puede aplicar un impedimento por analogía a un primo hermano (4° grado)?»", answer: "NO. Los impedimentos del Art. 30 tienen reserva de ley y son de interpretación restrictiva (prohibida la analogía)." }
      ],
      M5: [
        { trigger: "«¿Qué procedimiento corresponde según el monto en Bienes vs. Servicios/Consultorías?»", answer: "Bienes > S/ 485,000 = Licitación Pública | Bienes entre S/ 42,800 y S/ 485,000 = LP Abreviada | Servicios/Consultorías > S/ 485,000 = Concurso Público." },
        { trigger: "«Falta de firma o error formal en oferta que NO altera el contenido esencial ni el precio» (Art. 78.4)", answer: "Subsanable por PLADICOP en 2 DÍAS HÁBILES (+ 2 días hábiles adicionales a solicitud del postor). El precio jamás es subsanable." },
        { trigger: "«El proceso se declara DESIERTO (Art. 84): ¿se aprueba otra vez el expediente?»", answer: "SOLO si el informe de causas del desierto determina que debe modificarse algún documento que motivó su aprobación." },
        { trigger: "«Proveedor único con habilitación legal exclusiva, emergencia o desabastecimiento inminente»", answer: "Procedimiento de Selección NO COMPETITIVO (Art. 55 de la Ley N° 32069)." }
      ],
      M6: [
        { trigger: "«Plazo para apelar la buena pro: Licitación/Concurso Público vs. Modalidad Abreviada»", answer: "8 días hábiles en Licitación Pública / Concurso Público | 5 días hábiles en Modalidades Abreviadas." },
        { trigger: "«¿Quién resuelve la apelación según la cuantía?» (Art. 74 Ley 32069)", answer: "Cuantía <= 50 UIT: resuelve la Entidad Contratante (AGA) | Cuantía > 50 UIT: resuelve el Tribunal de Contrataciones Públicas (TCP)." },
        { trigger: "«Garantía por interposición de recurso de apelación» (Art. 73.2 Ley 32069)", answer: "Régimen general = 3% de la cuantía o ítem impugnado (tope 300 UIT) | Si es MYPE acreditada = 0.5% (tope 25 UIT)." },
        { trigger: "«Retención del 10% como Garantía de Fiel Cumplimiento en vez de Carta Fianza» (Art. 114)", answer: "Procede en: 1) Bienes/Servicios <= S/ 480,000; 2) Obras <= S/ 5,000,000; o 3) Contratistas MYPE sin límite de monto." }
      ],
      M7: [
        { trigger: "«Límites porcentuales en Adicionales de Obra y Modificaciones»", answer: "Todo adicional exige ajustar proporcionalmente la garantía | > 40% requiere autorización expresa | > 50% del valor original está PROHIBIDO." },
        { trigger: "«El contratista pide Ampliación de Plazo por lluvias intensas (atraso ajeno a su voluntad)»", answer: "Debe solicitarla DENTRO del plazo contractual vigente y la Entidad decide con informe técnico previo." },
        { trigger: "«Tres plazos fijos en Ejecución: Supervisión, Pago de Valorización y Silencio en Recepción de Obra»", answer: "Supervisión periódica: máx. cada 30 días | Pago de valorización: máx. 15 días hábiles | Silencio en culminación de obra: 30 días hábiles (se presume conformidad)." },
        { trigger: "«Diferencia entre Resolución, Terminación Anticipada y Nulidad del Contrato»", answer: "Incumplimiento grave o tope 10% de mora = Resolución (se ejecuta garantía) | Cambio de política institucional = Terminación Anticipada | Documentos falsos = Nulidad." }
      ],
      M8: [
        { trigger: "«JPRD (Directiva 002-2025-OECE-CD): Duración mínima y Recomendación vs. Decisión»", answer: "Obligatoria en contratos >= 240 días calendario | Recomendación = 7 días hábiles para pronunciarse | Decisión = 7 días calendario para quedar firme y 10 días calendario para implementarla." },
        { trigger: "«Procedimiento Administrativo Sancionador (PAS) ante el TCP: Fases y Plazos»", answer: "Fase Instructiva (Secretaría Técnica): 10 días hábiles para descargos y máx. 4 meses para informe final | Fase Sancionadora: resuelve el TCP." },
        { trigger: "«Contratación de Emergencia: Plazo de regularización, adelanto y exoneración de fianza»", answer: "Regularización: máx. 20 días hábiles (40 días hábiles si es masiva) | Adelanto Gobierno Nacional: hasta 30 UIT | Exonera fianza en compras de 72 horas." },
        { trigger: "«Mecanismos Diferenciados de Adquisición (MDA en Salud) y Contratos de Contingencia»", answer: "MDA = enfermedades raras/oncológicas de alto costo (exige Registro Sanitario vigente o condicionado en Perú) | Contingencia = evento futuro e incierto (pago por disponibilidad)." }
      ]
    };
    return map[modId] || [];
  }

  window.toggleModuleCompleted = function (modId) {
    state.modulesCompleted[modId] = !state.modulesCompleted[modId];
    saveState();
    renderAcademy();
  };

  // 3. QUESTION TRAINER (405 EXPLAINED QUESTIONS)
  function isTopeOrCasuisticaQuestion(q) {
    if (q.isTopeCasuistica || q.isWebFija) return true;
    const ql = q.question.toLowerCase();
    return /\d/.test(ql) || anyKeyword(ql, [
      's/', 'uit', '%', 'días', 'meses', 'años', 'tope', 'cuantía', 'monto',
      'municipalidad', 'gobierno regional', 'ministerio', 'hospital', 'ugel', 'entidad pública', 'empresa'
    ]);
  }

  function anyKeyword(str, arr) {
    for (let i = 0; i < arr.length; i++) {
      if (str.includes(arr[i])) return true;
    }
    return false;
  }

  function getFilteredTrainerQuestions() {
    const all = window.OECE_QUESTIONS || [];
    const f = state.trainerFilter;
    return all.filter(q => {
      if (f.hideDuplicates && q.isDuplicateOf !== null) return false;
      if (f.module === 'WEB_FIJAS' && !q.isWebFija) return false;
      else if (f.module === 'EXTERNAL_SIM' && !q.isExternalSim && !q.isWebFija) return false;
      else if (f.module === 'TOPES_CASUISTICA' && !isTopeOrCasuisticaQuestion(q)) return false;
      else if (f.module !== 'ALL' && f.module !== 'WEB_FIJAS' && f.module !== 'EXTERNAL_SIM' && f.module !== 'TOPES_CASUISTICA' && q.module !== f.module) return false;

      if (f.status === 'UNANSWERED' && state.answered[q.id]) return false;
      if (f.status === 'WRONG' && (!state.answered[q.id] || state.answered[q.id].isCorrect)) return false;
      if (f.status === 'CORRECT' && (!state.answered[q.id] || !state.answered[q.id].isCorrect)) return false;
      if (f.status === 'BOOKMARKED' && !state.bookmarks[q.id]) return false;
      if (f.status === 'WITH_NOTES' && (!state.notes || !state.notes[q.id])) return false;
      if (f.search.trim() !== '') {
        const term = f.search.trim().toLowerCase();
        const inQ = q.question.toLowerCase().includes(term) || String(q.id) === term;
        const inOpt = q.options.some(o => o.text.toLowerCase().includes(term));
        const inExp = q.explanation.toLowerCase().includes(term) || q.concept.toLowerCase().includes(term);
        if (!inQ && !inOpt && !inExp) return false;
      }
      return true;
    });
  }

  function renderTrainer() {
    const container = document.getElementById('trainerContent');
    if (!container) return;

    const modules = window.OECE_MODULES || [];
    const filtered = getFilteredTrainerQuestions();
    if (state.trainerFilter.currentIndex >= filtered.length) {
      state.trainerFilter.currentIndex = 0;
    }

    const currentQ = filtered[state.trainerFilter.currentIndex] || null;
    const ansRecord = currentQ ? state.answered[currentQ.id] : null;
    const isBookmarked = currentQ ? !!state.bookmarks[currentQ.id] : false;
    const modInfo = currentQ ? modules.find(m => m.id === currentQ.module) : null;

    container.innerHTML = `
      <div class="trainer-controls">
        <select class="control-select" onchange="updateTrainerFilter('module', this.value)">
          <option value="ALL" ${state.trainerFilter.module === 'ALL' ? 'selected' : ''}>📚 Todos los Módulos (${(window.OECE_QUESTIONS || []).length})</option>
          <option value="EXTERNAL_SIM" ${state.trainerFilter.module === 'EXTERNAL_SIM' ? 'selected' : ''}>🌐 Simuladores Externos OECE / SICAN (Fijas 2026)</option>
          <option value="WEB_FIJAS" ${state.trainerFilter.module === 'WEB_FIJAS' ? 'selected' : ''}>🔥 Fijas de Examen Web & Casuística SICAN</option>
          <option value="TOPES_CASUISTICA" ${state.trainerFilter.module === 'TOPES_CASUISTICA' ? 'selected' : ''}>🎯 Solo Topes, Plazos, Montos y Casuísticas</option>
          ${modules.map(m => `<option value="${m.id}" ${state.trainerFilter.module === m.id ? 'selected' : ''}>${m.code}: ${m.title.split(':')[0]}</option>`).join('')}
        </select>

        <select class="control-select" onchange="updateTrainerFilter('status', this.value)">
          <option value="ALL" ${state.trainerFilter.status === 'ALL' ? 'selected' : ''}>🎯 Estado: Todas</option>
          <option value="UNANSWERED" ${state.trainerFilter.status === 'UNANSWERED' ? 'selected' : ''}>⏳ Sin responder aún</option>
          <option value="WRONG" ${state.trainerFilter.status === 'WRONG' ? 'selected' : ''}>❌ Falladas (Para repasar)</option>
          <option value="CORRECT" ${state.trainerFilter.status === 'CORRECT' ? 'selected' : ''}>✅ Dominadas (Correctas)</option>
          <option value="BOOKMARKED" ${state.trainerFilter.status === 'BOOKMARKED' ? 'selected' : ''}>⭐ Favoritas / Difíciles</option>
          <option value="WITH_NOTES" ${state.trainerFilter.status === 'WITH_NOTES' ? 'selected' : ''}>📝 Con mis apuntes personales</option>
        </select>

        <input type="text" class="control-input" placeholder="🔍 Buscar palabra clave o N° de pregunta (ej. JPRD, 485,000, apelación, 145)..." value="${escapeHtml(state.trainerFilter.search)}" oninput="updateTrainerSearch(this.value)" />

        <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; cursor:pointer; user-select:none;">
          <input type="checkbox" ${state.trainerFilter.hideDuplicates ? 'checked' : ''} onchange="updateTrainerFilter('hideDuplicates', this.checked)" />
          Ocultar repetidas (382 únicas)
        </label>
      </div>

      <div id="trainerQuestionStage">
        ${renderTrainerStageHtml(filtered, currentQ, ansRecord, isBookmarked, modInfo)}
      </div>
    `;
  }

  function renderTrainerStageHtml(filtered, currentQ, ansRecord, isBookmarked, modInfo) {
    if (!currentQ) {
      return `
        <div class="question-box" style="text-align:center; padding:48px 24px;">
          <div style="font-size:2.5rem; margin-bottom:10px;">🎉</div>
          <h3>No hay preguntas con este filtro</h3>
          <p style="color:var(--text-secondary); margin:8px 0 18px;">Cambia el filtro de módulo o estado para seguir practicando.</p>
          <button class="btn btn-primary" onclick="resetTrainerFilters()">Mostrar todas las 405 preguntas</button>
        </div>
      `;
    }

    const idx = state.trainerFilter.currentIndex;
    const total = filtered.length;
    const selectedOptObj = ansRecord ? currentQ.options.find(o => o.letter === ansRecord.selected) : null;
    const correctOptObj = currentQ.options.find(o => o.letter === currentQ.correct);

    return `
      <div class="question-box">
        <div class="question-meta-bar">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="pill-tag" style="background:#0f172a; color:#fff;">
              Pregunta Oficial #${currentQ.id} (Pág. ${currentQ.page})
            </span>
            ${modInfo ? `<span class="pill-tag" style="background:${modInfo.color}20; color:${modInfo.color}">${modInfo.icon} ${modInfo.code}: ${currentQ.concept}</span>` : ''}
            ${currentQ.isDuplicateOf ? `<span class="pill-tag gold">🔁 Refuerzo de P#${currentQ.isDuplicateOf}</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:0.84rem; color:var(--text-muted); font-weight:600;">
              ${idx + 1} de ${total}
            </span>
            <button class="btn ${state.highlightClues ? 'btn-gold' : 'btn-outline'} btn-sm" onclick="toggleHighlightClues()" title="Subrayar automáticamente montos, plazos y palabras clave del caso">
              🖍️ Pistas Clave
            </button>
            <button class="btn btn-outline btn-sm" onclick="useFiftyFifty(${currentQ.id})" title="Descartar 2 opciones incorrectas (Técnica 50/50)">
              ✂️ 50/50 Descartar 2
            </button>
            <button class="btn ${window._podcastActive ? 'btn-success' : 'btn-outline'} btn-sm" onclick="togglePodcastMode()" title="Modo Podcast Manos Libres: lee automáticamente pregunta tras pregunta con su respuesta">
              ${window._podcastActive ? '🎧 Podcast Activo (Detener)' : '🎧 Modo Podcast'}
            </button>
            <button class="btn btn-outline btn-sm" onclick="speakCurrentQuestion(${currentQ.id})" title="Escuchar pregunta y explicación por voz">
              🔊 Escuchar
            </button>
            <button class="btn btn-outline btn-sm" onclick="stopSpeech()" title="Detener lectura por voz">
              ⏹️
            </button>
            <button class="btn btn-outline btn-sm" onclick="toggleBookmark(${currentQ.id})" title="Guardar en Mis Preguntas Difíciles">
              ${isBookmarked ? '⭐ Guardada' : '☆ Guardar'}
            </button>
          </div>
        </div>

        <div class="question-stem">
          ${currentQ.id}. ${formatQuestionStem(currentQ.question)}
        </div>

        <div class="options-list">
          ${currentQ.options.map(opt => {
            let cls = 'option-btn';
            let inlineFeedbackHtml = '';
            const discardedList = (window._fiftyFiftyMap && window._fiftyFiftyMap[currentQ.id]) || [];
            const isDiscarded = !ansRecord && discardedList.includes(opt.letter);
            if (isDiscarded) {
              cls += ' discarded-5050';
              inlineFeedbackHtml = `
                <div class="option-inline-feedback feedback-other-wrong">
                  <strong>✂️ DESCARTADA POR 50/50 · ¿Por qué es trampa?:</strong> ${escapeHtml(opt.why || '')}
                </div>
              `;
            }

            if (ansRecord) {
              const isThisCorrect = opt.letter === currentQ.correct;
              const isUserChoice = opt.letter === ansRecord.selected;

              if (isThisCorrect) {
                cls += ' correct';
                inlineFeedbackHtml = `
                  <div class="option-inline-feedback feedback-correct">
                    <strong>${isUserChoice ? '🎉 ¡ACERTASTE! ¿Por qué tu respuesta está bien?' : '✅ ESTA ES LA ALTERNATIVA CORRECTA · ¿Por qué está bien?'}:</strong><br/>
                    ${escapeHtml(opt.why || '')}
                  </div>
                `;
              } else if (isUserChoice && !ansRecord.isCorrect) {
                cls += ' wrong';
                inlineFeedbackHtml = `
                  <div class="option-inline-feedback feedback-user-wrong">
                    <strong>❌ TE EQUIVOCASTE AQUÍ (TU ELECCIÓN) · ¿Por qué esta opción es incorrecta?:</strong><br/>
                    ${escapeHtml(opt.why || '')}
                  </div>
                `;
              } else {
                inlineFeedbackHtml = `
                  <div class="option-inline-feedback feedback-other-wrong">
                    <strong>🚫 ¿Por qué se descarta la opción ${opt.letter}?:</strong> ${escapeHtml(opt.why || '')}
                  </div>
                `;
              }
            }

            return `
              <button class="${cls}" style="flex-direction:column; align-items:stretch;" onclick="answerTrainerQuestion(${currentQ.id}, '${opt.letter}')">
                <div style="display:flex; align-items:flex-start; gap:14px; width:100%;">
                  <span class="option-letter">${opt.letter}</span>
                  <span style="flex:1; font-weight:${ansRecord && opt.letter === currentQ.correct ? '700' : '500'}">${escapeHtml(opt.text)}</span>
                  ${ansRecord && opt.letter === currentQ.correct ? '<span style="font-weight:800; color:var(--success)">✓ Correcta</span>' : ''}
                  ${ansRecord && opt.letter === ansRecord.selected && !ansRecord.isCorrect ? '<span style="font-weight:800; color:var(--danger)">✗ Tu elección</span>' : ''}
                </div>
                ${inlineFeedbackHtml}
              </button>
            `;
          }).join('')}
        </div>

        ${ansRecord ? `
          <div class="explanation-panel ${ansRecord.isCorrect ? 'is-correct' : 'is-wrong'}">
            <div class="explanation-status" style="color:${ansRecord.isCorrect ? 'var(--success)' : 'var(--danger)'}">
              ${ansRecord.isCorrect
                ? `🎉 ¡Muy bien, ${escapeHtml(state.userName)}! Acertaste con la alternativa ${currentQ.correct}`
                : `⚠️ Te equivocaste: Elegiste la alternativa ${ansRecord.selected}, pero la correcta es la ${currentQ.correct}`
              }
            </div>

            ${!ansRecord.isCorrect && selectedOptObj && correctOptObj ? `
              <div class="diagnostic-grid">
                <div class="diagnostic-card diag-wrong">
                  <div style="font-weight:800; color:var(--danger); margin-bottom:6px;">
                    ❌ ¿Por qué te equivocaste al marcar la ${selectedOptObj.letter}?
                  </div>
                  <div style="font-size:0.88rem; margin-bottom:6px;">
                    <strong>Marcaste:</strong> «${escapeHtml(selectedOptObj.text)}»
                  </div>
                  <div style="font-size:0.86rem; color:var(--text-main);">
                    ${escapeHtml(selectedOptObj.why || '')}
                  </div>
                </div>

                <div class="diagnostic-card diag-right">
                  <div style="font-weight:800; color:var(--success); margin-bottom:6px;">
                    ✅ ¿Por qué la opción ${correctOptObj.letter} sí es la correcta?
                  </div>
                  <div style="font-size:0.88rem; margin-bottom:6px;">
                    <strong>Debiste marcar:</strong> «${escapeHtml(correctOptObj.text)}»
                  </div>
                  <div style="font-size:0.86rem; color:var(--text-main);">
                    ${escapeHtml(correctOptObj.why || '')}
                  </div>
                </div>
              </div>
            ` : `
              <div class="diagnostic-card diag-right" style="margin-bottom:16px;">
                <div style="font-weight:800; color:var(--success); margin-bottom:6px;">
                  ✅ ¿Por qué está bien tu respuesta (${correctOptObj ? correctOptObj.letter : currentQ.correct})?
                </div>
                <div style="font-size:0.88rem; margin-bottom:6px;">
                  <strong>Respuesta elegida:</strong> «${escapeHtml(correctOptObj ? correctOptObj.text : '')}»
                </div>
                <div style="font-size:0.86rem; color:var(--text-main);">
                  ${escapeHtml(correctOptObj ? correctOptObj.why : '')}
                </div>
              </div>
            `}

            <div style="font-weight:700; font-size:0.92rem; margin-bottom:6px; color:var(--primary);">
              📚 Explicación Normativa Completa del Caso:
            </div>
            <div class="explanation-text">${escapeHtml(currentQ.explanation)}</div>

            <div class="fija-alert" style="margin-top:10px;">
              💡 <strong>Regla de Oro para no fallar en el Examen OECE:</strong> ${escapeHtml(currentQ.examTip)}
            </div>
            <div class="legal-badge-box">
              <span>⚖️ <strong>Base Legal:</strong> ${escapeHtml(currentQ.legalRef)}</span>
              <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="openAcademyModule('${currentQ.module}')">
                📖 Ver teoría completa de este tema (${currentQ.module})
              </button>
            </div>
          </div>
        ` : `
          <div style="margin-top:18px; display:flex; align-items:center; justify-content:space-between; color:var(--text-muted); font-size:0.84rem;">
            <span>👆 Haz clic en una alternativa (o presiona las teclas A, B, C, D) para que te explique si está bien o por qué te equivocaste y el análisis de cada opción.</span>
            <button class="btn btn-outline btn-sm" onclick="answerTrainerQuestion(${currentQ.id}, '${currentQ.correct}')">
              👁️ Ver solución explicada
            </button>
          </div>
        `}

        <div style="margin-top:16px; padding:12px 16px; background:var(--bg-elevated); border:1px dashed var(--border-color); border-radius:8px;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--accent); margin-bottom:6px;">
            📝 Mi Apunte Personal / Mnemotecnia para la Pregunta #${currentQ.id} (Se guarda automáticamente):
          </div>
          <input
            type="text"
            class="control-input"
            style="width:100%; background:var(--bg-surface);"
            placeholder="Escribe aquí tu resumen, palabra clave o truco para recordar esta pregunta..."
            value="${escapeHtml((state.notes && state.notes[currentQ.id]) || '')}"
            oninput="saveQuestionNote(${currentQ.id}, this.value)"
          />
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; padding-top:18px; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:10px;">
          <button class="btn btn-outline" ${idx === 0 ? 'disabled' : ''} onclick="stepTrainerQuestion(-1)">
            ← Anterior
          </button>

          <div style="display:flex; align-items:center; gap:6px; font-size:0.84rem;">
            <span>Ir a posición:</span>
            <input type="number" min="1" max="${total}" value="${idx + 1}" style="width:68px; padding:6px; border-radius:6px; border:1px solid var(--border-color); text-align:center;" onchange="jumpTrainerIndex(this.value - 1, ${total})" />
            <span>de ${total}</span>
            ${ansRecord ? `
              <button class="btn btn-outline btn-sm" onclick="clearSingleAnswer(${currentQ.id})" title="Volver a intentar esta pregunta en limpio">
                🔄 Reintentar
              </button>
            ` : ''}
          </div>

          <button class="btn btn-primary" ${idx >= total - 1 ? 'disabled' : ''} onclick="stepTrainerQuestion(1)">
            Siguiente Pregunta →
          </button>
        </div>
      </div>
    `;
  }

  window.updateTrainerFilter = function (key, val) {
    state.trainerFilter[key] = val;
    state.trainerFilter.currentIndex = 0;
    saveState();
    renderTrainer();
  };

  window.updateTrainerSearch = function (val) {
    state.trainerFilter.search = val;
    state.trainerFilter.currentIndex = 0;
    const filtered = getFilteredTrainerQuestions();
    const currentQ = filtered[0] || null;
    const ansRecord = currentQ ? state.answered[currentQ.id] : null;
    const isBookmarked = currentQ ? !!state.bookmarks[currentQ.id] : false;
    const modInfo = currentQ ? (window.OECE_MODULES || []).find(m => m.id === currentQ.module) : null;
    const stage = document.getElementById('trainerQuestionStage');
    if (stage) stage.innerHTML = renderTrainerStageHtml(filtered, currentQ, ansRecord, isBookmarked, modInfo);
  };

  window.resetTrainerFilters = function () {
    state.trainerFilter = { module: 'ALL', status: 'ALL', search: '', hideDuplicates: false, currentIndex: 0 };
    saveState();
    renderTrainer();
  };

  window.answerTrainerQuestion = function (qid, letter) {
    const q = (window.OECE_QUESTIONS || []).find(x => x.id === qid);
    if (!q) return;
    const isCorrect = letter === q.correct;
    const prev = state.answered[qid];
    state.answered[qid] = {
      selected: letter,
      isCorrect: isCorrect,
      attempts: (prev ? prev.attempts : 0) + 1
    };
    saveState();

    const filtered = getFilteredTrainerQuestions();
    const currentQ = filtered[state.trainerFilter.currentIndex] || q;
    const modInfo = (window.OECE_MODULES || []).find(m => m.id === currentQ.module);
    const stage = document.getElementById('trainerQuestionStage');
    if (stage) {
      stage.innerHTML = renderTrainerStageHtml(filtered, currentQ, state.answered[currentQ.id], !!state.bookmarks[currentQ.id], modInfo);
    }
  };

  window.clearSingleAnswer = function (qid) {
    delete state.answered[qid];
    saveState();
    renderTrainer();
  };

  window.toggleBookmark = function (qid) {
    state.bookmarks[qid] = !state.bookmarks[qid];
    if (!state.bookmarks[qid]) delete state.bookmarks[qid];
    saveState();
    renderTrainer();
  };

  window.stepTrainerQuestion = function (delta) {
    const filtered = getFilteredTrainerQuestions();
    const next = state.trainerFilter.currentIndex + delta;
    if (next >= 0 && next < filtered.length) {
      state.trainerFilter.currentIndex = next;
      saveState();
      renderTrainer();
    }
  };

  window.jumpTrainerIndex = function (idx, total) {
    const parsed = parseInt(idx, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < total) {
      state.trainerFilter.currentIndex = parsed;
      saveState();
      renderTrainer();
    }
  };

  // 4. FLASHCARDS & CHEATSHEET
  function renderFlashcards() {
    const container = document.getElementById('flashcardsContent');
    if (!container) return;

    const cards = window.OECE_FLASHCARDS || [];
    const cheats = window.OECE_CHEATSHEET || [];
    if (state.flashcardIndex >= cards.length) state.flashcardIndex = 0;
    const card = cards[state.flashcardIndex];

    container.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">⚡ Tarjetas de Memoria Rápida (Flashcards) y Tabla Maestra de Plazos</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Haz clic sobre la tarjeta para voltearla y memorizar los plazos, topes en Soles/UIT y reglas fijas del examen OECE.</p>
        </div>
      </div>

      <div class="flashcard-stage">
        <div class="flashcard-inner ${state.flashcardFlipped ? 'flipped' : ''}" onclick="flipFlashcard()">
          <div class="flashcard-cat">
            Tarjeta ${state.flashcardIndex + 1} de ${cards.length} · ${card.category} ${state.flashcardFlipped ? '· RESPUESTA OFICIAL' : '· PREGUNTA CLAVE'}
          </div>
          <div class="flashcard-content">
            ${escapeHtml(state.flashcardFlipped ? card.back : card.front)}
          </div>
          <div class="flashcard-hint">
            🔄 Haz clic en cualquier parte de la tarjeta para ${state.flashcardFlipped ? 'volver a la pregunta' : 'revelar la respuesta'}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
          <button class="btn btn-outline" onclick="stepFlashcard(-1)">← Anterior Tarjeta</button>
          <button class="btn btn-primary" onclick="flipFlashcard()">🔄 Voltear Tarjeta</button>
          <button class="btn btn-outline" onclick="stepFlashcard(1)">Siguiente Tarjeta →</button>
        </div>
      </div>

      <div class="section-header" style="margin-top:36px;">
        <div>
          <h3 class="section-title">📐 Tabla Maestra de Plazos, Topes y Porcentajes (Ley N° 32069 y D.S. N° 009-2025-EF)</h3>
          <p style="font-size:0.86rem; color:var(--text-secondary)">Resumen ejecutivo de todos los números exactos evaluados en el Balotario Master 2026.</p>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table class="cheatsheet-table">
          <thead>
            <tr>
              <th>Fase / Materia</th>
              <th>Concepto / Supuesto Normativo</th>
              <th>Plazo / Tope / Regla Exacta</th>
            </tr>
          </thead>
          <tbody>
            ${cheats.map(c => `
              <tr>
                <td><span class="pill-tag">${escapeHtml(c.group)}</span></td>
                <td><strong>${escapeHtml(c.item)}</strong></td>
                <td style="color:var(--primary); font-weight:800;">${escapeHtml(c.value)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.flipFlashcard = function () {
    state.flashcardFlipped = !state.flashcardFlipped;
    renderFlashcards();
  };

  window.stepFlashcard = function (delta) {
    const cards = window.OECE_FLASHCARDS || [];
    state.flashcardIndex = (state.flashcardIndex + delta + cards.length) % cards.length;
    state.flashcardFlipped = false;
    renderFlashcards();
  };

  // 5. OFFICIAL EXAM SIMULATOR
  function renderSimulator() {
    const container = document.getElementById('simulatorContent');
    if (!container) return;

    if (!activeExam) {
      const modules = window.OECE_MODULES || [];
      const threshold = getLevelThreshold(state.targetLevel);
      container.innerHTML = `
        <div class="question-box" style="max-width:860px; margin:0 auto;">
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
            <div class="stat-icon" style="background:var(--primary-light); color:var(--primary); font-size:1.8rem;">⏱️</div>
            <div>
              <h2 class="section-title">Simulador de Examen de Certificación OECE – Ley N° 32069</h2>
              <p style="font-size:0.9rem; color:var(--text-secondary)">Entrena bajo presión de tiempo real. Al finalizar obtendrás tu calificación por competencias, revisión explicada y tu Certificado Digital de Aprobación.</p>
            </div>
          </div>

          <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:18px; margin-bottom:22px;">
            <h4 style="margin-bottom:8px;">🎯 Escala de Certificación OECE configurada:</h4>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; font-size:0.85rem;">
              <div style="padding:10px; background:var(--bg-surface); border-radius:8px; border-left:4px solid #3b82f6;">
                <strong>Nivel Básico:</strong> Puntaje ≥ 58%
              </div>
              <div style="padding:10px; background:var(--bg-surface); border-radius:8px; border-left:4px solid #10b981;">
                <strong>Nivel Intermedio (Oficial de Compras):</strong> Puntaje ≥ 70%
              </div>
              <div style="padding:10px; background:var(--bg-surface); border-radius:8px; border-left:4px solid #f59e0b;">
                <strong>Nivel Avanzado (Oficial de Compras):</strong> Puntaje ≥ 80%
              </div>
            </div>
          </div>

          <h4 style="margin-bottom:12px;">Selecciona la modalidad de Simulacro:</h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:24px;">
            <div class="module-card" style="border:2px solid var(--primary);">
              <div>
                <span class="pill-tag">🏆 Estándar Oficial OECE</span>
                <h3 style="margin-top:8px;">Simulacro Completo (72 Preguntas)</h3>
                <p class="module-desc" style="margin-top:6px;">Réplica exacta del examen de certificación: 72 preguntas distribuidas proporcionalmente en todas las fases. Duración: <strong>120 minutos</strong>.</p>
              </div>
              <button class="btn btn-primary" style="width:100%" onclick="startExam(72, 120, 'ALL', 'Simulacro Oficial OECE (72 preg.)')">
                Iniciar Examen Oficial (72) →
              </button>
            </div>

            <div class="module-card">
              <div>
                <span class="pill-tag green">⚡ Práctica Intensiva</span>
                <h3 style="margin-top:8px;">Medio Simulacro (36 Preguntas)</h3>
                <p class="module-desc" style="margin-top:6px;">Ideal para sesiones de estudio de 1 hora cubriendo todas las fases de la Ley N° 32069. Duración: <strong>60 minutos</strong>.</p>
              </div>
              <button class="btn btn-success" style="width:100%" onclick="startExam(36, 60, 'ALL', 'Medio Simulacro OECE (36 preg.)')">
                Iniciar Medio Simulacro (36) →
              </button>
            </div>

            <div class="module-card">
              <div>
                <span class="pill-tag gold">🚀 Evaluación Express</span>
                <h3 style="margin-top:8px;">Simulacro Rápido (20 Preguntas)</h3>
                <p class="module-desc" style="margin-top:6px;">Mide tu velocidad y precisión en <strong>30 minutos</strong> con 20 preguntas aleatorias del Balotario 2026.</p>
              </div>
              <button class="btn btn-gold" style="width:100%" onclick="startExam(20, 30, 'ALL', 'Simulacro Rápido (20 preg.)')">
                Iniciar Simulacro Rápido (20) →
              </button>
            </div>

            <div class="module-card" style="border:2px solid #10b981;">
              <div>
                <span class="pill-tag green">🎯 Especial Casuísticas</span>
                <h3 style="margin-top:8px;">Simulacro de Topes y Casuísticas (25 Preg.)</h3>
                <p class="module-desc" style="margin-top:6px;">Enfocado 100% en <strong>montos en S/, UIT, porcentajes, plazos legales y casos prácticos</strong> de entidades públicas. Duración: <strong>40 minutos</strong>.</p>
              </div>
              <button class="btn btn-primary" style="width:100%; background:#10b981" onclick="startExam(25, 40, 'TOPES_CASUISTICA', 'Simulacro Especial de Topes y Casuísticas')">
                Iniciar Simulacro Topes (25) →
              </button>
            </div>

            <div class="module-card" style="border:2px solid #0284c7;">
              <div>
                <span class="pill-tag" style="background:rgba(2,132,199,0.2); color:#38bdf8;">🌐 Portales Externos OECE / SICAN</span>
                <h3 style="margin-top:8px;">Simulacro Fijas Externas (35 Preguntas)</h3>
                <p class="module-desc" style="margin-top:6px;">Recopilación exclusiva de casuísticas reales extraídas de portales de preparación OECE/SICAN (Segmentación, Subsanación Art. 78, Retención 10% MYPE/480k/5M, Desierto, AGA y Topes). Duración: <strong>50 minutos</strong>.</p>
              </div>
              <button class="btn btn-primary" style="width:100%; background:#0284c7" onclick="startExam(35, 50, 'EXTERNAL_SIM', '🌐 Simulacro Portales Externos OECE / SICAN')">
                Iniciar Simulacro Externo (35) →
              </button>
            </div>

            <div class="module-card" style="border:2px solid #ef4444;">
              <div>
                <span class="pill-tag" style="background:rgba(239,68,68,0.2); color:#f87171;">🔥 Modo Muerte Súbita</span>
                <h3 style="margin-top:8px;">Reto Racha Perfecta (15 Sin Fallar)</h3>
                <p class="module-desc" style="margin-top:6px;">Intenta responder <strong>15 preguntas seguidas sin un solo error</strong>. Si fallas una, te corrige al instante explicándote la respuesta y puedes reiniciar la racha. Récord actual: <strong>🏆 ${state.bestSuddenDeathStreak || 0} seguidas</strong>.</p>
              </div>
              <button class="btn btn-primary" style="width:100%; background:#ef4444" onclick="startExam(15, 25, 'ALL', '🔥 Reto Muerte Súbita (15 Sin Errores)', true)">
                Iniciar Muerte Súbita (15) →
              </button>
            </div>
          </div>

          <div style="border-top:1px solid var(--border-color); padding-top:18px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span style="font-weight:700; font-size:0.9rem;">O rinde un Simulacro Especializado por Módulo (20 preguntas / 30 min):</span>
            <select id="simModuleSelect" class="control-select" style="flex:1; min-width:240px;">
              ${modules.map(m => `<option value="${m.id}">${m.code}: ${m.title}</option>`).join('')}
            </select>
            <button class="btn btn-outline" onclick="startModuleExam()">Iniciar por Módulo →</button>
          </div>
        </div>
      `;
      return;
    }

    if (activeExam.finished) {
      renderExamResults(container);
      return;
    }

    // Active Exam in progress
    const q = activeExam.questions[activeExam.currentIndex];
    const selected = activeExam.answers[q.id] || null;
    const isFlagged = !!activeExam.flagged[q.id];
    const answeredCount = Object.keys(activeExam.answers).length;
    if (typeof activeExam.instantFeedback === 'undefined') {
      activeExam.instantFeedback = true;
    }
    const showInstant = !!activeExam.instantFeedback && !!selected;
    const isSelectedCorrect = selected === q.correct;

    const correctOptObj = q.options.find(o => o.letter === q.correct) || { text: '', why: '' };
    const selectedOptObj = q.options.find(o => o.letter === selected) || { text: '', why: '' };

    let liveCorrectCount = 0;
    let liveWrongCount = 0;
    activeExam.questions.forEach(item => {
      const a = activeExam.answers[item.id];
      if (a) {
        if (a === item.correct) liveCorrectCount++;
        else liveWrongCount++;
      }
    });

    container.innerHTML = `
      <div class="exam-layout">
        <div class="question-box">
          <div class="question-meta-bar">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="pill-tag">${escapeHtml(activeExam.title)}</span>
              <span class="pill-tag gold">Pregunta ${activeExam.currentIndex + 1} de ${activeExam.questions.length}</span>
              ${activeExam.suddenDeath ? `
                <span class="pill-tag" style="background:rgba(239,68,68,0.2); color:#f87171; font-weight:800;">
                  🔥 Racha Sin Errores: ${activeExam.currentStreak || 0} · 🏆 Récord: ${state.bestSuddenDeathStreak || 0}
                </span>
              ` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:700; cursor:pointer; background:rgba(16,185,129,0.15); color:#34d399; padding:6px 10px; border-radius:6px; border:1px solid rgba(16,185,129,0.4);">
                <input type="checkbox" ${activeExam.instantFeedback ? 'checked' : ''} onchange="toggleExamInstantFeedback(this.checked)" />
                ⚡ Corrección Inmediata Activa
              </label>
              <button class="btn ${state.highlightClues ? 'btn-gold' : 'btn-outline'} btn-sm" onclick="toggleHighlightClues()" title="Resaltar montos, plazos y palabras gatillo del caso">
                🖍️ Pistas Clave
              </button>
              <button class="btn btn-outline btn-sm" onclick="useFiftyFifty(${q.id})" title="Descartar 2 opciones trampa (50/50)">
                ✂️ 50/50 Descartar 2
              </button>
              <button class="btn btn-outline btn-sm" onclick="speakCurrentQuestion(${q.id})" title="Escuchar pregunta y explicación en voz alta">
                🔊 Escuchar
              </button>
              <button class="btn btn-outline btn-sm" onclick="stopSpeech()" title="Detener voz">
                ⏹️
              </button>
              <button class="btn ${isFlagged ? 'btn-gold' : 'btn-outline'} btn-sm" onclick="toggleExamFlag(${q.id})">
                🚩 ${isFlagged ? 'Marcada' : 'Marcar'}
              </button>
            </div>
          </div>

          <div class="question-stem">
            ${activeExam.currentIndex + 1}. ${formatQuestionStem(q.question)}
          </div>

          ${showInstant ? `
            <div class="option-inline-feedback ${isSelectedCorrect ? 'feedback-correct' : 'feedback-user-wrong'}" style="margin-bottom:16px; padding:14px 16px; font-size:0.95rem;">
              ${isSelectedCorrect ? `
                <div style="font-weight:800; font-size:1.04rem; margin-bottom:4px;">
                  🎉 ¡MUY BIEN, ACERTASTE AL INSTANTE! (Opción ${q.correct}) ${activeExam.suddenDeath ? `· 🔥 ¡Llevas ${activeExam.currentStreak || 1} seguida(s) sin fallar!` : ''}
                </div>
                <div><strong>¿Por qué es correcta?:</strong> ${escapeHtml(correctOptObj.why || q.explanation)}</div>
              ` : `
                <div style="font-weight:800; font-size:1.04rem; margin-bottom:6px;">
                  ${activeExam.suddenDeath ? '💥 ¡SE ROMPIÓ LA RACHA EN MUERTE SÚBITA! — ' : ''}❌ TE EQUIVOCASTE EN ESTA PREGUNTA (Marcaste la ${selected}, pero la correcta es la ${q.correct})
                </div>
                <div style="margin-bottom:6px;">
                  <strong>🔴 ¿Por qué fallaste al elegir la Opción ${selected} («${escapeHtml(selectedOptObj.text)}»)?:</strong><br/>
                  ${escapeHtml(selectedOptObj.why || 'No corresponde a lo establecido en la Ley N° 32069 y su Reglamento.')}
                </div>
                <div style="padding-top:6px; border-top:1px dashed rgba(248,113,113,0.4); color:#34d399;">
                  <strong>✅ TENLO EN CUENTA PARA LA PRÓXIMA VEZ — La respuesta correcta es la Opción ${q.correct} («${escapeHtml(correctOptObj.text)}»):</strong><br/>
                  ${escapeHtml(correctOptObj.why || q.explanation)}
                </div>
              `}
              <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                ${activeExam.suddenDeath && !isSelectedCorrect ? `
                  <button class="btn btn-primary btn-sm" style="background:#ef4444" onclick="startExam(15, 25, 'ALL', '🔥 Reto Muerte Súbita (15 Sin Errores)', true)">
                    🔥 Reiniciar Racha Muerte Súbita desde 0
                  </button>
                ` : ''}
                ${activeExam.currentIndex < activeExam.questions.length - 1 ? `
                  <button class="btn btn-primary btn-sm" onclick="stepExamQuestion(1)">
                    ➡️ Entendido, Siguiente Pregunta →
                  </button>
                ` : `
                  <button class="btn btn-success btn-sm" onclick="finishExam()">
                    ✅ Entendido, Calificar Simulacro →
                  </button>
                `}
              </div>
            </div>
          ` : ''}

          <div class="options-list">
            ${q.options.map(opt => {
              let cls = 'option-btn';
              let inlineHtml = '';
              const discardedList = (window._fiftyFiftyMap && window._fiftyFiftyMap[q.id]) || [];
              const isDiscarded = !selected && discardedList.includes(opt.letter);
              if (isDiscarded) {
                cls += ' discarded-5050';
                inlineHtml = `
                  <div class="option-inline-feedback feedback-other-wrong">
                    <strong>✂️ DESCARTADA POR 50/50 · ¿Por qué es trampa?:</strong> ${escapeHtml(opt.why || '')}
                  </div>
                `;
              }
              if (showInstant) {
                if (opt.letter === q.correct) {
                  cls += ' correct';
                  inlineHtml = `
                    <div class="option-inline-feedback feedback-correct">
                      <strong>${selected === opt.letter ? '🎉 ¡ACERTASTE! ¿Por qué está bien?' : '✅ ESTA ES LA RESPUESTA CORRECTA · Tenla en cuenta para la próxima vez'}:</strong><br/>
                      ${escapeHtml(opt.why || '')}
                    </div>
                  `;
                } else if (opt.letter === selected) {
                  cls += ' wrong';
                  inlineHtml = `
                    <div class="option-inline-feedback feedback-user-wrong">
                      <strong>❌ TU ELECCIÓN INCORRECTA · ¿Por qué fallaste aquí?:</strong><br/>
                      ${escapeHtml(opt.why || '')}
                    </div>
                  `;
                } else {
                  inlineHtml = `
                    <div class="option-inline-feedback feedback-other-wrong">
                      <strong>🚫 ¿Por qué se descarta la opción ${opt.letter}?:</strong> ${escapeHtml(opt.why || '')}
                    </div>
                  `;
                }
              } else if (selected === opt.letter) {
                cls += ' selected';
              }

              return `
                <button class="${cls}" style="flex-direction:column; align-items:stretch;" onclick="selectExamOption(${q.id}, '${opt.letter}')">
                  <div style="display:flex; align-items:flex-start; gap:14px; width:100%;">
                    <span class="option-letter">${opt.letter}</span>
                    <span style="flex:1">${escapeHtml(opt.text)}</span>
                  </div>
                  ${inlineHtml}
                </button>
              `;
            }).join('')}
          </div>

          ${showInstant ? `
            <div class="explanation-panel ${isSelectedCorrect ? 'is-correct' : 'is-wrong'}">
              <div class="explanation-status" style="color:${isSelectedCorrect ? 'var(--success)' : 'var(--danger)'}">
                ${isSelectedCorrect
                  ? `✅ ¡Respuesta Correcta! Elegiste la opción ${q.correct}`
                  : `📌 Corrección Inmediata: Marcaste la opción ${selected}, pero la respuesta correcta es la ${q.correct}`
                }
              </div>
              <div class="explanation-text">${escapeHtml(q.explanation)}</div>
              <div class="fija-alert">💡 <strong>Regla de Oro para no volver a fallar:</strong> ${escapeHtml(q.examTip)}</div>
            </div>
          ` : ''}

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:28px; padding-top:18px; border-top:1px solid var(--border-color);">
            <button class="btn btn-outline" ${activeExam.currentIndex === 0 ? 'disabled' : ''} onclick="stepExamQuestion(-1)">
              ← Anterior
            </button>
            <span style="font-size:0.85rem; color:var(--text-muted)">
              Respondidas: <strong>${answeredCount} / ${activeExam.questions.length}</strong>
            </span>
            ${activeExam.currentIndex < activeExam.questions.length - 1 ? `
              <button class="btn btn-primary" onclick="stepExamQuestion(1)">
                Siguiente →
              </button>
            ` : `
              <button class="btn btn-success" onclick="finishExam()">
                ✅ Finalizar y Calificar Simulacro
              </button>
            `}
          </div>
        </div>

        <div class="exam-sidebar-panel">
          <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:6px; text-align:center;">
            Tiempo Restante
          </div>
          <div class="timer-box" id="examTimerDisplay">${formatSeconds(activeExam.remainingSec)}</div>

          ${activeExam.instantFeedback ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
              <div style="background:rgba(16,185,129,0.14); border:1px solid rgba(16,185,129,0.4); border-radius:8px; padding:8px; text-align:center;">
                <div style="font-size:0.7rem; color:#34d399; font-weight:700;">✅ ACIERTOS</div>
                <div style="font-size:1.2rem; font-weight:800; color:#34d399;">${liveCorrectCount}</div>
              </div>
              <div style="background:rgba(239,68,68,0.14); border:1px solid rgba(239,68,68,0.4); border-radius:8px; padding:8px; text-align:center;">
                <div style="font-size:0.7rem; color:#f87171; font-weight:700;">❌ ERRORES</div>
                <div style="font-size:1.2rem; font-weight:800; color:#f87171;">${liveWrongCount}</div>
              </div>
            </div>
          ` : ''}

          <div style="font-size:0.8rem; font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between;">
            <span>Navegador de Preguntas</span>
            <span>${answeredCount}/${activeExam.questions.length}</span>
          </div>
          <div class="question-palette">
            ${activeExam.questions.map((item, i) => {
              let cls = 'palette-btn';
              let customStyle = '';
              if (i === activeExam.currentIndex) cls += ' current';
              const ans = activeExam.answers[item.id];
              if (activeExam.flagged[item.id]) {
                cls += ' flagged';
              } else if (ans) {
                if (activeExam.instantFeedback) {
                  if (ans === item.correct) {
                    customStyle = 'background:#10b981; color:#fff; border-color:#059669;';
                  } else {
                    customStyle = 'background:#ef4444; color:#fff; border-color:#dc2626;';
                  }
                } else {
                  cls += ' answered';
                }
              }
              return `<button class="${cls}" style="${customStyle}" onclick="jumpExamQuestion(${i})">${i + 1}</button>`;
            }).join('')}
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-success" style="width:100%" onclick="finishExam()">
              ✅ Entregar y Calificar Examen
            </button>
            <button class="btn btn-outline btn-sm" style="width:100%; color:var(--danger)" onclick="cancelExam()">
              ✖ Cancelar Simulacro
            </button>
          </div>
        </div>
      </div>
    `;
  }

  window.startModuleExam = function () {
    const sel = document.getElementById('simModuleSelect');
    const modId = sel ? sel.value : 'M1';
    const mod = (window.OECE_MODULES || []).find(m => m.id === modId);
    startExam(20, 30, modId, `Simulacro ${mod ? mod.code : modId}`);
  };

  window.startExam = function (count, durationMin, moduleFilter, title, suddenDeath) {
    let pool = (window.OECE_QUESTIONS || []).filter(q => q.isDuplicateOf === null);
    if (moduleFilter === 'TOPES_CASUISTICA') {
      pool = (window.OECE_QUESTIONS || []).filter(q => isTopeOrCasuisticaQuestion(q));
    } else if (moduleFilter === 'EXTERNAL_SIM') {
      pool = (window.OECE_QUESTIONS || []).filter(q => q.isExternalSim || q.isWebFija);
    } else if (moduleFilter === 'WEB_FIJAS') {
      pool = (window.OECE_QUESTIONS || []).filter(q => q.isWebFija || isTopeOrCasuisticaQuestion(q));
    } else if (moduleFilter === 'MISTAKES_ONLY') {
      const wrongPool = (window.OECE_QUESTIONS || []).filter(q => state.answered[q.id] && !state.answered[q.id].isCorrect);
      if (wrongPool.length > 0) pool = wrongPool;
    } else if (moduleFilter !== 'ALL') {
      pool = (window.OECE_QUESTIONS || []).filter(q => q.module === moduleFilter);
    }
    // Shuffle pool
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(count, shuffled.length));

    activeExam = {
      id: 'OECE-' + Date.now().toString(36).toUpperCase(),
      title,
      questions: chosen,
      answers: {},
      flagged: {},
      currentIndex: 0,
      durationSec: durationMin * 60,
      remainingSec: durationMin * 60,
      instantFeedback: true,
      suddenDeath: !!suddenDeath,
      currentStreak: 0,
      finished: false,
      result: null
    };

    if (examTimerInterval) clearInterval(examTimerInterval);
    examTimerInterval = setInterval(() => {
      if (!activeExam || activeExam.finished) {
        clearInterval(examTimerInterval);
        return;
      }
      activeExam.remainingSec--;
      const timerEl = document.getElementById('examTimerDisplay');
      if (timerEl) timerEl.textContent = formatSeconds(activeExam.remainingSec);
      if (activeExam.remainingSec <= 0) {
        clearInterval(examTimerInterval);
        finishExam(true);
      }
    }, 1000);

    renderSimulator();
  };

  window.selectExamOption = function (qid, letter) {
    if (!activeExam || activeExam.finished) return;
    const prevAns = activeExam.answers[qid];
    activeExam.answers[qid] = letter;
    const q = activeExam.questions.find(item => item.id === qid);
    if (q) {
      const isOk = letter === q.correct;
      if (!prevAns && activeExam.suddenDeath) {
        if (isOk) {
          activeExam.currentStreak = (activeExam.currentStreak || 0) + 1;
          if (activeExam.currentStreak > (state.bestSuddenDeathStreak || 0)) {
            state.bestSuddenDeathStreak = activeExam.currentStreak;
          }
        } else {
          activeExam.currentStreak = 0;
        }
      }
      state.answered[qid] = {
        selected: letter,
        isCorrect: isOk,
        attempts: (state.answered[qid] ? state.answered[qid].attempts : 0) + 1
      };
      saveState();
    }
    renderSimulator();
  };

  window.toggleExamInstantFeedback = function (checked) {
    if (!activeExam || activeExam.finished) return;
    activeExam.instantFeedback = !!checked;
    renderSimulator();
  };

  window.toggleExamFlag = function (qid) {
    if (!activeExam || activeExam.finished) return;
    activeExam.flagged[qid] = !activeExam.flagged[qid];
    renderSimulator();
  };

  window.stepExamQuestion = function (delta) {
    if (!activeExam) return;
    const next = activeExam.currentIndex + delta;
    if (next >= 0 && next < activeExam.questions.length) {
      activeExam.currentIndex = next;
      renderSimulator();
    }
  };

  window.jumpExamQuestion = function (idx) {
    if (!activeExam) return;
    activeExam.currentIndex = idx;
    renderSimulator();
  };

  window.cancelExam = function () {
    if (examTimerInterval) clearInterval(examTimerInterval);
    activeExam = null;
    renderSimulator();
  };

  window.finishExam = function (autoByTimeout) {
    if (!activeExam || activeExam.finished) return;
    if (examTimerInterval) clearInterval(examTimerInterval);

    let correctCount = 0;
    activeExam.questions.forEach(q => {
      const sel = activeExam.answers[q.id];
      const isOk = sel === q.correct;
      if (isOk) correctCount++;
      if (sel) {
        state.answered[q.id] = {
          selected: sel,
          isCorrect: isOk,
          attempts: (state.answered[q.id] ? state.answered[q.id].attempts : 0) + 1
        };
      }
    });

    const total = activeExam.questions.length;
    const scorePct = Math.round((correctCount / total) * 100);
    const levelAchieved = evaluateCertLevel(scorePct);
    const usedSec = activeExam.durationSec - Math.max(0, activeExam.remainingSec);

    const record = {
      id: activeExam.id,
      date: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      mode: activeExam.title,
      total,
      correct: correctCount,
      scorePct,
      levelAchieved,
      durationSec: usedSec
    };

    activeExam.finished = true;
    activeExam.result = record;
    state.examHistory.unshift(record);
    saveState();
    renderSimulator();
  };

  function renderExamResults(container) {
    const res = activeExam.result;
    const passed = res.scorePct >= 58;

    container.innerHTML = `
      <div class="question-box" style="text-align:center; border-top:6px solid ${passed ? 'var(--success)' : 'var(--danger)'}">
        <div style="font-size:3rem; margin-bottom:8px;">${passed ? '🏆' : '📚'}</div>
        <span class="pill-tag ${passed ? 'green' : ''}">Código de Evaluación: ${res.id}</span>
        <h2 style="font-size:1.75rem; margin:10px 0 6px;">
          ${passed ? `¡Felicitaciones, ${escapeHtml(state.userName)}! Simulacro Aprobado` : 'Simulacro Finalizado · Sigue Reforzando'}
        </h2>
        <p style="color:var(--text-secondary); margin-bottom:20px;">
          Obtuviste <strong>${res.correct} de ${res.total}</strong> respuestas correctas (<strong>${res.scorePct}%</strong>) en ${formatSeconds(res.durationSec)}.
          Nivel OECE alcanzado en esta prueba: <strong style="color:var(--primary)">${res.levelAchieved}</strong>.
        </p>

        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          ${passed ? `
            <button class="btn btn-gold" onclick="switchView('certificate')">
              🎓 Ver e Imprimir mi Certificado OECE →
            </button>
          ` : ''}
          <button class="btn btn-primary" onclick="cancelExam()">
            🔄 Configurar Nuevo Simulacro
          </button>
          <button class="btn btn-outline" onclick="practiceMistakes()">
            🧠 Repasar Preguntas Falladas
          </button>
        </div>
      </div>

      <div class="section-header" style="margin-top:28px;">
        <h3 class="section-title">📋 Revisión Detallada Pregunta por Pregunta con Sustento Legal</h3>
      </div>

      ${activeExam.questions.map((q, idx) => {
        const userAns = activeExam.answers[q.id] || null;
        const isOk = userAns === q.correct;

        return `
          <div class="question-box" style="border-left:5px solid ${isOk ? 'var(--success)' : 'var(--danger)'}">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <span class="pill-tag">Pregunta ${idx + 1} (Balotario #${q.id}) · ${escapeHtml(q.concept)}</span>
              <span style="font-weight:800; color:${isOk ? 'var(--success)' : 'var(--danger)'}">
                ${isOk
                  ? `✅ ¡Acertaste! Elegiste la opción ${q.correct}`
                  : (userAns ? `❌ Te equivocaste (Elegiste la ${userAns} y la correcta era la ${q.correct})` : `⚪ Sin responder (La correcta era la ${q.correct})`)
                }
              </span>
            </div>
            <div style="font-weight:700; font-size:1.05rem; margin-bottom:14px;">
              ${escapeHtml(q.question)}
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
              ${q.options.map(opt => {
                const isThisCorrect = opt.letter === q.correct;
                const isUserChoice = opt.letter === userAns;
                let boxCls = 'feedback-other-wrong';
                let titleBadge = `🚫 Opción ${opt.letter} (Incorrecta):`;

                if (isThisCorrect) {
                  boxCls = 'feedback-correct';
                  titleBadge = isUserChoice
                    ? `🎉 Opción ${opt.letter} (TU RESPUESTA · ¡CORRECTA!):`
                    : `✅ Opción ${opt.letter} (RESPUESTA CORRECTA):`;
                } else if (isUserChoice) {
                  boxCls = 'feedback-user-wrong';
                  titleBadge = `❌ Opción ${opt.letter} (TU ELECCIÓN · ¿Por qué te equivocaste?):`;
                }

                return `
                  <div class="option-inline-feedback ${boxCls}" style="margin-top:0;">
                    <div style="font-weight:700; margin-bottom:3px;">${titleBadge} «${escapeHtml(opt.text)}»</div>
                    <div>${escapeHtml(opt.why || '')}</div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:8px; font-size:0.88rem; white-space:pre-line;">
              <strong>📚 Resumen Normativo:</strong>\n${escapeHtml(q.explanation)}
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  // 6. CERTIFICATE & HISTORY
  function renderCertificate() {
    const container = document.getElementById('certificateContent');
    if (!container) return;

    const stats = computeGlobalStats();
    const bestExam = state.examHistory.reduce((best, cur) => (!best || cur.scorePct > best.scorePct ? cur : best), null);
    const certScore = bestExam ? bestExam.scorePct : (stats.totalAnswered >= 10 ? stats.accuracy : 85);
    const certLevel = evaluateCertLevel(certScore) === 'En Proceso' ? state.targetLevel : evaluateCertLevel(certScore);
    const certCode = bestExam ? bestExam.id : 'OECE-32069-2026-CERT';
    const certDate = bestExam ? bestExam.date : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="section-header no-print">
        <div>
          <h2 class="section-title">🎓 Mi Certificación de Preparación OECE & Historial de Simulacros</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Certificado digital personalizable listo para imprimir o guardar en PDF como constancia de dominio de la Ley N° 32069 y su Reglamento D.S. N° 009-2025-EF.</p>
        </div>
        <button class="btn btn-primary" onclick="window.print()">
          🖨️ Imprimir / Guardar Certificado en PDF
        </button>
      </div>

      <div class="certificate-container">
        <div class="cert-seal">🏛️</div>
        <div class="cert-header">PROGRAMA ESPECIALIZADO DE PREPARACIÓN Y CERTIFICACIÓN PÚBLICA</div>
        <div class="cert-title">CERTIFICADO DE COMPETENCIA OECE</div>
        <div style="font-size:0.95rem; color:#475569;">Se otorga la presente certificación a:</div>
        <div class="cert-recipient">${escapeHtml(state.userName || 'PARTICIPANTE OECE')}</div>
        <div class="cert-body">
          Por haber acreditado satisfactoriamente el dominio teórico y práctico del <strong>Nuevo Marco Normativo de la Ley N° 32069 – Ley General de Contrataciones Públicas</strong> y su <strong>Reglamento aprobado por Decreto Supremo N° 009-2025-EF</strong>, abarcando las competencias de <em>Actuaciones Preparatorias, PLADICOP, Procedimientos de Selección, Ejecución Contractual, JPRD, Arbitraje, Régimen Sancionador (TCP), Contrataciones de Emergencia y Mecanismos Diferenciados de Adquisición (MDA)</em>.
        </div>

        <div style="display:inline-flex; gap:24px; flex-wrap:wrap; justify-content:center; background:#f8fafc; border:1px solid #cbd5e1; padding:14px 28px; border-radius:10px; margin-bottom:10px;">
          <div>
            <div style="font-size:0.72rem; text-transform:uppercase; color:#64748b; font-weight:700;">NIVEL ALCANZADO</div>
            <div style="font-size:1.15rem; font-weight:800; color:#1e3a8a;">NIVEL ${certLevel.toUpperCase()}</div>
          </div>
          <div>
            <div style="font-size:0.72rem; text-transform:uppercase; color:#64748b; font-weight:700;">CALIFICACIÓN OBTENIDA</div>
            <div style="font-size:1.15rem; font-weight:800; color:#059669;">${certScore}% DE EFECTIVIDAD</div>
          </div>
          <div>
            <div style="font-size:0.72rem; text-transform:uppercase; color:#64748b; font-weight:700;">CÓDIGO DE VERIFICACIÓN</div>
            <div style="font-size:1.05rem; font-weight:800; color:#0f172a; font-family:monospace;">${certCode}</div>
          </div>
        </div>

        <div class="cert-signatures">
          <div class="cert-sig-block">
            <strong>Dirección Académica OECE 360°</strong><br/>
            Ley N° 32069 & D.S. N° 009-2025-EF
          </div>
          <div class="cert-sig-block">
            <strong>Fecha de Emisión</strong><br/>
            ${certDate}
          </div>
        </div>
      </div>

      <div class="no-print" style="margin-top:32px;">
        <h3 class="section-title" style="margin-bottom:14px;">📊 Historial de Simulacros Rendidos (${state.examHistory.length})</h3>
        ${state.examHistory.length === 0 ? `
          <div class="question-box" style="text-align:center; padding:28px;">
            <p style="color:var(--text-secondary); margin-bottom:12px;">Aún no has finalizado ningún simulacro cronometrado. ¡Rinde tu primer simulacro para registrar tu puntaje oficial en el certificado!</p>
            <button class="btn btn-primary" onclick="switchView('simulator')">Ir al Simulador de Examen →</button>
          </div>
        ` : `
          <div style="overflow-x:auto;">
            <table class="cheatsheet-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Fecha y Hora</th>
                  <th>Modalidad</th>
                  <th>Resultado</th>
                  <th>Puntaje (%)</th>
                  <th>Nivel OECE</th>
                </tr>
              </thead>
              <tbody>
                ${state.examHistory.map(h => `
                  <tr>
                    <td style="font-family:monospace; font-weight:700;">${h.id}</td>
                    <td>${h.date}</td>
                    <td>${escapeHtml(h.mode)}</td>
                    <td><strong>${h.correct} / ${h.total}</strong></td>
                    <td style="font-weight:800; color:${h.scorePct >= 58 ? 'var(--success)' : 'var(--danger)'}">${h.scorePct}%</td>
                    <td><span class="pill-tag ${h.scorePct >= 70 ? 'green' : 'gold'}">${h.levelAchieved}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // UTILITIES
  function formatSeconds(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.updateUserName = function (val) {
    state.userName = val.trim() || 'PARTICIPANTE OECE';
    saveState();
  };

  window.updateTargetLevel = function (val) {
    state.targetLevel = val;
    saveState();
    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id === 'view-dashboard') renderDashboard();
  };

  function updateThemeButtonLabel() {
    const btn = document.getElementById('topbarThemeBtn');
    if (btn) {
      btn.innerHTML = state.theme === 'dark' ? '🌙 Modo Oscuro Activo' : '☀️ Modo Claro Activo';
    }
  }

  window.toggleTheme = function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeButtonLabel();
    saveState();
  };

  window.resetAllProgress = function () {
    if (!confirm('¿Estás seguro de que deseas reiniciar tus estadísticas de respuestas y simulacros?')) return;
    const name = state.userName;
    state = JSON.parse(JSON.stringify(defaultState));
    state.userName = name;
    saveState();
    renderDashboard();
  };

  window.toggleMobileSidebar = function () {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('open');
  };

  window.togglePlanDay = function (dayId, checked) {
    state.plan7Days = state.plan7Days || {};
    state.plan7Days[dayId] = !!checked;
    saveState();
    renderDashboard();
  };

  window.toggleHighlightClues = function () {
    state.highlightClues = !state.highlightClues;
    saveState();
    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id === 'view-simulator') {
      renderSimulator();
    } else {
      renderTrainer();
    }
  };

  function formatQuestionStem(rawText) {
    const safe = escapeHtml(rawText || '');
    if (!state.highlightClues) return safe;
    return safe.replace(
      /(\b\d+\s*(?:UIT|días\s+hábiles|días\s+calendario|años|meses|%)|S\/\s*[\d,.\s]+|\b(?:PLADICOP|JPRD|TCP|DEC|Contrato\s+Menor|Licitación\s+Pública(?:\s+Abreviada)?|Concurso\s+Público(?:\s+Abreviado)?|Situación\s+de\s+Emergencia|Contraloría|fraccionamiento|silencio\s+positivo|aprobación\s+automática|vicios\s+ocultos)\b)/gi,
      '<mark style="background:rgba(251,191,36,0.28); color:#fde68a; padding:1px 5px; border-radius:4px; font-weight:800;">$1</mark>'
    );
  }

  window._fiftyFiftyMap = {};
  window.useFiftyFifty = function (qid) {
    const q = (window.OECE_QUESTIONS || []).find(item => item.id === qid);
    if (!q) return;
    const wrongLetters = q.options.filter(o => o.letter !== q.correct).map(o => o.letter);
    const shuffled = [...wrongLetters].sort(() => Math.random() - 0.5);
    window._fiftyFiftyMap[qid] = shuffled.slice(0, 2);

    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id === 'view-simulator') {
      renderSimulator();
    } else {
      renderTrainer();
    }
  };

  window.exportProgressCode = function () {
    try {
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
        alert('✅ ¡Código de progreso copiado al portapapeles! Envíatelo por WhatsApp a tu celular y pégalo con el botón «📥 Pegar Progreso».');
      } else {
        prompt('Copia este código y pégalo en tu celular:', code);
      }
    } catch (e) {
      alert('No se pudo generar el código de sincronización.');
    }
  };

  window.importProgressCode = function () {
    const code = prompt('📥 Pega aquí el código de progreso que copiaste desde tu PC o Celular:');
    if (!code || !code.trim()) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (parsed && typeof parsed === 'object') {
        state = Object.assign({}, defaultState, parsed);
        saveState();
        renderDashboard();
        alert('🎉 ¡Progreso sincronizado con éxito!');
      }
    } catch (e) {
      alert('❌ El código ingresado no es válido.');
    }
  };

  // Keyboard shortcuts in Trainer and Simulator
  document.addEventListener('keydown', function (e) {
    const activeSection = document.querySelector('.view-section.active');
    if (!activeSection) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    const key = e.key.toUpperCase();
    if (activeSection.id === 'view-trainer') {
      if (['A', 'B', 'C', 'D'].includes(key)) {
        const filtered = getFilteredTrainerQuestions();
        const q = filtered[state.trainerFilter.currentIndex];
        if (q) answerTrainerQuestion(q.id, key);
      } else if (e.key === 'ArrowRight') {
        stepTrainerQuestion(1);
      } else if (e.key === 'ArrowLeft') {
        stepTrainerQuestion(-1);
      }
    } else if (activeSection.id === 'view-simulator' && activeExam && !activeExam.finished) {
      const q = activeExam.questions[activeExam.currentIndex];
      if (['A', 'B', 'C', 'D'].includes(key) && q) {
        selectExamOption(q.id, key);
      } else if (e.key === 'ArrowRight') {
        stepExamQuestion(1);
      } else if (e.key === 'ArrowLeft') {
        stepExamQuestion(-1);
      }
    }
  });

  // 7. SIMULADOR INTERACTIVO DE TOPES, PLAZOS Y CASUÍSTICAS (LABORATORIO DINÁMICO)
  let currentDynamicCase = null;

  const DYNAMIC_ENTITIES = [
    'AGROBANCO', 'el Ministerio de Desarrollo Agrario y Riego (MIDAGRI)', 'el Ministerio de Salud (MINSA)',
    'el Gobierno Regional de Arequipa', 'la Municipalidad Provincial de Cusco', 'el Ministerio de Transportes y Comunicaciones (MTC)',
    'la Autoridad Nacional del Agua (ANA)', 'el Gobierno Regional de Piura', 'el Hospital Nacional Cayetano Heredia'
  ];

  window.generateDynamicCase = function () {
    const entity = DYNAMIC_ENTITIES[Math.floor(Math.random() * DYNAMIC_ENTITIES.length)];
    const caseTypes = ['BIENES_LP_ABREV', 'BIENES_LP', 'CONSULTORIA_CP', 'OBRA_ADICIONAL', 'OBRA_JPRD', 'EMERGENCIA_MASIVA', 'SERVICIO_MENOR_FRACC'];
    const picked = caseTypes[Math.floor(Math.random() * caseTypes.length)];

    if (picked === 'BIENES_LP_ABREV') {
      const monto = (Math.floor(Math.random() * 35) + 8) * 10000; // 80,000 to 420,000
      const garantia = Math.round(monto * 0.10);
      currentDynamicCase = {
        badge: 'Caso Práctico: Cuantía y Topes en Bienes',
        scenario: `${entity} requiere adquirir equipos de laboratorio y cómputo especializado (que no se encuentran en Catálogo Electrónico ni cuentan con Ficha Técnica) por una cuantía actualizada de S/ ${monto.toLocaleString('es-PE')}.`,
        q1: {
          label: '1. Según los topes del Reglamento D.S. N° 009-2025-EF, ¿qué procedimiento de selección corresponde convocar?',
          options: ['Licitación Pública Abreviada', 'Licitación Pública Ordinaria', 'Concurso Público', 'Contrato Menor (≤ 8 UIT)'],
          correct: 'Licitación Pública Abreviada',
          explain: `Como el objeto es BIENES y el monto (S/ ${monto.toLocaleString('es-PE')}) se ubica en el rango entre S/ 42,800 y S/ 485,000, corresponde convocar una Licitación Pública Abreviada.`
        },
        q2: {
          label: '2. Una vez otorgada y notificada la buena pro en el PLADICOP, ¿cuál es el plazo máximo que tiene un postor para interponer Recurso de Apelación?',
          options: ['5 días hábiles', '8 días hábiles', '10 días calendario', '15 días hábiles'],
          correct: '5 días hábiles',
          explain: 'En todas las Modalidades / Selecciones Abreviadas, el plazo máximo para interponer recurso de apelación es de 5 días hábiles desde la notificación (mientras que en LP/CP ordinaria es de 8 días hábiles).'
        },
        q3: {
          label: '3. Al perfeccionar el contrato, ¿a cuánto asciende la Garantía de Fiel Cumplimiento (10%)?',
          options: [`S/ ${garantia.toLocaleString('es-PE')}`, `S/ ${(garantia * 2).toLocaleString('es-PE')}`, `S/ ${(garantia / 2).toLocaleString('es-PE')}`, 'No requiere garantía ni RNP'],
          correct: `S/ ${garantia.toLocaleString('es-PE')}`,
          explain: `La garantía de fiel cumplimiento equivale al 10% del monto del contrato original: 10% de S/ ${monto.toLocaleString('es-PE')} = S/ ${garantia.toLocaleString('es-PE')}.`
        },
        userAnswers: {}
      };
    } else if (picked === 'BIENES_LP') {
      const monto = (Math.floor(Math.random() * 40) + 52) * 10000; // 520,000 to 910,000
      const garantia = Math.round(monto * 0.10);
      currentDynamicCase = {
        badge: 'Caso Práctico: Bienes Mayores a S/ 485,000',
        scenario: `${entity} planifica en su PAC la adquisición de maquinaria pesada e insumos estratégicos por un valor total de S/ ${monto.toLocaleString('es-PE')}.`,
        q1: {
          label: '1. ¿Qué procedimiento competitivo de selección corresponde aplicar por superar el tope de S/ 485,000 en bienes?',
          options: ['Licitación Pública', 'Licitación Pública Abreviada', 'Concurso Público', 'Comparación de Precios'],
          correct: 'Licitación Pública',
          explain: `Al tratarse de BIENES cuyo monto (S/ ${monto.toLocaleString('es-PE')}) supera el tope de S/ 485,000, el procedimiento obligatorio es la Licitación Pública.`
        },
        q2: {
          label: '2. ¿Cuál es el plazo legal para interponer un Recurso de Apelación contra la buena pro en este procedimiento?',
          options: ['8 días hábiles', '5 días hábiles', '3 días hábiles', '20 días hábiles'],
          correct: '8 días hábiles',
          explain: 'En Licitación Pública y Concurso Público ordinarios, el plazo para interponer recurso de apelación es de 8 días hábiles desde la notificación en el PLADICOP.'
        },
        q3: {
          label: '3. Durante la difusión previa del requerimiento en PLADICOP, ¿cuál es el plazo mínimo para consultas técnicas de proveedores y el plazo de la entidad para absolverlas?',
          options: ['5 días hábiles para consultas y 3 días hábiles para absolver', '10 días para consultas y 10 para absolver', '2 días para consultas y 15 para absolver', 'No se publican en PLADICOP'],
          correct: '5 días hábiles para consultas y 3 días hábiles para absolver',
          explain: 'El Reglamento fija como mínimo 5 días hábiles para formular consultas/comentarios técnicos en PLADICOP y 3 días hábiles para que la entidad contratante los absuelva.'
        },
        userAnswers: {}
      };
    } else if (picked === 'CONSULTORIA_CP') {
      const monto = (Math.floor(Math.random() * 30) + 50) * 10000; // 500,000 to 790,000
      currentDynamicCase = {
        badge: 'Caso Práctico: Consultorías y Servicios (> S/ 485,000)',
        scenario: `${entity} requiere contratar la elaboración del Estudio de Impacto Ambiental y Expediente Técnico de un proyecto de inversión por S/ ${monto.toLocaleString('es-PE')}.`,
        q1: {
          label: '1. ¿Qué error cometería la DEC si convoca una Licitación Pública y qué procedimiento es el correcto?',
          options: ['Corresponde Concurso Público por tratarse de una consultoría mayor a S/ 485,000', 'Corresponde Licitación Pública porque supera S/ 485,000', 'Corresponde Subasta Inversa Electrónica', 'Corresponde Comparación de Precios'],
          correct: 'Corresponde Concurso Público por tratarse de una consultoría mayor a S/ 485,000',
          explain: `Toda consultoría (u obra intelectual como expedientes técnicos, supervisión o estudios ambientales) que supera S/ 485,000 se convoca mediante Concurso Público, nunca por Licitación Pública.`
        },
        q2: {
          label: '2. ¿Qué requisito es obligatorio en el expediente de esta consultoría antes de su aprobación?',
          options: ['Incluir los términos de referencia, presupuesto y la definición obligatoria de los entregables', 'Solo el nombre del consultor elegido a dedo', 'Omitir los entregables hasta el final del contrato', 'Aprobarlo sin participación del área usuaria'],
          correct: 'Incluir los términos de referencia, presupuesto y la definición obligatoria de los entregables',
          explain: 'En toda consultoría es obligatorio definir los entregables dentro del requerimiento/expediente y contar con la participación del área usuaria.'
        },
        q3: {
          label: '3. ¿Por cuántos años como mínimo debe conservar la entidad el expediente de contratación una vez culminado y liquidado el contrato?',
          options: ['Al menos 5 años', 'Solo 1 año', '6 meses', 'Se destruye al día siguiente del pago'],
          correct: 'Al menos 5 años',
          explain: 'El Reglamento exige conservar los expedientes de contratación por un mínimo de 5 años tras la recepción del bien/servicio o liquidación final.'
        },
        userAnswers: {}
      };
    } else if (picked === 'OBRA_ADICIONAL') {
      const montoObra = (Math.floor(Math.random() * 8) + 2) * 1000000; // 2M to 9M
      const pctAdic = 45;
      const montoAdic = Math.round(montoObra * (pctAdic / 100));
      currentDynamicCase = {
        badge: 'Caso Práctico: Topes de Adicionales de Obra (40% y 50%) y Pagos',
        scenario: `Durante la ejecución de una obra de ${entity} contratada por S/ ${montoObra.toLocaleString('es-PE')}, se requiere aprobar prestaciones adicionales acumuladas por S/ ${montoAdic.toLocaleString('es-PE')} (equivalente al ${pctAdic}% del monto contractual).`,
        q1: {
          label: `1. Al representar el ${pctAdic}% del monto del contrato original, ¿qué regla de tope se aplica?`,
          options: ['Requiere autorización expresa previa porque excede el 40% (sin superar el tope máximo del 50%)', 'Puede aprobarse sin autorización porque es menor al 80%', 'Está prohibido porque ningún adicional puede superar el 10%', 'Se aprueba automáticamente por silencio del residente'],
          correct: 'Requiere autorización expresa previa porque excede el 40% (sin superar el tope máximo del 50%)',
          explain: 'En obras, los adicionales que superan el 40% del monto contractual requieren autorización expresa previa, y en ningún caso las modificaciones pueden exceder el 50% del valor original.'
        },
        q2: {
          label: '2. Al aprobarse el adicional de obra, ¿qué obligación inmediata tiene el contratista respecto a su garantía de fiel cumplimiento?',
          options: ['Realizar el ajuste (aumento) proporcional de la garantía de fiel cumplimiento', 'Retirar su garantía antes de terminar la obra', 'Reemplazar la carta fianza por un correo simple', 'Ninguna obligación'],
          correct: 'Realizar el ajuste (aumento) proporcional de la garantía de fiel cumplimiento',
          explain: 'Toda aprobación de prestación adicional que incremente el monto del contrato obliga a actualizar/ajustar proporcionalmente la garantía de fiel cumplimiento (10%).'
        },
        q3: {
          label: '3. Una vez que la entidad otorga la conformidad a una valorización mensual de esta obra, ¿cuál es el plazo máximo legal para efectuar el pago?',
          options: ['Máximo 15 días hábiles', 'Máximo 60 días calendario', 'Máximo 3 días útiles', 'Al año siguiente'],
          correct: 'Máximo 15 días hábiles',
          explain: 'Otorgada la conformidad a una valorización, la entidad debe efectuar el pago en un plazo máximo de 15 días hábiles.'
        },
        userAnswers: {}
      };
    } else if (picked === 'OBRA_JPRD') {
      const dias = 240 + Math.floor(Math.random() * 180); // 240 to 420 days
      currentDynamicCase = {
        badge: 'Caso Práctico: Plazos y Topes de la JPRD (Directiva 002-2025-OECE-CD)',
        scenario: `${entity} suscribe un contrato de obra pública con un plazo de ejecución de ${dias} días calendario, constituyendo una Junta de Prevención y Resolución de Disputas (JPRD).`,
        q1: {
          label: '1. ¿Cuál es el límite mínimo de duración contractual que hace obligatoria la JPRD y mediante qué documento se formaliza?',
          options: ['Mínimo 240 días calendario y se formaliza mediante Contrato Tripartito', 'Mínimo 30 días calendario y basta un correo electrónico', 'Mínimo 500 días y se firma solo con la Contraloría', 'No existe plazo mínimo'],
          correct: 'Mínimo 240 días calendario y se formaliza mediante Contrato Tripartito',
          explain: 'El límite mínimo de duración contractual para aplicar obligatoriamente la JPRD es de 240 días calendario y se formaliza mediante Contrato Tripartito (Entidad, Centro y Adjudicador).'
        },
        q2: {
          label: '2. Luego de activado el encargo de la JPRD, ¿en qué plazo máximo debe programarse la primera reunión y cuántos días adicionales puede pedir la JPRD ante una consulta de alta complejidad?',
          options: ['Primera reunión en máx. 5 días hábiles; extensión por complejidad hasta 15 días hábiles adicionales', 'Primera reunión en 30 días; extensión de 90 días', 'Primera reunión en 1 día; sin extensión posible', 'Primera reunión al terminar la obra'],
          correct: 'Primera reunión en máx. 5 días hábiles; extensión por complejidad hasta 15 días hábiles adicionales',
          explain: 'La primera reunión se programa en un máximo de 5 días hábiles tras activarse el encargo, y ante alta complejidad la JPRD puede solicitar hasta 15 días hábiles adicionales.'
        },
        q3: {
          label: '3. Si la JPRD emite una Recomendación vs. una Decisión, ¿cuáles son los plazos exactos para la Entidad?',
          options: ['Recomendación: 7 días hábiles para pronunciarse | Decisión: firme en 7 días calendario sin objeción y 10 días calendario para iniciar implementación', 'Recomendación: 30 días | Decisión: 60 días', 'Ambas son de 2 días útiles', 'No son vinculantes en ningún caso'],
          correct: 'Recomendación: 7 días hábiles para pronunciarse | Decisión: firme en 7 días calendario sin objeción y 10 días calendario para iniciar implementación',
          explain: '¡Fija absoluta de examen! Recomendación = 7 días hábiles para aceptar/rechazar. Decisión = 7 días calendario para quedar firme sin objeción y 10 días calendario para iniciar su implementación.'
        },
        userAnswers: {}
      };
    } else if (picked === 'EMERGENCIA_MASIVA') {
      currentDynamicCase = {
        badge: 'Caso Práctico: Emergencias y Contratos de Contingencia (Título VI)',
        scenario: `Ante un sismo de nivel 5 e inundaciones severas, ${entity} activa contratos de contingencia y ejecuta 25 contrataciones no competitivas en un mes para atender la emergencia.`,
        q1: {
          label: '1. ¿Qué condición es indispensable para los Contratos de Contingencia y qué modalidad de pago utilizan para bienes/servicios escasos en emergencias?',
          options: ['Su ejecución está condicionada a un evento futuro e incierto y utilizan Pago por Disponibilidad', 'Se ejecutan solo para comprar útiles de oficina con pago al contado', 'Duran máximo 15 días sin evento futuro', 'Solo aplican a consultorías jurídicas'],
          correct: 'Su ejecución está condicionada a un evento futuro e incierto y utilizan Pago por Disponibilidad',
          explain: 'Los Contratos de Contingencia (preparación ante emergencias) están condicionados a un evento futuro e incierto y aplican la modalidad de Pago por Disponibilidad (si el evento no ocurre en 18 meses se mantiene el pago periódico, y a los 3 años puede ampliarse vía adenda).'
        },
        q2: {
          label: '2. ¿Cuál es el plazo de regularización ordinario para un servicio en emergencia versus el plazo especial cuando se realizan 25 contrataciones directas en un mes?',
          options: ['Ordinario: 20 días hábiles desde el inicio del servicio | Masivo (25 contrataciones en un mes): 40 días hábiles', 'Ordinario: 5 días | Masivo: 10 días', 'No se regularizan nunca', 'Ordinario: 60 días | Masivo: 120 días'],
          correct: 'Ordinario: 20 días hábiles desde el inicio del servicio | Masivo (25 contrataciones en un mes): 40 días hábiles',
          explain: 'El plazo máximo ordinario para regularizar una contratación directa de emergencia es de 20 días hábiles, ampliándose a 40 días hábiles ante contrataciones masivas en un mes.'
        },
        q3: {
          label: '3. ¿En qué supuesto se exonera la carta fianza de fiel cumplimiento en emergencia y cuál es el tope de pago adelantado para el Gobierno Nacional?',
          options: ['Se exonera fianza en contrataciones no competitivas de emergencia realizadas en 72 horas (y tras conformidad en consultoría); adelanto máx. de 30 UIT en Gobierno Nacional', 'Nunca se exonera la fianza y está prohibido el pago adelantado', 'Se exonera en todos los contratos de 5 años y el adelanto es de 500 UIT', 'Solo lo decide el proveedor'],
          correct: 'Se exonera fianza en contrataciones no competitivas de emergencia realizadas en 72 horas (y tras conformidad en consultoría); adelanto máx. de 30 UIT en Gobierno Nacional',
          explain: 'En emergencias realizadas en 72 horas se exonera la carta fianza de fiel cumplimiento, y el Gobierno Nacional puede otorgar pagos adelantados de hasta 30 UIT.'
        },
        userAnswers: {}
      };
    } else {
      currentDynamicCase = {
        badge: 'Caso Práctico: Prohibición de Fraccionamiento y Contratos Menores',
        scenario: `${entity} intenta emitir en el mismo trimestre 6 órdenes de servicio separadas por S/ 35,000 cada una (acumulando S/ 210,000) con el mismo objeto de mantenimiento preventivo de sus sedes regionales, sin haber consolidado el requerimiento.`,
        q1: {
          label: '1. ¿Qué infracción normativa se configura al dividir artificialmente esta necesidad previsible?',
          options: ['Fraccionamiento ilegal por desagregación artificial para evadir un procedimiento competitivo más riguroso', 'Es válido porque cada orden es menor a 8 UIT', 'Es una Compra Pública de Innovación', 'Es un Acuerdo Marco automático'],
          correct: 'Fraccionamiento ilegal por desagregación artificial para evadir un procedimiento competitivo más riguroso',
          explain: 'Cuando existe identidad técnica y oportunidad dentro del mismo ejercicio fiscal, la entidad debe consolidar la contratación. Dividirla en compras menores para evadir el procedimiento competitivo (S/ 210,000 correspondía a Concurso Público Abreviado) constituye fraccionamiento ilegal.'
        },
        q2: {
          label: '2. Antes de realizar una contratación menor legítima (ej. limpieza por S/ 38,000 para una sede recién creada), ¿qué debe verificar obligatoriamente la DEC?',
          options: ['Que no exista una contratación similar previa dentro del mismo ejercicio fiscal y si está cubierta en almacén/PAC', 'Solo que el proveedor tenga redes sociales', 'Pedir permiso al Congreso de la República', 'No verificar nada'],
          correct: 'Que no exista una contratación similar previa dentro del mismo ejercicio fiscal y si está cubierta en almacén/PAC',
          explain: 'Para no incurrir en fraccionamiento, la DEC debe verificar los antecedentes de contrataciones similares realizadas en los últimos meses dentro del mismo ejercicio fiscal.'
        },
        q3: {
          label: '3. En caso se inicie un Procedimiento Administrativo Sancionador (PAS) ante el TCP por una infracción de un proveedor, ¿cuál es el plazo para presentar descargos y el plazo de la Fase Instructiva?',
          options: ['10 días hábiles para descargos y máximo 4 meses para que la Fase Instructiva emita su informe final', '2 días para descargos y 12 meses de fase instructiva', '30 días para descargos y 2 años de fase instructiva', 'No existe derecho a descargos'],
          correct: '10 días hábiles para descargos y máximo 4 meses para que la Fase Instructiva emita su informe final',
          explain: 'En el PAS del TCP, la Secretaría Técnica (órgano instructor) otorga 10 días hábiles para descargos y cuenta con un máximo de 4 meses para emitir el informe final.'
        },
        userAnswers: {}
      };
    }

    renderTopesSimulator();
  };

  window.answerDynamicSubQ = function (subKey, selectedVal) {
    if (!currentDynamicCase) return;
    const prev = currentDynamicCase.userAnswers[subKey];
    currentDynamicCase.userAnswers[subKey] = selectedVal;
    if (!prev) {
      state.topesLabScore = state.topesLabScore || { solved: 0, correct: 0 };
      state.topesLabScore.solved++;
      if (selectedVal === currentDynamicCase[subKey].correct) {
        state.topesLabScore.correct++;
      }
      saveState();
    }
    renderTopesSimulator();
  };

  let topesActiveTab = 'SLIDER'; // 'SLIDER' | 'GAME' | 'LADDERS' | 'LAB'
  let topesSliderState = {
    monto: 180000,
    objeto: 'BIENES',
    plazoObraDias: 180,
    pctAdicional: 15
  };

  const TOPES_QUICK_GAME_ITEMS = [
    {
      badge: '💰 TOPE EN UIT / SOLES',
      prompt: 'Una entidad necesita comprar repuestos por S/ 36,000 (equivale a ~6.7 UIT). ¿Qué figura aplica?',
      options: ['Contrato Menor (≤ 8 UIT)', 'LP Abreviada (> 8 UIT)', 'Comparación de Precios Ordinaria', 'Subasta Inversa Electrónica obligatoria'],
      correct: 'Contrato Menor (≤ 8 UIT)',
      mnemonic: '🧠 Truco «El 8 Mágico»: Todo lo que sea menor o igual a 8 UIT (S/ 42,800) es SIEMPRE Contrato Menor (contratación directa no competitiva).'
    },
    {
      badge: '🏛️ COMPETENCIA DE APELACIÓN',
      prompt: 'El proceso de selección tiene una cuantía de S/ 310,000 (~58 UIT) y un postor apela la buena pro. ¿Quién resuelve?',
      options: ['El Titular de la Entidad (≤ 50 UIT)', 'El Tribunal de Contrataciones Públicas - TCP (> 50 UIT)', 'El Juez Contencioso Administrativo', 'La JPRD'],
      correct: 'El Tribunal de Contrataciones Públicas - TCP (> 50 UIT)',
      mnemonic: '🧠 Truco «Media Centena = 50 UIT»: Hasta 50 UIT (S/ 267,500) resuelve la Entidad. Si pasa 1 sol de 50 UIT, sube directo al Tribunal (TCP).'
    },
    {
      badge: '⏱️ PLAZO DE APELACIÓN',
      prompt: 'Se otorgó la buena pro en una Licitación Pública Abreviada (S/ 190,000). ¿Cuántos días hábiles hay para apelar?',
      options: ['5 días hábiles', '8 días hábiles', '3 días hábiles', '10 días hábiles'],
      correct: '5 días hábiles',
      mnemonic: '🧠 Truco «Mano Chica (5) vs. Mano Grande (8)»: Modalidades Abreviadas / SIE / Comparación de Precios = 5 días hábiles. LP y CP Ordinarias = 8 días hábiles.'
    },
    {
      badge: '⏱️ PLAZO DE APELACIÓN',
      prompt: 'Se otorgó la buena pro en una Licitación Pública Ordinaria (S/ 850,000). ¿Cuántos días hábiles hay para apelar?',
      options: ['5 días hábiles', '8 días hábiles', '10 días hábiles', '15 días hábiles'],
      correct: '8 días hábiles',
      mnemonic: '🧠 Truco «Mano Chica (5) vs. Mano Grande (8)»: Como supera S/ 485,000 es LP Ordinaria (proceso grande) -> Plazo grande de 8 días hábiles.'
    },
    {
      badge: '📊 ESCALERA DE PORCENTAJES',
      prompt: '¿Cuál es el porcentaje que se retiene como Garantía de Fiel Cumplimiento y también el tope máximo de penalidad por mora?',
      options: ['10% del monto del contrato vigente', '15% del monto del contrato', '25% del monto del contrato', '5% del monto del contrato'],
      correct: '10% del monto del contrato vigente',
      mnemonic: '🧠 Truco «El 10% Doble»: Tanto la Garantía de Fiel Cumplimiento como el tope máximo de Penalidades (mora u otras) son exactamente el 10%.'
    },
    {
      badge: '📊 ESCALERA DE PORCENTAJES',
      prompt: 'En un contrato de Bienes, Servicios o Consultoría de Obra, ¿hasta qué porcentaje puede ordenar la Entidad prestaciones adicionales o reducciones?',
      options: ['Hasta el 25% del monto del contrato original', 'Hasta el 15% del monto del contrato', 'Hasta el 30% del monto del contrato', 'Hasta el 50% del monto del contrato'],
      correct: 'Hasta el 25% del monto del contrato original',
      mnemonic: '🧠 Truco «Un Cuarto de Queso (25%)»: Para bienes, servicios y consultorías, el límite de adicionales y reducciones es siempre 1/4 del contrato = 25%.'
    },
    {
      badge: '🏗️ ESCALERA DE PORCENTAJES EN OBRAS',
      prompt: 'En Ejecución de Obras, ¿cuál es el tope de adicionales que aprueba directamente el Titular de la Entidad sin ir a la Contraloría?',
      options: ['Hasta el 15% del monto original', 'Hasta el 30% del monto original', 'Hasta el 50% del monto original', 'Hasta el 10% del monto original'],
      correct: 'Hasta el 15% del monto original',
      mnemonic: '🧠 Truco «Escalera de Obras 15% -> 30% -> 50%»: ≤15% aprueba el Titular solo; >15% hasta 30% requiere autorización previa de la CGR; >30% hasta 50% es excepcional.'
    },
    {
      badge: '🏗️ ESCALERA DE PORCENTAJES EN OBRAS',
      prompt: 'En una obra pública, ¿qué ocurre si las prestaciones adicionales acumuladas superan el 50% del monto original del contrato?',
      options: ['Se resuelve el contrato de pleno derecho', 'Se pide permiso al MEF', 'Se firma una adenda indefinida', 'Se somete a JPRD'],
      correct: 'Se resuelve el contrato de pleno derecho',
      mnemonic: '🧠 Truco «Mitad = Muerte del Contrato (50%)»: Ninguna obra soporta más de 50% de adicionales; pasando el 50% se resuelve el contrato.'
    },
    {
      badge: '⚖️ JPRD EN OBRAS',
      prompt: '¿A partir de qué plazo de ejecución es OBLIGATORIO incluir la Junta de Prevención y Resolución de Disputas (JPRD) en contratos de obra?',
      options: ['Obras con plazo igual o mayor a 240 días calendario (~8 meses)', 'Obras mayores a 60 días calendario', 'Todas las obras sin excepción', 'Solo obras mayores a 365 días'],
      correct: 'Obras con plazo igual o mayor a 240 días calendario (~8 meses)',
      mnemonic: '🧠 Truco «8 Meses x 30 días = 240 días»: Obra larga (≥ 240 días calendario) lleva JPRD obligatoria desde el inicio.'
    },
    {
      badge: '🚨 SITUACIÓN DE EMERGENCIA',
      prompt: 'Realizada la entrega del bien o primera entrega en Situación de Emergencia, ¿cuál es el plazo máximo para regularizar la documentación?',
      options: ['Máximo 20 días hábiles', 'Máximo 10 días hábiles', 'Máximo 30 días calendario', 'Máximo 15 días hábiles'],
      correct: 'Máximo 20 días hábiles',
      mnemonic: '🧠 Truco «Emergencia 20»: En la nueva Ley 32069 tienes hasta 20 días hábiles para regularizar los informes, expediente y contrato.'
    },
    {
      badge: '⏱️ MODIFICACIÓN DE CONTRATO',
      prompt: 'Presentada una solicitud de ampliación de plazo o modificación contractual por el contratista, ¿en cuántos días hábiles resuelve y notifica la Entidad (bienes/servicios)?',
      options: ['10 días hábiles (si no responde, opera silencio positivo)', '5 días hábiles', '15 días calendario', '30 días hábiles'],
      correct: '10 días hábiles (si no responde, opera silencio positivo)',
      mnemonic: '🧠 Truco «10 Días o Gana el Contratista»: Si la Entidad no notifica su decisión en 10 días hábiles, se tiene por APROBADA automáticamente.'
    },
    {
      badge: '🎓 CERTIFICACIÓN SICAN - OECE',
      prompt: 'En el examen oficial de 72 preguntas del OECE, ¿cuáles son los puntajes mínimos para Básico, Intermedio y Avanzado?',
      options: ['Básico: 30 pts | Intermedio: 43 pts | Avanzado: 58 pts', 'Básico: 25 pts | Intermedio: 40 pts | Avanzado: 50 pts', 'Básico: 36 pts | Intermedio: 50 pts | Avanzado: 65 pts', 'Básico: 20 pts | Intermedio: 35 pts | Avanzado: 55 pts'],
      correct: 'Básico: 30 pts | Intermedio: 43 pts | Avanzado: 58 pts',
      mnemonic: '🧠 Truco «30 - 43 - 58 (Vigencia 2 años)»: Oficial de Compras/Comité requiere Intermedio (43 pts) y Jefe DEC requiere Avanzado (58 pts).'
    }
  ];

  let topesQuickGameState = {
    idx: 0,
    streak: 0,
    bestStreak: 0,
    selected: null
  };

  const TOPES_TRAP_ITEMS = [
    {
      topic: 'Modalidad de Selección',
      statement: '«Para comprar bienes por S/ 150,000 en el año 2026 se convoca una Adjudicación Simplificada (AS).»',
      isTrue: false,
      why: '🚨 ¡ES UNA TRAMPA CLÁSICA! La "Adjudicación Simplificada" pertenecía a la derogada Ley 30225. En la nueva Ley N° 32069 se denomina Licitación Pública Abreviada (para bienes/obras) o Concurso Público Abreviado (para servicios/consultorías).'
    },
    {
      topic: 'Competencia de Apelación',
      statement: '«Si un procedimiento de selección tiene una cuantía de 48 UIT (S/ 256,800), el recurso de apelación lo resuelve el Titular de la Entidad.»',
      isTrue: true,
      why: '✅ ¡VERDADERO! El tope de competencia es 50 UIT (S/ 267,500). Como 48 UIT no supera las 50 UIT, resuelve la Entidad. Solo cuando es mayor a 50 UIT (> 50 UIT) pasa al Tribunal (TCP).'
    },
    {
      topic: 'Plazo para Regularizar Emergencia',
      statement: '«En una contratación directa por Situación de Emergencia, el plazo máximo para regularizar la documentación es de 10 días hábiles desde la entrega.»',
      isTrue: false,
      why: '🚨 ¡ES UNA TRAMPA! El plazo de 10 días era de la norma anterior. Con el Reglamento D.S. N° 009-2025-EF (Ley 32069), el plazo máximo para regularizar una emergencia se amplió hasta 20 días hábiles.'
    },
    {
      topic: 'Ampliación de Plazo Contractual',
      statement: '«Si el contratista solicita una ampliación de plazo en bienes o servicios y la Entidad no notifica su decisión en 10 días hábiles, la solicitud queda aprobada automáticamente (silencio positivo).»',
      isTrue: true,
      why: '✅ ¡VERDADERO! La Entidad tiene 10 días hábiles para resolver y notificar a través de la PLADICOP; si no lo hace dentro de ese plazo, opera la aprobación automática bajo responsabilidad del Titular.'
    },
    {
      topic: 'JPRD Obligatoria en Obras',
      statement: '«Toda obra pública con plazo de ejecución igual o mayor a 240 días calendario debe incluir obligatoriamente una Junta de Prevención y Resolución de Disputas (JPRD).»',
      isTrue: true,
      why: '✅ ¡VERDADERO! Recuerda el truco: 8 meses x 30 días = 240 días calendario. Si el plazo de la obra es ≥ 240 días calendario, la JPRD es obligatoria.'
    },
    {
      topic: 'Tope de Adicionales en Obras',
      statement: '«El Titular de la Entidad puede aprobar por sí solo adicionales de obra de hasta el 25% del monto original sin pedir autorización a la Contraloría.»',
      isTrue: false,
      why: '🚨 ¡ES UNA TRAMPA! El 25% es solo para bienes, servicios y consultorías. En EJECUCIÓN DE OBRAS, el Titular aprueba solo hasta el 15%; si pasa del 15% hasta el 30%, requiere autorización previa de la Contraloría (CGR).'
    },
    {
      topic: 'Garantía en Contrato Menor',
      statement: '«En un Contrato Menor de S/ 38,000 (≤ 8 UIT), el proveedor está obligado a presentar carta fianza por el 10% de garantía de fiel cumplimiento.»',
      isTrue: false,
      why: '🚨 ¡ES UNA TRAMPA! Los Contratos Menores (≤ 8 UIT = S/ 42,800) están EXONERADOS de presentar garantía de fiel cumplimiento.'
    },
    {
      topic: 'Plazo de Apelación en LP Abreviada',
      statement: '«El plazo para apelar el otorgamiento de la buena pro en una Licitación Pública Abreviada es de 5 días hábiles.»',
      isTrue: true,
      why: '✅ ¡VERDADERO! En modalidades abreviadas (LP Abreviada, CP Abreviado), Subasta Inversa Electrónica y Comparación de Precios el plazo es 5 días hábiles (y 8 días hábiles en LP/CP Ordinarias).'
    }
  ];

  let topesTrapState = {
    idx: 0,
    streak: 0,
    selected: null // true | false
  };

  window.answerTopesTrap = function (choiceBool) {
    if (topesTrapState.selected !== null) return;
    topesTrapState.selected = choiceBool;
    const item = TOPES_TRAP_ITEMS[topesTrapState.idx];
    if (choiceBool === item.isTrue) {
      topesTrapState.streak++;
    } else {
      topesTrapState.streak = 0;
    }
    renderTopesSimulator();
  };

  window.nextTopesTrap = function () {
    topesTrapState.idx = (topesTrapState.idx + 1) % TOPES_TRAP_ITEMS.length;
    topesTrapState.selected = null;
    renderTopesSimulator();
  };

  const TOPES_DECISION_TREES = [
    {
      id: 'AMPLIACION',
      title: '⏱️ Árbol 1: Solicitud de Ampliación de Plazo / Modificación Contractual',
      subtitle: '¿Qué hacer cuando el contratista pide más plazo por atrasos o paralizaciones?',
      steps: [
        {
          step: 'PASO 1 · Hecho Generador',
          question: '¿Finalizó el hecho generador del atraso o paralización ajeno a la voluntad del contratista?',
          yes: 'El contratista presenta su solicitud sustentada ante la Entidad.',
          no: 'Si el evento aún no termina, puede solicitar ampliación parcial si es indispensable.'
        },
        {
          step: 'PASO 2 · Plazo de la Entidad para Resolver y Notificar',
          question: '¿En cuántos días hábiles debe resolver la Entidad y notificar su decisión a través de la PLADICOP (bienes y servicios)?',
          yes: '✅ En un máximo de 10 DÍAS HÁBILES contados desde el día siguiente de recibida la solicitud.',
          no: '🚨 ¡CUIDADO CON EL SILENCIO POSITIVO! Si la Entidad NO notifica en esos 10 días hábiles, se tiene por APROBADA automáticamente bajo responsabilidad del Titular.'
        },
        {
          step: 'PASO 3 · Efecto sobre Garantías y Gastos Generales',
          question: '¿Qué pasa una vez aprobada la ampliación de plazo?',
          yes: 'Se actualiza el cronograma contractual y se reconocen los costos directos y gastos generales variables debidamente acreditados.',
          no: 'Recuerda: Nunca confundas los 10 días hábiles para resolver ampliación con los 5 u 8 días hábiles de apelación.'
        }
      ]
    },
    {
      id: 'ADICIONALES',
      title: '🏗️ Árbol 2: Prestaciones Adicionales (Bienes/Servicios vs. Obras)',
      subtitle: 'Ruta exacta según el objeto contractual y el porcentaje acumulado',
      steps: [
        {
          step: 'PASO 1 · Identifica el Objeto del Contrato',
          question: '¿El contrato es de Bienes, Servicios o Consultoría de Obra?',
          yes: '✅ Tope máximo de adicionales o reducciones = HASTA EL 25% del monto del contrato original (siempre que sea indispensable para la finalidad del contrato).',
          no: 'Si es EJECUCIÓN DE OBRA, pasa al Paso 2 (Escalera 15% → 30% → 50%).'
        },
        {
          step: 'PASO 2 · Escalera en Ejecución de Obras (15% y 30%)',
          question: 'En Ejecución de Obra, ¿el adicional acumulado supera el 15% del monto original?',
          yes: '🔶 Si es > 15% y hasta el 30%: Requiere aprobación del Titular de la Entidad + AUTORIZACIÓN PREVIA de la Contraloría General de la República (CGR) antes de la ejecución y pago.',
          no: '🟢 Si es ≤ 15%: Lo aprueba directamente el Titular de la Entidad (o funcionario delegado según ley) sin ir a la Contraloría.'
        },
        {
          step: 'PASO 3 · Límite Absoluto del 50% en Obras',
          question: '¿Qué ocurre si los adicionales acumulados en una obra superan el 50% del monto original?',
          yes: '🛑 SE RESUELVE EL CONTRATO de pleno derecho. Ninguna obra puede superar el 50% en prestaciones adicionales.',
          no: 'Si está entre >30% y 50%, es excepcionalísimo con autorización previa de la CGR.'
        }
      ]
    },
    {
      id: 'APELACION',
      title: '⚖️ Árbol 3: Recurso de Apelación en la Selección',
      subtitle: 'Cómo determinar en 5 segundos el plazo para apelar y quién resuelve',
      steps: [
        {
          step: 'PASO 1 · ¿Cuál es el plazo para interponer la apelación?',
          question: '¿El procedimiento es una Modalidad Abreviada (LP/CP Abreviada), Subasta Inversa Electrónica o Comparación de Precios?',
          yes: '✅ Plazo = 5 DÍAS HÁBILES siguientes de notificado el otorgamiento de la buena pro en SEACE/PLADICOP.',
          no: '🔵 Si es Licitación Pública (LP) o Concurso Público (CP) Ordinario → Plazo = 8 DÍAS HÁBILES.'
        },
        {
          step: 'PASO 2 · ¿Quién es competente para resolver la apelación? (Frontera 50 UIT)',
          question: '¿La cuantía del procedimiento de selección es menor o igual a 50 UIT (≤ S/ 267,500)?',
          yes: '🏛️ Resuelve el TITULAR DE LA ENTIDAD convocante.',
          no: '⚖️ Si supera las 50 UIT (> S/ 267,500), resuelve el TRIBUNAL DE CONTRATACIONES PÚBLICAS (TCP) del OECE.'
        },
        {
          step: 'PASO 3 · ¿Qué pasa si falta un requisito de admisibilidad?',
          question: '¿El postor omitió algún requisito subsanable al presentar su apelación?',
          yes: '⏱️ La Unidad de Trámite Documentario le otorga 2 DÍAS HÁBILES para subsanar la omisión.',
          no: 'Si no subsana en esos 2 días hábiles, el recurso se tiene por NO PRESENTADO.'
        }
      ]
    },
    {
      id: 'INCUMPLIMIENTO',
      title: '🚨 Árbol 4: Penalidades, Mora (10%) y Resolución del Contrato',
      subtitle: 'Cuándo requerir cumplimiento y cuándo resolver directamente',
      steps: [
        {
          step: 'PASO 1 · Cálculo y Tope de Penalidades',
          question: '¿El contratista incurrió en retraso injustificado o en otras penalidades previstas en el contrato?',
          yes: 'Se aplica la penalidad diaria por mora. El TOPE MÁXIMO de penalidad por mora (y de otras penalidades) es el 10% del monto del contrato vigente.',
          no: 'Si el retraso es justificado y aprobado por la Entidad, no se aplica penalidad por mora.'
        },
        {
          step: 'PASO 2 · ¿Se requiere carta previa de apercibimiento?',
          question: '¿El contratista ya acumuló el monto máximo de penalidad por mora (10%) o la situación de incumplimiento es irreversible?',
          yes: '⚡ NO se requiere requerimiento previo: La Entidad puede RESOLVER EL CONTRATO directamente notificando su decisión.',
          no: 'Si es un incumplimiento subsanable y aún no llega al 10% de mora, se le apercibe otorgándole plazo para subsanar bajo apercibimiento de resolver.'
        },
        {
          step: 'PASO 3 · Consecuencias de la Resolución por Culpa del Contratista',
          question: '¿Qué acciones ejecuta la Entidad tras quedar consentida la resolución contractual?',
          yes: '1) Ejecuta el 10% de la Garantía de Fiel Cumplimiento y 2) Comunica la infracción al Tribunal (TCP) para el procedimiento sancionador.',
          no: 'El saldo pendiente de la prestación puede contratarse mediante el mecanismo previsto en el Reglamento.'
        }
      ]
    }
  ];

  let activeTreeId = 'AMPLIACION';

  window.selectDecisionTree = function (treeId) {
    activeTreeId = treeId;
    renderTopesSimulator();
  };

  window.openPocketSummary = function () {
    switchView('topes');
    topesActiveTab = 'POCKET';
    renderTopesSimulator();
  };

  window.openExpress5Min = function () {
    switchView('topes');
    topesActiveTab = 'EXPRESS5';
    renderTopesSimulator();
  };

  const DAYS_GAME_ITEMS = [
    { prompt: "Subsanación de ofertas en la PLADICOP (plazo principal de 2 días + 2 de prórroga, Art. 78.4 D.S. 009-2025-EF)", num: "2 (+2) días", correct: "HABILES", why: "Art. 78.4 D.S. 009-2025-EF: El postor cuenta con 2 DÍAS HÁBILES desde el día siguiente de la notificación en la PLADICOP (+ 2 días hábiles adicionales a solicitud)." },
    { prompt: "Firmeza de una DECISIÓN emitida por la JPRD si ninguna parte la objeta (Directiva 002-2025-OECE-CD)", num: "7 días", correct: "CALENDARIO", why: "¡Trampa clásica de JPRD! La DECISIÓN queda firme en 7 DÍAS CALENDARIO (mientras que el pronunciamiento sobre una Recomendación es en 7 días hábiles)." },
    { prompt: "Pronunciamiento de la Entidad sobre una RECOMENDACIÓN de la JPRD (Directiva 002-2025-OECE-CD)", num: "7 días", correct: "HABILES", why: "En JPRD: Recomendación = 7 DÍAS HÁBILES para pronunciarse. Decisión = 7 días calendario para quedar firme." },
    { prompt: "Plazo de la Entidad para iniciar la implementación de una DECISIÓN firme de la JPRD", num: "10 días", correct: "CALENDARIO", why: "Directiva N° 002-2025-OECE-CD: Una vez firme la decisión de la JPRD, la Entidad tiene 10 DÍAS CALENDARIO para iniciar su implementación." },
    { prompt: "Duración mínima del contrato para que sea OBLIGATORIA la JPRD", num: ">= 240 días", correct: "CALENDARIO", why: "El umbral mínimo de duración contractual para la obligatoriedad de la JPRD es de 240 DÍAS CALENDARIO (~8 meses)." },
    { prompt: "Plazo máximo para pagar una valorización luego de otorgada la conformidad", num: "15 días", correct: "HABILES", why: "El pago de valorizaciones tras su conformidad tiene un plazo máximo de 15 DÍAS HÁBILES." },
    { prompt: "Silencio de la Entidad tras el aviso de culminación de obra (presunción de conformidad)", num: "30 días", correct: "HABILES", why: "Comunicada la culminación de la obra, si la Entidad no se pronuncia en 30 DÍAS HÁBILES se presume legalmente la conformidad." },
    { prompt: "Plazo para interponer Recurso de Apelación (8 en LP/CP y 5 en Modalidad Abreviada)", num: "8 o 5 días", correct: "HABILES", why: "Todos los plazos de impugnación (8 días en LP/CP y 5 días en abreviadas) se computan en DÍAS HÁBILES." },
    { prompt: "Consultas técnicas en la difusión del requerimiento en PLADICOP (5 para proveedores y 3 para absolver)", num: "5 y 3 días", correct: "HABILES", why: "En la difusión del requerimiento por PLADICOP son mínimo 5 DÍAS HÁBILES para consultas y 3 DÍAS HÁBILES para absolución." },
    { prompt: "Regularización de contratación no competitiva por Situación de Emergencia (20 ordinaria / 40 masiva)", num: "20 o 40 días", correct: "HABILES", why: "La regularización en emergencia es de máximo 20 DÍAS HÁBILES (o 40 DÍAS HÁBILES cuando son contrataciones masivas en un mes)." }
  ];

  let daysGameState = { idx: 0, selected: null, streak: 0, best: 0 };

  window.answerDaysGame = function (choice) {
    if (daysGameState.selected) return;
    daysGameState.selected = choice;
    const item = DAYS_GAME_ITEMS[daysGameState.idx];
    if (choice === item.correct) {
      daysGameState.streak++;
      if (daysGameState.streak > daysGameState.best) daysGameState.best = daysGameState.streak;
    } else {
      daysGameState.streak = 0;
    }
    renderTopesSimulator();
  };

  window.nextDaysGame = function () {
    daysGameState.idx = (daysGameState.idx + 1) % DAYS_GAME_ITEMS.length;
    daysGameState.selected = null;
    renderTopesSimulator();
  };

  const ACTORS_GAME_ITEMS = [
    { task: "Aprobar el Expediente de Contratación, el PAC y el proceso de Compatibilización (Directiva 0001-2025-EF/54.01)", correct: "AGA", why: "Art. 25 de la Ley N° 32069: La Autoridad de la Gestión Administrativa (AGA: Secretario General, Gerente General o Gerente Municipal) aprueba el PAC, expedientes y compatibilización." },
    { task: "Evaluar y aprobar el informe para exceptuar el uso de la Subasta Inversa Electrónica (SIE) por riesgo de mercado", correct: "AGA", why: "La Autoridad de la Gestión Administrativa (AGA) evalúa y aprueba exceptuar la SIE previo informe sustentado de la DEC." },
    { task: "Resolver un Recurso de Apelación cuando la cuantía del procedimiento es igual o menor a 50 UIT (<= S/ 267,500)", correct: "AGA", why: "Art. 74 de la Ley N° 32069: En procedimientos de cuantía <= 50 UIT resuelve la Entidad Contratante a través de la Autoridad de la Gestión Administrativa (AGA)." },
    { task: "Resolver un Recurso de Apelación cuando la cuantía del procedimiento SUPERA las 50 UIT (> S/ 267,500)", correct: "TCP", why: "Art. 74 de la Ley N° 32069: Cuando la cuantía supera las 50 UIT (o en Acuerdos Marco), la competencia resolutiva corresponde al Tribunal de Contrataciones Públicas (TCP del OECE)." },
    { task: "Elaborar la Estrategia de Contratación, realizar la Segmentación (Art. 42 y 125) y conducir la Interacción con el Mercado", correct: "DEC", why: "La Dependencia Encargada de las Contrataciones (DEC), a través de sus Oficiales de Compras certificados, elabora la Estrategia de Contratación y realiza la segmentación." },
    { task: "Brindar soporte técnico especializado o formular el requerimiento en proyectos u hospitales de alta complejidad", correct: "ATE", why: "Art. 25 de la Ley N° 32069: El Área Técnica Estratégica (ATE) interviene cuando el requerimiento exige alto nivel de especialización técnica que supera al área usuaria." },
    { task: "Verificar el cumplimiento de las especificaciones técnicas de los bienes entregados y emitir la CONFORMIDAD de recepción", correct: "USUARIA", why: "El Área Usuaria es la responsable de verificar la calidad/cumplimiento de los bienes o servicios y emitir la conformidad (o solicitar su rectificación)." },
    { task: "Imponer sanciones de multa o inhabilitación a proveedores en la Fase Sancionadora del PAS", correct: "TCP", why: "El Tribunal de Contrataciones Públicas (TCP) es el órgano colegiado encargado de la Fase Sancionadora del PAS (mientras la Secretaría Técnica lleva la Fase Instructiva)." }
  ];

  let actorsGameState = { idx: 0, selected: null, streak: 0, best: 0 };

  window.answerActorsGame = function (choice) {
    if (actorsGameState.selected) return;
    actorsGameState.selected = choice;
    const item = ACTORS_GAME_ITEMS[actorsGameState.idx];
    if (choice === item.correct) {
      actorsGameState.streak++;
      if (actorsGameState.streak > actorsGameState.best) actorsGameState.best = actorsGameState.streak;
    } else {
      actorsGameState.streak = 0;
    }
    renderTopesSimulator();
  };

  window.nextActorsGame = function () {
    actorsGameState.idx = (actorsGameState.idx + 1) % ACTORS_GAME_ITEMS.length;
    actorsGameState.selected = null;
    renderTopesSimulator();
  };

  window.setTopesTab = function (tab) {
    topesActiveTab = tab;
    renderTopesSimulator();
  };

  window.updateTopesSlider = function (field, val) {
    if (field === 'monto' || field === 'plazoObraDias' || field === 'pctAdicional') {
      topesSliderState[field] = Number(val);
    } else {
      topesSliderState[field] = val;
    }
    renderTopesSimulator();
  };

  window.answerTopesQuickGame = function (optText) {
    if (topesQuickGameState.selected) return;
    topesQuickGameState.selected = optText;
    const item = TOPES_QUICK_GAME_ITEMS[topesQuickGameState.idx];
    if (optText === item.correct) {
      topesQuickGameState.streak++;
      if (topesQuickGameState.streak > topesQuickGameState.bestStreak) {
        topesQuickGameState.bestStreak = topesQuickGameState.streak;
      }
    } else {
      topesQuickGameState.streak = 0;
    }
    renderTopesSimulator();
  };

  window.nextTopesQuickGame = function () {
    topesQuickGameState.idx = (topesQuickGameState.idx + 1) % TOPES_QUICK_GAME_ITEMS.length;
    topesQuickGameState.selected = null;
    renderTopesSimulator();
  };

  function renderTopesSimulator() {
    const container = document.getElementById('topesContent');
    if (!container) return;

    if (!currentDynamicCase) {
      generateDynamicCase();
      return;
    }

    const labStats = state.topesLabScore || { solved: 0, correct: 0 };
    const labPct = labStats.solved > 0 ? Math.round((labStats.correct / labStats.solved) * 100) : 0;
    const topesPoolCount = (window.OECE_QUESTIONS || []).filter(q => isTopeOrCasuisticaQuestion(q)).length;

    // Cálculos en vivo para Tab 1 (Regla Visual & Termómetro)
    const UIT = 5350;
    const TOPE_8_UIT = 42800;
    const TOPE_50_UIT = 267500;
    const TOPE_ORD_BS = 485000;
    const TOPE_ORD_OBRA = 5000000;

    const m = topesSliderState.monto;
    const obj = topesSliderState.objeto;
    const topeOrd = obj === 'OBRAS' ? TOPE_ORD_OBRA : TOPE_ORD_BS;

    let tramoNum = 1;
    let procNombre = '';
    let plazoApelacion = '';
    let explicacionTramo = '';

    if (m <= TOPE_8_UIT) {
      tramoNum = 1;
      procNombre = '🟢 Contrato Menor (≤ 8 UIT = S/ 42,800)';
      plazoApelacion = 'No aplica apelación de procedimiento competitivo (adquisición directa por DEC)';
      explicacionTramo = 'Cualquier contratación menor o igual a 8 UIT (S/ 42,800) está fuera de los procedimientos competitivos ordinarios y se gestiona como Contrato Menor.';
    } else if (m <= topeOrd) {
      tramoNum = 2;
      procNombre = obj === 'SERVICIOS' || obj === 'CONSULTORIA'
        ? '🟡 Concurso Público Abreviado (CP Abreviado)'
        : '🟡 Licitación Pública Abreviada (LP Abreviada)';
      plazoApelacion = '⏱️ 5 días hábiles siguientes de notificada la buena pro en SEACE/PLADICOP';
      explicacionTramo = `Supera las 8 UIT (S/ 42,800) pero no llega al tope ordinario (${obj === 'OBRAS' ? 'S/ 5,000,000' : 'S/ 485,000'}). Recuerda: ya NO se llama Adjudicación Simplificada.`;
    } else {
      tramoNum = 3;
      procNombre = obj === 'SERVICIOS' || obj === 'CONSULTORIA'
        ? '🔵 Concurso Público Ordinario (CP)'
        : '🔵 Licitación Pública Ordinaria (LP)';
      plazoApelacion = '⏱️ 8 días hábiles siguientes de notificada la buena pro en SEACE/PLADICOP';
      explicacionTramo = `Supera el umbral de modalidad abreviada (${obj === 'OBRAS' ? 'S/ 5,000,000' : 'S/ 485,000'}), por lo que corresponde procedimiento ordinario con plazo de apelación de 8 días hábiles.`;
    }

    const organoApela = m <= TOPE_50_UIT
      ? '🏛️ Titular de la Entidad (porque es ≤ 50 UIT = S/ 267,500)'
      : '⚖️ Tribunal de Contrataciones Públicas - TCP del OECE (porque supera 50 UIT = S/ 267,500)';

    const garantiaMonto = Math.round(m * 0.10);
    const aplicaGarantia = m > TOPE_8_UIT;

    let tabBodyHtml = '';

    if (topesActiveTab === 'SLIDER') {
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #38bdf8;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <span class="pill-tag" style="background:rgba(56,189,248,0.18); color:#38bdf8;">🎚️ REGLA VISUAL EN TIEMPO REAL</span>
              <h3 style="margin-top:6px; font-size:1.15rem;">Mueve el deslizador o haz clic en un monto clave para ver cómo cambian las reglas</h3>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 35000)">S/ 35,000 (6.5 UIT)</button>
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 42800)">S/ 42,800 (8 UIT exactas)</button>
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 180000)">S/ 180,000 (33.6 UIT)</button>
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 267500)">S/ 267,500 (50 UIT exactas)</button>
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 350000)">S/ 350,000 (65.4 UIT)</button>
              <button class="btn btn-outline btn-sm" onclick="updateTopesSlider('monto', 650000)">S/ 650,000 (Ordinario)</button>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; background:var(--bg-elevated); padding:18px; border-radius:12px; border:1px solid var(--border-color);">
            <div>
              <label style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">1. OBJETO DE CONTRATACIÓN</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
                ${[
                  { id: 'BIENES', label: '📦 Bienes' },
                  { id: 'SERVICIOS', label: '🛠️ Servicios' },
                  { id: 'CONSULTORIA', label: '📐 Consultoría Obra' },
                  { id: 'OBRAS', label: '🏗️ Ejecución Obra' }
                ].map(item => `
                  <button class="btn ${obj === item.id ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="updateTopesSlider('objeto', '${item.id}')">
                    ${item.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <div>
              <label style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">
                2. MONTO ESTIMADO: <span style="color:#38bdf8; font-size:1.1rem;">S/ ${m.toLocaleString('es-PE')}</span> (${(m / UIT).toFixed(1)} UIT)
              </label>
              <input type="range" class="range-slider" min="10000" max="1000000" step="2500" value="${Math.min(m, 1000000)}" oninput="updateTopesSlider('monto', this.value)" style="margin-top:14px;" />
              <div style="display:flex; justify-content:space-between; font-size:0.74rem; color:var(--text-muted); margin-top:6px;">
                <span>S/ 10,000</span>
                <span>8 UIT (S/ 42.8k)</span>
                <span>50 UIT (S/ 267.5k)</span>
                <span>Tope (S/ 485k)</span>
                <span>S/ 1,000,000+</span>
              </div>
            </div>
          </div>

          <!-- Termómetro visual de 3 Zonas -->
          <div style="margin-top:18px;">
            <div style="font-size:0.82rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
              🌡️ TERMÓMETRO VISUAL DE PROCEDIMIENTOS (SE ILUMINA EL TRAMO ACTIVO):
            </div>
            <div class="ruler-track">
              <div class="ruler-zone zone-green ${tramoNum === 1 ? 'active-zone' : ''}">
                <div style="font-size:0.78rem; font-weight:800; color:#34d399;">TRAMO 1 · HASTA 8 UIT</div>
                <div style="font-size:0.95rem; font-weight:800; margin:4px 0;">Contrato Menor</div>
                <div style="font-size:0.76rem; color:var(--text-secondary);">≤ S/ 42,800 · Directo por DEC</div>
              </div>
              <div class="ruler-zone zone-amber ${tramoNum === 2 ? 'active-zone' : ''}">
                <div style="font-size:0.78rem; font-weight:800; color:#fbbf24;">TRAMO 2 · MODALIDAD ABREVIADA</div>
                <div style="font-size:0.95rem; font-weight:800; margin:4px 0;">LP / CP Abreviada</div>
                <div style="font-size:0.76rem; color:var(--text-secondary);">> S/ 42,800 hasta ${obj === 'OBRAS' ? 'S/ 5,000,000' : 'S/ 485,000'} · Apelación: 5 días</div>
              </div>
              <div class="ruler-zone zone-blue ${tramoNum === 3 ? 'active-zone' : ''}">
                <div style="font-size:0.78rem; font-weight:800; color:#38bdf8;">TRAMO 3 · RÉGIMEN ORDINARIO</div>
                <div style="font-size:0.95rem; font-weight:800; margin:4px 0;">LP / CP Ordinaria</div>
                <div style="font-size:0.76rem; color:var(--text-secondary);">> ${obj === 'OBRAS' ? 'S/ 5,000,000' : 'S/ 485,000'} · Apelación: 8 días</div>
              </div>
            </div>
          </div>

          <!-- Tarjetas de diagnóstico en vivo -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:14px; margin-top:16px;">
            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #38bdf8;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PROCEDIMIENTO QUE CORRESPONDE</div>
              <div style="font-size:1rem; font-weight:800; margin:6px 0; color:var(--text-main);">${procNombre}</div>
              <div style="font-size:0.8rem; color:var(--text-secondary);">${explicacionTramo}</div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #f59e0b;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">¿QUIÉN RESUELVE LA APELACIÓN? (TOPE 50 UIT)</div>
              <div style="font-size:0.96rem; font-weight:800; margin:6px 0; color:var(--text-main);">${organoApela}</div>
              <div style="font-size:0.8rem; color:var(--text-secondary);">Plazo para apelar: <strong>${plazoApelacion}</strong></div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #10b981;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">GARANTÍA (10%) Y ADICIONALES PERMITIDOS</div>
              <div style="font-size:0.95rem; font-weight:800; margin:6px 0; color:var(--text-main);">
                ${aplicaGarantia ? `Garantía 10%: S/ ${garantiaMonto.toLocaleString('es-PE')}` : 'Exonerado de Garantía de Fiel Cumplimiento (≤ 8 UIT)'}
              </div>
              <div style="font-size:0.8rem; color:var(--text-secondary);">
                ${obj === 'OBRAS'
                  ? 'Adicionales en Obras: ≤15% Titular | >15% a 30% Contraloría (CGR) | >50% se resuelve contrato.'
                  : 'Adicionales/Reducciones en Bienes, Servicios y Consultoría: Hasta 25% (S/ ' + Math.round(m * 0.25).toLocaleString('es-PE') + ').'}
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'GAME') {
      const gItem = TOPES_QUICK_GAME_ITEMS[topesQuickGameState.idx];
      const sel = topesQuickGameState.selected;
      const isRight = sel === gItem.correct;

      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #10b981;">
          <div class="question-meta-bar">
            <div>
              <span class="pill-tag" style="background:rgba(16,185,129,0.2); color:#34d399;">
                🎮 RETO RELÁMPAGO DE MEMORIA · TARJETA ${topesQuickGameState.idx + 1} DE ${TOPES_QUICK_GAME_ITEMS.length}
              </span>
              <span class="pill-tag" style="background:rgba(56,189,248,0.16); color:#38bdf8; margin-left:6px;">
                ${escapeHtml(gItem.badge)}
              </span>
            </div>
            <div style="display:flex; gap:14px; align-items:center;">
              <span style="font-weight:800; color:#f59e0b;">🔥 Racha actual: ${topesQuickGameState.streak}</span>
              <span style="font-size:0.82rem; color:var(--text-secondary);">🏆 Mejor racha: ${topesQuickGameState.bestStreak}</span>
            </div>
          </div>

          <div class="question-stem" style="font-size:1.12rem; margin-bottom:18px;">
            ${escapeHtml(gItem.prompt)}
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:12px;">
            ${gItem.options.map(opt => {
              let cls = 'option-btn';
              let subFeedback = '';
              if (sel) {
                if (opt === gItem.correct) {
                  cls += ' correct';
                  subFeedback = `
                    <div class="option-inline-feedback feedback-correct" style="margin-top:8px;">
                      <strong>${sel === opt ? '🎉 ¡ACERTASTE AL INSTANTE!' : '✅ ESTA ES LA RESPUESTA CORRECTA (Tenla en cuenta para la próxima vez)'}:</strong><br/>
                      ${escapeHtml(gItem.mnemonic)}
                    </div>
                  `;
                } else if (opt === sel && !isRight) {
                  cls += ' wrong';
                  subFeedback = `
                    <div class="option-inline-feedback feedback-user-wrong" style="margin-top:8px;">
                      <strong>❌ TE EQUIVOCASTE AQUÍ (TU ELECCIÓN):</strong><br/>
                      Esta opción NO aplica según los topes de la Ley N° 32069 y D.S. N° 009-2025-EF. Revisa la opción marcada en verde (✅) para no volver a fallar.
                    </div>
                  `;
                }
              }
              return `
                <button class="${cls}" style="flex-direction:column; align-items:stretch;" onclick="answerTopesQuickGame('${escapeHtml(opt).replace(/'/g, "\\'")}')">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
                    <span style="flex:1; font-weight:600;">${escapeHtml(opt)}</span>
                    ${sel && opt === gItem.correct ? '<span>✅</span>' : ''}
                    ${sel && opt === sel && !isRight ? '<span>❌</span>' : ''}
                  </div>
                  ${subFeedback}
                </button>
              `;
            }).join('')}
          </div>

          ${sel ? `
            <div class="explanation-box" style="margin-top:18px; border-left:5px solid ${isRight ? '#10b981' : '#ef4444'};">
              <div style="font-weight:800; font-size:1.02rem; margin-bottom:6px; color:${isRight ? '#34d399' : '#f87171'};">
                ${isRight
                  ? `🎉 ¡CORRECTO! Elegiste «${escapeHtml(gItem.correct)}».`
                  : `❌ CORRECCIÓN INMEDIATA: Elegiste «${escapeHtml(sel)}», pero la RESPUESTA CORRECTA ES «${escapeHtml(gItem.correct)}».`}
              </div>
              <div style="font-size:0.95rem; color:var(--text-main); margin-bottom:8px;">
                <strong>📌 Tenlo en cuenta para la próxima vez:</strong> ${escapeHtml(gItem.mnemonic)}
              </div>
              <div style="margin-top:12px; display:flex; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="nextTopesQuickGame()">Siguiente Tarjeta Relámpago →</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else if (topesActiveTab === 'LADDERS') {
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #f59e0b;">
          <h3 style="font-size:1.15rem; margin-bottom:6px;">🗺️ El Método de las 4 Escaleras Visuales (De menor a mayor)</h3>
          <p style="font-size:0.88rem; color:var(--text-secondary); margin-bottom:18px;">
            En lugar de memorizar datos sueltos, memoriza estas <strong>4 escaleras ordenadas de menor a mayor</strong>. El 95% de preguntas de números del examen OECE sale de aquí:
          </p>

          <div class="ladder-grid">
            <!-- Escalera 1: UIT y Soles -->
            <div style="background:var(--bg-elevated); padding:16px; border-radius:12px; border:1px solid var(--border-color);">
              <h4 style="color:#38bdf8; margin-bottom:10px;">💰 1. Escalera de Montos y UIT (1 UIT = S/ 5,350)</h4>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(16,185,129,0.2); color:#34d399;">≤ 8 UIT</span>
                <div><strong>Contrato Menor (≤ S/ 42,800):</strong> Compra directa por la DEC, sin garantía de fiel cumplimiento.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">≤ 50 UIT</span>
                <div><strong>Apelación ante Entidad (≤ S/ 267,500):</strong> Resuelve el Titular de la Entidad. Si pasa de 50 UIT -> resuelve el TCP.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">S/ 485,000</span>
                <div><strong>Frontera Abreviada vs. Ordinaria (Bienes/Servicios):</strong> Hasta S/ 485k es LP/CP Abreviada; mayor a S/ 485k es LP/CP Ordinaria.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa;">S/ 5,000,000</span>
                <div><strong>Frontera en Obras:</strong> Hasta S/ 5 millones es LP Abreviada de Obra; mayor es LP Ordinaria.</div>
              </div>
            </div>

            <!-- Escalera 2: Porcentajes -->
            <div style="background:var(--bg-elevated); padding:16px; border-radius:12px; border:1px solid var(--border-color);">
              <h4 style="color:#34d399; margin-bottom:10px;">📊 2. Escalera de Porcentajes (10% → 15% → 25% → 30% → 50%)</h4>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(16,185,129,0.2); color:#34d399;">10%</span>
                <div><strong>El 10% Doble:</strong> Garantía de Fiel Cumplimiento (10%) y Tope máximo de Penalidades por mora u otras (10%).</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">15%</span>
                <div><strong>Adicional de Obra por Titular:</strong> Hasta 15% del monto original de obra lo aprueba directo el Titular.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">25%</span>
                <div><strong>Adicionales/Reducciones Bienes y Servicios:</strong> Tope máximo en bienes, servicios y consultorías de obra.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(249,115,22,0.2); color:#fb923c;">>15% a 30%</span>
                <div><strong>Adicional de Obra con Contraloría (CGR):</strong> Requiere autorización previa de la CGR antes del pago.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(239,68,68,0.2); color:#f87171;">> 50%</span>
                <div><strong>Tope Absoluto en Obras:</strong> Si los adicionales de obra superan el 50%, se resuelve el contrato.</div>
              </div>
            </div>

            <!-- Escalera 3: Plazos en Días Hábiles -->
            <div style="background:var(--bg-elevated); padding:16px; border-radius:12px; border:1px solid var(--border-color);">
              <h4 style="color:#fbbf24; margin-bottom:10px;">⏱️ 3. Escalera de Plazos en Días Hábiles (2d → 5d → 8d → 10d → 20d)</h4>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(16,185,129,0.2); color:#34d399;">2 días háb.</span>
                <div>Subsanar requisitos para presentar apelación (2d) y registrar la apelación en el SEACE.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">5 días háb.</span>
                <div>Plazo para apelar <strong>LP/CP Abreviada, SIE y Comparación de Precios</strong>.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">8 días háb.</span>
                <div>Plazo para apelar <strong>Licitación Pública (LP) y Concurso Público (CP) Ordinarios</strong>.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa;">10 días háb.</span>
                <div>Resolver ampliación de plazo / modificación contractual (con <strong>silencio positivo</strong> si la Entidad calla).</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(239,68,68,0.2); color:#f87171;">20 días háb.</span>
                <div>Plazo máximo para <strong>regularizar contrataciones por Situación de Emergencia</strong>.</div>
              </div>
            </div>

            <!-- Escalera 4: Plazos Largos y Certificación -->
            <div style="background:var(--bg-elevated); padding:16px; border-radius:12px; border:1px solid var(--border-color);">
              <h4 style="color:#a78bfa; margin-bottom:10px;">🏛️ 4. Escalera de Ejecución, JPRD y Examen OECE</h4>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">≥ 240 días cal.</span>
                <div>Obras con plazo igual o mayor a <strong>240 días calendario (~8 meses)</strong> llevan <strong>JPRD obligatoria</strong>.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(16,185,129,0.2); color:#34d399;">30 / 43 / 58</span>
                <div>Puntajes mínimos examen OECE (72 preg.): <strong>Básico = 30 | Intermedio = 43 | Avanzado = 58</strong>.</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">1 a 2 años</span>
                <div>Experiencia mínima para certificarse: <strong>Intermedio = 1 año | Avanzado = 2 años</strong> (Vigencia: 2 años).</div>
              </div>
              <div class="ladder-step">
                <span class="ladder-badge" style="background:rgba(239,68,68,0.2); color:#f87171;">3m a 5 años</span>
                <div>Rango de sanción de <strong>inhabilitación temporal</strong> impuesta por el Tribunal (TCP).</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'LAB') {
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #8b5cf6;">
          <div class="question-meta-bar">
            <div>
              <span class="pill-tag" style="background:rgba(139,92,246,0.2); color:#a78bfa;">
                🧪 LABORATORIO DINÁMICO DE CASOS PRÁCTICOS · ${escapeHtml(currentDynamicCase.badge)}
              </span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:0.84rem; color:var(--text-secondary)">
                Sub-preguntas resueltas: <strong>${labStats.correct}/${labStats.solved}</strong> (${labPct}% acierto)
              </span>
              <button class="btn btn-primary btn-sm" onclick="generateDynamicCase()">
                🎲 Generar Nuevo Caso Práctico Aleatorio
              </button>
            </div>
          </div>

          <div style="background:var(--bg-elevated); border-left:4px solid #8b5cf6; padding:16px 20px; border-radius:8px; font-size:1.05rem; font-weight:700; margin-bottom:22px;">
            📋 PLANTEAMIENTO DEL CASO:<br/>
            <span style="font-weight:500; color:var(--text-main);">${escapeHtml(currentDynamicCase.scenario)}</span>
          </div>

          ${['q1', 'q2', 'q3'].map(subKey => {
            const sq = currentDynamicCase[subKey];
            const uAns = currentDynamicCase.userAnswers[subKey] || null;
            const isOk = uAns === sq.correct;

            return `
              <div style="margin-bottom:22px; padding-bottom:18px; border-bottom:1px solid var(--border-color);">
                <div style="font-weight:700; font-size:0.98rem; margin-bottom:10px; color:var(--primary);">
                  ${escapeHtml(sq.label)}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
                  ${sq.options.map(optText => {
                    let cls = 'option-btn';
                    let badgeMsg = '';
                    if (uAns) {
                      if (optText === sq.correct) {
                        cls += ' correct';
                        badgeMsg = `<div style="font-size:0.76rem; color:#34d399; font-weight:700; margin-top:4px;">${uAns === optText ? '🎉 ¡Tu elección es correcta!' : '✅ Esta es la respuesta correcta'}</div>`;
                      } else if (optText === uAns && !isOk) {
                        cls += ' wrong';
                        badgeMsg = `<div style="font-size:0.76rem; color:#f87171; font-weight:700; margin-top:4px;">❌ Tu elección (Incorrecta)</div>`;
                      }
                    }
                    return `
                      <button class="${cls}" style="padding:12px 14px; font-size:0.88rem; flex-direction:column; align-items:stretch;" onclick="answerDynamicSubQ('${subKey}', '${escapeHtml(optText).replace(/'/g, "\\'")}')">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                          <span style="flex:1">${escapeHtml(optText)}</span>
                          ${uAns && optText === sq.correct ? '<span>✅</span>' : ''}
                          ${uAns && optText === uAns && !isOk ? '<span>❌</span>' : ''}
                        </div>
                        ${badgeMsg}
                      </button>
                    `;
                  }).join('')}
                </div>
                ${uAns ? `
                  <div class="option-inline-feedback ${isOk ? 'feedback-correct' : 'feedback-user-wrong'}" style="margin-top:10px; padding:12px 14px;">
                    ${isOk ? `
                      <div style="font-weight:800; margin-bottom:4px;">🎉 ¡ACERTASTE AL INSTANTE! («${escapeHtml(sq.correct)}»)</div>
                      <div><strong>Sustento legal:</strong> ${escapeHtml(sq.explain)}</div>
                    ` : `
                      <div style="font-weight:800; margin-bottom:4px;">❌ TE EQUIVOCASTE: Marcaste «${escapeHtml(uAns)}», pero la RESPUESTA CORRECTA ES «${escapeHtml(sq.correct)}»</div>
                      <div><strong>📌 Tenlo en cuenta para la próxima vez:</strong> ${escapeHtml(sq.explain)}</div>
                    `}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}

          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="generateDynamicCase()">
              🎲 Siguiente Caso Práctico Dinámico →
            </button>
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'TRAPS') {
      const tItem = TOPES_TRAP_ITEMS[topesTrapState.idx];
      const tSel = topesTrapState.selected;
      const tOk = tSel === tItem.isTrue;

      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #ef4444;">
          <div class="question-meta-bar">
            <div>
              <span class="pill-tag" style="background:rgba(239,68,68,0.2); color:#f87171;">
                🕵️ CAZA-TRAMPAS LEY 32069 vs. LEY 30225 · RETO ${topesTrapState.idx + 1} DE ${TOPES_TRAP_ITEMS.length}
              </span>
              <span class="pill-tag gold" style="margin-left:6px;">${escapeHtml(tItem.topic)}</span>
            </div>
            <div style="font-weight:800; color:#f59e0b;">🔥 Racha sin caer en trampas: ${topesTrapState.streak}</div>
          </div>

          <div style="background:var(--bg-elevated); padding:20px; border-radius:10px; border-left:4px solid #f59e0b; font-size:1.12rem; font-weight:700; margin-bottom:18px;">
            🔍 Analiza esta afirmación de examen:<br/>
            <span style="color:var(--text-main); font-weight:600;">${escapeHtml(tItem.statement)}</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
            <button class="option-btn ${tSel !== null ? (tItem.isTrue ? 'correct' : (tSel === true ? 'wrong' : '')) : ''}" style="justify-content:center; font-size:1rem; font-weight:800; padding:16px;" onclick="answerTopesTrap(true)">
              ✅ VERDADERO (Es correcto según Ley 32069)
            </button>
            <button class="option-btn ${tSel !== null ? (!tItem.isTrue ? 'correct' : (tSel === false ? 'wrong' : '')) : ''}" style="justify-content:center; font-size:1rem; font-weight:800; padding:16px;" onclick="answerTopesTrap(false)">
              🚨 ¡ES UNA TRAMPA! (Falso / Ley derogada)
            </button>
          </div>

          ${tSel !== null ? `
            <div class="option-inline-feedback ${tOk ? 'feedback-correct' : 'feedback-user-wrong'}" style="margin-top:18px; padding:16px; font-size:0.95rem;">
              <div style="font-weight:800; font-size:1.05rem; margin-bottom:6px;">
                ${tOk ? '🎉 ¡EXCELENTE! No caíste en la trampa.' : `❌ CAÍSTE EN LA TRAMPA (Elegiste «${tSel ? 'VERDADERO' : 'ES UNA TRAMPA'}», pero era «${tItem.isTrue ? 'VERDADERO' : 'UNA TRAMPA'}»)`}
              </div>
              <div><strong>📌 Tenlo en cuenta para la próxima vez:</strong> ${escapeHtml(tItem.why)}</div>
              <div style="margin-top:12px; display:flex; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="nextTopesTrap()">Siguiente Afirmación Caza-Trampas →</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else if (topesActiveTab === 'TREES') {
      const curTree = TOPES_DECISION_TREES.find(t => t.id === activeTreeId) || TOPES_DECISION_TREES[0];

      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #10b981;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <div>
              <span class="pill-tag green">🌳 ÁRBOLES DE DECISIÓN PASO A PASO</span>
              <h3 style="margin-top:6px; font-size:1.15rem;">Selecciona la situación del expediente para ver la ruta legal paso a paso</h3>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${TOPES_DECISION_TREES.map(t => `
                <button class="btn ${t.id === curTree.id ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="selectDecisionTree('${t.id}')">
                  ${escapeHtml(t.title.split(':')[0])}
                </button>
              `).join('')}
            </div>
          </div>

          <div style="background:var(--bg-elevated); padding:16px; border-radius:10px; border-left:4px solid #10b981; margin-bottom:18px;">
            <div style="font-size:1.08rem; font-weight:800; color:var(--text-main);">${escapeHtml(curTree.title)}</div>
            <div style="font-size:0.86rem; color:var(--text-secondary);">${escapeHtml(curTree.subtitle)}</div>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            ${curTree.steps.map((st, idx) => `
              <div style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:12px; padding:16px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                  <span class="pill-tag" style="background:rgba(56,189,248,0.2); color:#38bdf8; font-weight:800;">${escapeHtml(st.step)}</span>
                  <span style="font-weight:800; font-size:0.98rem;">${escapeHtml(st.question)}</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-top:10px;">
                  <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); border-radius:8px; padding:12px; font-size:0.86rem;">
                    <div style="font-weight:800; color:#34d399; margin-bottom:4px;">👉 RUTA PRINCIPAL / SÍ:</div>
                    <div>${escapeHtml(st.yes)}</div>
                  </div>
                  <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35); border-radius:8px; padding:12px; font-size:0.86rem;">
                    <div style="font-weight:800; color:#fbbf24; margin-bottom:4px;">⚠️ EXCEPCIÓN / REGLA CLAVE:</div>
                    <div>${escapeHtml(st.no)}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'POCKET') {
      const wrongList = (window.OECE_QUESTIONS || []).filter(q => state.answered[q.id] && !state.answered[q.id].isCorrect);

      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #38bdf8;">
          <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
            <div>
              <span class="pill-tag" style="background:rgba(56,189,248,0.2); color:#38bdf8;">📄 HOJA DE REPASO DE BOLSILLO (1 PÁGINA PDF)</span>
              <h3 style="margin-top:6px; font-size:1.15rem;">Resumen de Bolsillo + Tus Errores Personales Corregidos</h3>
            </div>
            <button class="btn btn-primary" onclick="window.print()">
              🖨️ Imprimir / Guardar en PDF (1 Hoja)
            </button>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-bottom:18px;">
            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #38bdf8; font-size:0.84rem;">
              <h4 style="color:#38bdf8; margin-bottom:8px;">💰 1. Topes en UIT y Soles (1 UIT = S/ 5,350)</h4>
              <div>• <strong>≤ 8 UIT (S/ 42,800):</strong> Contrato Menor (Directo DEC, sin garantía).</div>
              <div>• <strong>≤ 50 UIT (S/ 267,500):</strong> Apelación resuelve Titular de Entidad.</div>
              <div>• <strong>> 50 UIT (> S/ 267,500):</strong> Apelación resuelve Tribunal (TCP).</div>
              <div>• <strong>Hasta S/ 485,000:</strong> LP Abreviada / CP Abreviado (Bienes/Serv.).</div>
              <div>• <strong>Hasta S/ 5,000,000:</strong> LP Abreviada de Ejecución de Obra.</div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #34d399; font-size:0.84rem;">
              <h4 style="color:#34d399; margin-bottom:8px;">📊 2. Porcentajes Fijos del Examen</h4>
              <div>• <strong>10%:</strong> Garantía de Fiel Cumplimiento y Tope de Penalidades (mora/otras).</div>
              <div>• <strong>15%:</strong> Adicional de Obra que aprueba directo el Titular.</div>
              <div>• <strong>25%:</strong> Tope de adicionales/reducciones en Bienes, Servicios y Consultoría.</div>
              <div>• <strong>> 15% a 30%:</strong> Adicional de Obra con autorización previa de CGR.</div>
              <div>• <strong>> 50%:</strong> En obras, si supera 50% de adicionales se resuelve el contrato.</div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #fbbf24; font-size:0.84rem;">
              <h4 style="color:#fbbf24; margin-bottom:8px;">⏱️ 3. Plazos Clave y Puntajes SICAN</h4>
              <div>• <strong>2 días háb.:</strong> Subsanar requisitos de admisibilidad de apelación.</div>
              <div>• <strong>5 días háb.:</strong> Apelar LP/CP Abreviada, SIE y Comparación de Precios.</div>
              <div>• <strong>8 días háb.:</strong> Apelar LP y CP Ordinarios.</div>
              <div>• <strong>10 días háb.:</strong> Resolver ampliación de plazo (con silencio positivo).</div>
              <div>• <strong>20 días háb.:</strong> Regularizar Contratación Directa por Emergencia.</div>
              <div>• <strong>≥ 240 días cal.:</strong> Obra lleva JPRD obligatoria.</div>
              <div>• <strong>30 / 43 / 58 pts:</strong> Básico (30) · Intermedio (43) · Avanzado (58).</div>
            </div>
          </div>

          <div style="background:var(--bg-elevated); padding:16px; border-radius:10px; border:1px solid var(--border-color);">
            <h4 style="color:#f87171; margin-bottom:10px;">
              📌 Mis Errores Personales Corregidos — «Lo que debo tener en cuenta el día del examen» (${wrongList.length})
            </h4>
            ${wrongList.length === 0 ? `
              <p style="font-size:0.85rem; color:var(--text-secondary);">¡Aún no tienes preguntas falladas registradas o ya corregiste todas! A medida que practiques, cualquier error aparecerá resumido aquí con su respuesta correcta.</p>
            ` : `
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${wrongList.slice(0, 15).map(wq => {
                  const uSel = state.answered[wq.id].selected;
                  const cOpt = (wq.options || []).find(o => o.letter === wq.correct);
                  return `
                    <div style="padding:8px 12px; background:var(--bg-surface); border-left:4px solid #10b981; border-radius:6px; font-size:0.82rem;">
                      <div><strong>Pregunta #${wq.id} (${escapeHtml(wq.concept)}):</strong> ${escapeHtml(wq.question)}</div>
                      <div style="color:#34d399; margin-top:3px;">
                        ✅ <strong>Respuesta Correcta (${wq.correct}):</strong> «${escapeHtml(cOpt ? cOpt.text : '')}» — <em>${escapeHtml((cOpt && cOpt.why) || wq.examTip || '')}</em>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'DAYS') {
      const dgItem = DAYS_GAME_ITEMS[daysGameState.idx];
      const dgSel = daysGameState.selected;
      const dgOk = dgSel === dgItem.correct;
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #3b82f6;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <div>
              <span class="pill-tag" style="background:rgba(59,130,246,0.2); color:#60a5fa;">📅 ENTRENADOR VISUAL: HÁBILES VS. CALENDARIO</span>
              <h3 style="margin-top:6px;">No caigas en la trampa #1 del examen: ¿Se cuenta en Días Hábiles o Días Calendario?</h3>
            </div>
            <div style="font-weight:800; color:#fbbf24;">🔥 Racha: ${daysGameState.streak} · 🏆 Récord: ${daysGameState.best}</div>
          </div>

          <div style="background:var(--bg-elevated); border:2px solid var(--primary); border-radius:12px; padding:18px; margin-bottom:22px;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">
              RETO RÁPIDO (${daysGameState.idx + 1} de ${DAYS_GAME_ITEMS.length}) · Plazo: <strong style="color:#fbbf24;">${escapeHtml(dgItem.num)}</strong>
            </div>
            <div style="font-size:1.05rem; font-weight:800; margin-bottom:14px;">${escapeHtml(dgItem.prompt)}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <button class="btn ${dgSel ? (dgItem.correct === 'HABILES' ? 'btn-success' : (dgSel === 'HABILES' ? 'btn-danger' : 'btn-outline')) : 'btn-primary'}" style="padding:14px; font-size:0.95rem; font-weight:800;" onclick="answerDaysGame('HABILES')">
                💼 DÍAS HÁBILES (${dgItem.num})
              </button>
              <button class="btn ${dgSel ? (dgItem.correct === 'CALENDARIO' ? 'btn-success' : (dgSel === 'CALENDARIO' ? 'btn-danger' : 'btn-outline')) : 'btn-gold'}" style="padding:14px; font-size:0.95rem; font-weight:800;" onclick="answerDaysGame('CALENDARIO')">
                🗓️ DÍAS CALENDARIO (${dgItem.num})
              </button>
            </div>
            ${dgSel ? `
              <div style="margin-top:14px; padding:12px; border-radius:8px; background:${dgOk ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)'}; border-left:4px solid ${dgOk ? '#10b981' : '#ef4444'};">
                <div style="font-weight:800; color:${dgOk ? '#34d399' : '#f87171'}; margin-bottom:4px;">
                  ${dgOk ? '✅ ¡Correcto!' : `❌ Cuidado con la trampa: La respuesta correcta es DÍAS ${dgItem.correct}`}
                </div>
                <div style="font-size:0.86rem; color:var(--text-secondary);">${escapeHtml(dgItem.why)}</div>
                <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="nextDaysGame()">Siguiente Plazo →</button>
              </div>
            ` : ''}
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
            <div style="background:var(--bg-elevated); border:1px solid rgba(59,130,246,0.4); border-top:4px solid #3b82f6; border-radius:12px; padding:16px;">
              <h4 style="color:#60a5fa; margin-bottom:10px;">💼 SIEMPRE EN DÍAS HÁBILES (Sin sábados, domingos ni feriados)</h4>
              <ul style="font-size:0.85rem; line-height:1.6; padding-left:18px; color:var(--text-secondary);">
                <li><strong>2 días hábiles (+2 de prórroga):</strong> Subsanación de ofertas en PLADICOP (Art. 78.4 D.S. 009-2025-EF).</li>
                <li><strong>5 y 3 días hábiles:</strong> Consultas técnicas en difusión del requerimiento (5d) y absolución (3d).</li>
                <li><strong>5 días hábiles:</strong> Apelar Modalidades Abreviadas (LP/CP Abreviada) y 1ra reunión de JPRD.</li>
                <li><strong>7 días hábiles:</strong> Pronunciamiento de la Entidad sobre una <em>Recomendación</em> de la JPRD.</li>
                <li><strong>8 días hábiles:</strong> Apelar Licitación Pública y Concurso Público ordinarios.</li>
                <li><strong>10 días hábiles:</strong> Descargos del proveedor en el PAS ante el TCP.</li>
                <li><strong>15 días hábiles:</strong> Plazo máximo para pagar una valorización tras su conformidad.</li>
                <li><strong>20 / 40 días hábiles:</strong> Regularizar contratación de emergencia (20d ordinaria / 40d masiva).</li>
                <li><strong>30 días hábiles:</strong> Silencio en culminación de obra (se presume conformidad) y suspensión JPRD por impago.</li>
              </ul>
            </div>

            <div style="background:var(--bg-elevated); border:1px solid rgba(245,158,11,0.4); border-top:4px solid #f59e0b; border-radius:12px; padding:16px;">
              <h4 style="color:#fbbf24; margin-bottom:10px;">🗓️ SIEMPRE EN DÍAS CALENDARIO (Todos los días corridos)</h4>
              <ul style="font-size:0.85rem; line-height:1.6; padding-left:18px; color:var(--text-secondary);">
                <li><strong>7 días calendario:</strong> Plazo para que una <em>Decisión</em> de la JPRD quede firme y obligatoria si no se objeta.</li>
                <li><strong>10 días calendario:</strong> Plazo de la Entidad para iniciar la implementación de una <em>Decisión</em> firme de la JPRD.</li>
                <li><strong>Cada 30 días:</strong> Frecuencia máxima de supervisión periódica durante la ejecución contractual.</li>
                <li><strong>>= 240 días calendario:</strong> Duración mínima del contrato para obligatoriedad de la JPRD.</li>
                <li><strong>Plazos de ejecución contractual:</strong> Los plazos de ejecución de contratos y cálculo de penalidad diaria por mora se computan en días calendario.</li>
              </ul>
            </div>
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'ACTORS') {
      const agItem = ACTORS_GAME_ITEMS[actorsGameState.idx];
      const agSel = actorsGameState.selected;
      const agOk = agSel === agItem.correct;
      const actorBtns = [
        { code: 'AGA', label: '🏛️ AGA (Autoridad Gestión Administrativa)' },
        { code: 'DEC', label: '🛒 DEC (Oficiales de Compras)' },
        { code: 'USUARIA', label: '📋 Área Usuaria' },
        { code: 'ATE', label: '🔬 ATE (Área Técnica Estratégica)' },
        { code: 'TCP', label: '⚖️ TCP (Tribunal de Contrataciones)' }
      ];
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #10b981;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <div>
              <span class="pill-tag green">🏛️ SIMULADOR DE AUTORIDADES (ART. 25 Y 74 LEY N° 32069)</span>
              <h3 style="margin-top:6px;">¿Qué órgano o autoridad es competente para aprobar o resolver este acto?</h3>
            </div>
            <div style="font-weight:800; color:#34d399;">🔥 Racha: ${actorsGameState.streak} · 🏆 Récord: ${actorsGameState.best}</div>
          </div>

          <div style="background:var(--bg-elevated); border:2px solid #10b981; border-radius:12px; padding:18px; margin-bottom:22px;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">
              CASO DE COMPETENCIA (${actorsGameState.idx + 1} de ${ACTORS_GAME_ITEMS.length}):
            </div>
            <div style="font-size:1.05rem; font-weight:800; margin-bottom:14px;">«${escapeHtml(agItem.task)}»</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px;">
              ${actorBtns.map(b => `
                <button class="btn ${agSel ? (agItem.correct === b.code ? 'btn-success' : (agSel === b.code ? 'btn-danger' : 'btn-outline')) : 'btn-outline'}" style="padding:12px; font-weight:700;" onclick="answerActorsGame('${b.code}')">
                  ${b.label}
                </button>
              `).join('')}
            </div>
            ${agSel ? `
              <div style="margin-top:14px; padding:12px; border-radius:8px; background:${agOk ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)'}; border-left:4px solid ${agOk ? '#10b981' : '#ef4444'};">
                <div style="font-weight:800; color:${agOk ? '#34d399' : '#f87171'}; margin-bottom:4px;">
                  ${agOk ? '✅ ¡Exacto! Competencia correcta.' : `❌ Incorrecto: La autoridad competente es ${agItem.correct}`}
                </div>
                <div style="font-size:0.86rem; color:var(--text-secondary);">${escapeHtml(agItem.why)}</div>
                <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="nextActorsGame()">Siguiente Trámite →</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (topesActiveTab === 'EXPRESS5') {
      tabBodyHtml = `
        <div class="question-box" style="border-top:5px solid #ef4444;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <div>
              <span class="pill-tag" style="background:rgba(239,68,68,0.2); color:#f87171;">🚨 REPASO DE EMERGENCIA EN 5 MINUTOS (PUERTA DEL EXAMEN SICAN)</span>
              <h3 style="margin-top:6px;">Las 25 Reglas, Cifras y Palabras Clave que te dan el Aprobado Directo</h3>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:14px;">
            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #38bdf8; font-size:0.84rem; line-height:1.55;">
              <h4 style="color:#38bdf8; margin-bottom:8px;">💰 1. Topes en Soles y UIT (2026)</h4>
              <div>• <strong><= 8 UIT (S/ 42,800):</strong> Contrato Menor (SÍ exige RNP, SÍ registra en PLADICOP, SÍ aplica Art. 30).</div>
              <div>• <strong>Entre S/ 42,800 y S/ 485,000:</strong> LP Abreviada (Bienes) / CP Abreviado (Servicios).</div>
              <div>• <strong>> S/ 485,000:</strong> Licitación Pública (Bienes/Obras) / Concurso Público (Servicios/Consultoría).</div>
              <div>• <strong><= 50 UIT vs. > 50 UIT (Art. 74):</strong> Apelación <= 50 UIT resuelve la Entidad (AGA); > 50 UIT resuelve el TCP.</div>
              <div>• <strong>Retención 10% Fiel Cumplimiento (Art. 114):</strong> Bienes/Servicios <= S/ 480,000 | Obras <= S/ 5,000,000 | <strong>MYPE: sin límite de monto</strong>.</div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #34d399; font-size:0.84rem; line-height:1.55;">
              <h4 style="color:#34d399; margin-bottom:8px;">📊 2. Porcentajes y Segmentación</h4>
              <div>• <strong>0.5% MYPE vs. 3% General (Art. 73.2):</strong> Garantía por apelación = 3% (tope 300 UIT) general; <strong>0.5% (tope 25 UIT) para MYPE</strong>.</div>
              <div>• <strong>10%:</strong> Garantía de Fiel Cumplimiento, Tope de Penalidad por Mora y umbral de instalación para Pago Mixto (>10%).</div>
              <div>• <strong>> 30% en Persona Jurídica (Art. 30):</strong> Impedimento societario para autoridad o pariente hasta 2° grado.</div>
              <div>• <strong>> 40% y > 50% en Obras:</strong> Adicional > 40% exige autorización expresa; modificación > 50% está <strong>PROHIBIDA</strong>.</div>
              <div>• <strong>Segmentación (Art. 125):</strong> Rutinarias/Operacionales (bajo riesgo = reducir costos y oportunidad) | Críticas/Estratégicas (alto riesgo = disminuir riesgos; desierto o <=3 postores bienes / <=2 servicios en últimos 2 años).</div>
            </div>

            <div style="background:var(--bg-elevated); padding:14px; border-radius:10px; border-left:4px solid #fbbf24; font-size:0.84rem; line-height:1.55;">
              <h4 style="color:#fbbf24; margin-bottom:8px;">⏱️ 3. Plazos Fijos Anti-Trampas</h4>
              <div>• <strong>2 + 2 días hábiles (Art. 78.4):</strong> Subsanar ofertas en PLADICOP (2d hábiles + 2d de prórroga; silencio aprueba prórroga).</div>
              <div>• <strong>5 y 3 días hábiles:</strong> Consultas en difusión del requerimiento (5d) y absolución (3d).</div>
              <div>• <strong>8 y 5 días hábiles:</strong> Apelar LP/CP (8d) vs. Modalidad Abreviada (5d).</div>
              <div>• <strong>15 y 30 días hábiles:</strong> Pago de valorización (15d háb.) y silencio en recepción de obra (30d háb. = conformidad).</div>
              <div>• <strong>JPRD (Directiva 002-2025):</strong> >= 240d cal. obligatoria | Recomendación = <strong>7d hábiles</strong> | Decisión = <strong>7d calendario</strong> firme y <strong>10d calendario</strong> implementar.</div>
              <div>• <strong>Emergencia y PAS:</strong> Regularizar emergencia = <strong>20d hábiles</strong> (<strong>40d hábiles</strong> masiva) | PAS: <strong>10d hábiles</strong> descargos y <strong>4 meses</strong> fase instructiva.</div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">🎯 Simulador Didáctico de Topes, Plazos y Casuísticas OECE</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Aprende visualmente los topes de la Ley N° 32069 con el Termómetro en Vivo, entrena reflejos con el Reto Relámpago, repasa las 4 Escaleras de Memoria o resuelve casos de 3 pasos.</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary" style="background:#ef4444" onclick="setTopesTab('EXPRESS5')">
            🚨 Repaso 5 Min Pre-Examen
          </button>
          <button class="btn btn-outline" onclick="setTopesTab('POCKET')">
            🖨️ Mi Resumen de Bolsillo (1 Hoja PDF)
          </button>
          <button class="btn btn-primary" style="background:#10b981" onclick="practiceTopesBank()">
            🧠 Practicar las ${topesPoolCount} Preguntas de Topes →
          </button>
          <button class="btn btn-gold" onclick="switchView('simulator'); startExam(25, 40, 'TOPES_CASUISTICA', 'Simulacro Especial de Topes y Casuísticas')">
            ⏱️ Simulacro de Topes (25 preg.)
          </button>
        </div>
      </div>

      <div class="topes-subtabs">
        <button class="topes-tab-btn ${topesActiveTab === 'SLIDER' ? 'active' : ''}" onclick="setTopesTab('SLIDER')">
          🎚️ 1. Regla Visual y Termómetro
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'GAME' ? 'active' : ''}" onclick="setTopesTab('GAME')">
          🎮 2. Juego Relámpago
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'LADDERS' ? 'active' : ''}" onclick="setTopesTab('LADDERS')">
          🗺️ 3. Las 4 Escaleras Visuales
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'LAB' ? 'active' : ''}" onclick="setTopesTab('LAB')">
          🧪 4. Laboratorio (3 Pasos)
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'TRAPS' ? 'active' : ''}" onclick="setTopesTab('TRAPS')">
          🕵️ 5. Caza-Trampas
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'TREES' ? 'active' : ''}" onclick="setTopesTab('TREES')">
          🌳 6. Árboles de Decisión
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'POCKET' ? 'active' : ''}" onclick="setTopesTab('POCKET')">
          📄 7. Resumen PDF de Bolsillo
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'DAYS' ? 'active' : ''}" onclick="setTopesTab('DAYS')">
          📅 8. ¿Hábiles o Calendario?
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'ACTORS' ? 'active' : ''}" onclick="setTopesTab('ACTORS')">
          🏛️ 9. ¿Quién Aprueba Qué?
        </button>
        <button class="topes-tab-btn ${topesActiveTab === 'EXPRESS5' ? 'active' : ''}" onclick="setTopesTab('EXPRESS5')">
          🚨 10. Repaso 5 Minutos
        </button>
      </div>

      ${tabBodyHtml}
    `;
  }

  window.practiceTopesBank = function () {
    state.trainerFilter.module = 'TOPES_CASUISTICA';
    state.trainerFilter.status = 'ALL';
    state.trainerFilter.search = '';
    state.trainerFilter.currentIndex = 0;
    saveState();
    switchView('trainer');
  };

  window.startDailyChallenge = function () {
    switchView('simulator');
    startExam(10, 15, 'WEB_FIJAS', '⚡ Reto Diario: 10 Fijas de Examen y Casuística');
  };

  // 8. CALCULADORA LEY 32069, EVALUADOR SICAN, COMPARADOR ANTI-TRAMPAS Y ARTÍCULOS CLAVE
  function renderTools() {
    const container = document.getElementById('toolsContent');
    if (!container) return;

    const comparativo = window.OECE_COMPARATIVO || [];
    const articles = window.OECE_ARTICLES || [];

    container.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">🧮 Calculadora Interactiva Ley N° 32069, Evaluador SICAN y Cuadro Anti-Trampas</h2>
          <p style="font-size:0.88rem; color:var(--text-secondary)">Calcula en tiempo real qué procedimiento, plazos de apelación, garantías y límites de adicionales corresponden según el monto, y revisa las diferencias entre la Ley 30225 y la Ley 32069.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:20px; margin-bottom:28px;">
        <!-- CALCULADORA DE PROCEDIMIENTOS, PLAZOS Y GARANTÍAS -->
        <div class="question-box" style="margin-bottom:0;">
          <h3 style="margin-bottom:12px; color:var(--primary);">🧮 1. Calculadora de Procedimientos, Topes y Garantías</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.82rem; font-weight:700;">Objeto de la Contratación:</label>
              <select id="calcObjeto" class="control-select" style="width:100%; margin-top:4px;" onchange="runLiveCalculator()">
                <option value="BIENES">Bienes (Adquisición / Suministro)</option>
                <option value="SERVICIOS">Servicios en General</option>
                <option value="CONSULTORIA">Consultoría de Obra (Expediente / Supervisión)</option>
                <option value="OBRA">Ejecución de Obra Pública</option>
              </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.82rem; font-weight:700;">Cuantía / Monto (S/):</label>
                <input type="number" id="calcMonto" class="control-input" style="width:100%; margin-top:4px;" value="350000" min="1000" step="5000" oninput="runLiveCalculator()" />
              </div>
              <div>
                <label style="font-size:0.82rem; font-weight:700;">Duración del Contrato (días):</label>
                <input type="number" id="calcDias" class="control-input" style="width:100%; margin-top:4px;" value="260" min="1" step="10" oninput="runLiveCalculator()" />
              </div>
            </div>
            <div id="calcOutputBox" style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:10px; padding:16px; font-size:0.88rem;"></div>
          </div>
        </div>

        <!-- EVALUADOR DE PUNTAJE Y NIVEL SICAN - OECE -->
        <div class="question-box" style="margin-bottom:0;">
          <h3 style="margin-bottom:12px; color:var(--accent);">🏆 2. Evaluador Oficial de Nivel SICAN-OECE (Sobre 72 Preguntas)</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.82rem; font-weight:700;">Puntaje obtenido o proyectado en el Examen SICAN (0 a 72 puntos):</label>
              <input type="number" id="sicanPts" class="control-input" style="width:100%; margin-top:4px;" value="50" min="0" max="72" oninput="runSicanEvaluator()" />
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:0.82rem; font-weight:700;">Experiencia General (años):</label>
                <input type="number" id="sicanExpGen" class="control-input" style="width:100%; margin-top:4px;" value="6" min="0" max="40" oninput="runSicanEvaluator()" />
              </div>
              <div>
                <label style="font-size:0.82rem; font-weight:700;">Exp. en Contrataciones (años):</label>
                <input type="number" id="sicanExpEsp" class="control-input" style="width:100%; margin-top:4px;" value="3" min="0" max="40" oninput="runSicanEvaluator()" />
              </div>
            </div>
            <div id="sicanOutputBox" style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:10px; padding:16px; font-size:0.88rem;"></div>
          </div>
        </div>

        <!-- CALCULADORA DE PENALIDAD DIARIA POR MORA (FACTOR F Y TOPE 10%) -->
        <div class="question-box" style="margin-bottom:0; border-top:4px solid #ef4444;">
          <h3 style="margin-bottom:12px; color:#f87171;">⏱️ 3. Calculadora de Penalidad Diaria por Mora (Factor F y Tope 10%)</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:0.82rem; font-weight:700;">Objeto del Contrato:</label>
              <select id="moraObjeto" class="control-select" style="width:100%; margin-top:4px;" onchange="runMoraCalculator()">
                <option value="BS">Bienes, Servicios o Consultoría de Obra</option>
                <option value="OBRA">Ejecución de Obra Pública</option>
              </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
              <div>
                <label style="font-size:0.78rem; font-weight:700;">Monto Vigente (S/):</label>
                <input type="number" id="moraMonto" class="control-input" style="width:100%; margin-top:4px;" value="200000" min="1000" step="5000" oninput="runMoraCalculator()" />
              </div>
              <div>
                <label style="font-size:0.78rem; font-weight:700;">Plazo Contrato (días):</label>
                <input type="number" id="moraPlazo" class="control-input" style="width:100%; margin-top:4px;" value="50" min="1" step="5" oninput="runMoraCalculator()" />
              </div>
              <div>
                <label style="font-size:0.78rem; font-weight:700;">Días de Atraso:</label>
                <input type="number" id="moraAtraso" class="control-input" style="width:100%; margin-top:4px;" value="8" min="1" step="1" oninput="runMoraCalculator()" />
              </div>
            </div>
            <div id="moraOutputBox" style="background:var(--bg-elevated); border:1px solid var(--border-color); border-radius:10px; padding:16px; font-size:0.88rem;"></div>
          </div>
        </div>
      </div>

      <!-- CUADRO COMPARATIVO LEY 30225 VS LEY 32069 -->
      <div class="section-header">
        <div>
          <h3 class="section-title">⚖️ 3. Cuadro Comparativo Anti-Trampas: Ley N° 30225 (Antigua) vs. Nueva Ley N° 32069 (OECE)</h3>
          <p style="font-size:0.86rem; color:var(--text-secondary)">El examen del OECE coloca alternativas con términos derogados para confundirte. Domina aquí el cambio exacto.</p>
        </div>
      </div>

      <div style="overflow-x:auto; margin-bottom:32px;">
        <table class="cheatsheet-table">
          <thead>
            <tr>
              <th>Institución / Concepto</th>
              <th>Ley Antigua (Ley 30225)</th>
              <th>Nueva Ley N° 32069 y D.S. 009-2025-EF</th>
              <th>⚠️ Trampa de Examen a Evitar</th>
            </tr>
          </thead>
          <tbody>
            ${comparativo.map(c => `
              <tr>
                <td><strong>${escapeHtml(c.topic)}</strong></td>
                <td style="color:var(--text-muted); text-decoration:line-through;">${escapeHtml(c.oldLaw)}</td>
                <td style="color:var(--success); font-weight:700;">${escapeHtml(c.newLaw)}</td>
                <td style="font-size:0.84rem;">${escapeHtml(c.trap)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- VISOR DE ARTÍCULOS CLAVE -->
      <div class="section-header">
        <div>
          <h3 class="section-title">📖 4. Artículos y Directivas más Preguntados en el Examen OECE</h3>
        </div>
      </div>
      <div class="modules-grid">
        ${articles.map(a => `
          <div class="module-card">
            <div>
              <span class="pill-tag gold">${escapeHtml(a.art)}</span>
              <h3 style="margin:8px 0;">${escapeHtml(a.title)}</h3>
              <p class="module-desc">${escapeHtml(a.body)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    runLiveCalculator();
    runSicanEvaluator();
    runMoraCalculator();
  }

  window.runMoraCalculator = function () {
    const objEl = document.getElementById('moraObjeto');
    const montoEl = document.getElementById('moraMonto');
    const plazoEl = document.getElementById('moraPlazo');
    const atrasoEl = document.getElementById('moraAtraso');
    const outEl = document.getElementById('moraOutputBox');
    if (!objEl || !montoEl || !plazoEl || !atrasoEl || !outEl) return;

    const obj = objEl.value;
    const monto = parseFloat(montoEl.value) || 0;
    const plazo = Math.max(1, parseInt(plazoEl.value, 10) || 1);
    const atraso = Math.max(0, parseInt(atrasoEl.value, 10) || 0);

    let factorF = 0.40;
    let reglaF = 'Plazo ≤ 60 días (para cualquier objeto) → F = 0.40';
    if (plazo > 60) {
      if (obj === 'OBRA') {
        factorF = 0.15;
        reglaF = 'Plazo > 60 días en Ejecución de Obras → F = 0.15';
      } else {
        factorF = 0.25;
        reglaF = 'Plazo > 60 días en Bienes, Servicios o Consultoría → F = 0.25';
      }
    }

    const penalidadDiaria = (0.10 * monto) / (factorF * plazo);
    const penalidadAcumulada = penalidadDiaria * atraso;
    const topeDiezPct = monto * 0.10;
    const superaTope = penalidadAcumulada >= topeDiezPct;
    const penalidadAplicable = Math.min(penalidadAcumulada, topeDiezPct);

    outEl.innerHTML = `
      <div style="margin-bottom:6px;">📐 <strong>Fórmula Oficial:</strong> <code>(0.10 × Monto) / (F × Plazo)</code></div>
      <div style="margin-bottom:6px;">🔢 <strong>Factor F aplicable:</strong> <span style="color:#38bdf8; font-weight:800;">${factorF.toFixed(2)}</span> <span style="font-size:0.78rem; color:var(--text-secondary);">(${reglaF})</span></div>
      <div style="margin-bottom:6px;">📅 <strong>Penalidad Diaria por Mora:</strong> <strong>S/ ${penalidadDiaria.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> por día</div>
      <div style="margin-bottom:6px;">💰 <strong>Mora calculada (${atraso} días):</strong> S/ ${penalidadAcumulada.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div style="margin-bottom:8px;">🛡️ <strong>Tope Máximo Legal (10% del contrato):</strong> <strong style="color:#fbbf24;">S/ ${topeDiezPct.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> (Monto a cobrar: <strong>S/ ${penalidadAplicable.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>)</div>
      <div style="padding:8px 10px; border-radius:6px; background:${superaTope ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.15)'}; color:${superaTope ? '#f87171' : '#34d399'}; font-weight:700; font-size:0.82rem;">
        ${superaTope
          ? '🚨 ¡ALCANZÓ O SUPERÓ EL TOPE DEL 10%! La Entidad puede RESOLVER EL CONTRATO directamente sin necesidad de requerimiento previo (apercibimiento).'
          : '✅ Aún no supera el tope del 10% de mora máxima. Se descuenta de los pagos a cuenta o de la liquidación final.'}
      </div>
    `;
  };

  window.runLiveCalculator = function () {
    const objEl = document.getElementById('calcObjeto');
    const montoEl = document.getElementById('calcMonto');
    const diasEl = document.getElementById('calcDias');
    const outEl = document.getElementById('calcOutputBox');
    if (!objEl || !montoEl || !diasEl || !outEl) return;

    const obj = objEl.value;
    const monto = parseFloat(montoEl.value) || 0;
    const dias = parseInt(diasEl.value, 10) || 0;

    let proc = '';
    let plazoApel = '';
    let garantia = Math.round(monto * 0.10);
    let tope40 = Math.round(monto * 0.40);
    let tope50 = Math.round(monto * 0.50);

    if (monto <= 42800) {
      proc = 'Contrato Menor (≤ 8 UIT) · Registro obligatorio en PLADICOP y RNP vigente';
      plazoApel = 'No aplica apelación de procedimiento competitivo (es Contrato Menor)';
    } else if (monto <= 485000) {
      if (obj === 'BIENES' || obj === 'OBRA') {
        proc = 'Licitación Pública Abreviada (Monto entre S/ 42,800 y S/ 485,000)';
      } else {
        proc = 'Concurso Público Abreviado / Comparación de Precios (si es servicio estándar de disponibilidad inmediata)';
      }
      plazoApel = '5 días hábiles desde la notificación en PLADICOP';
    } else {
      if (obj === 'BIENES' || obj === 'OBRA') {
        proc = 'Licitación Pública Ordinaria (> S/ 485,000)';
      } else {
        proc = 'Concurso Público Ordinario (> S/ 485,000)';
      }
      plazoApel = '8 días hábiles desde la notificación en PLADICOP';
    }

    const resuelveApel = monto <= 260000
      ? 'La propia Entidad Contratante (Autoridad de la Gestión Administrativa - AGA / DEC, nunca el Comité)'
      : 'El Tribunal de Contrataciones Públicas (TCP) si supera el tope de ley (50 UIT)';

    const jprdStatus = dias >= 240
      ? `✅ Duración ≥ 240 días calendario (${dias} días): Cumple el límite mínimo de duración para JPRD obligatoria en obras (según cuantía).`
      : `ℹ️ Duración < 240 días calendario (${dias} días): No alcanza el mínimo de 240 días para obligatoriedad de JPRD.`;

    outEl.innerHTML = `
      <div style="margin-bottom:8px;">📌 <strong>Procedimiento que corresponde:</strong> <span style="color:var(--primary); font-weight:800;">${proc}</span></div>
      <div style="margin-bottom:8px;">⏱️ <strong>Plazo máximo para Apelar:</strong> <strong>${plazoApel}</strong></div>
      <div style="margin-bottom:8px;">🏛️ <strong>Órgano que resuelve Apelación:</strong> ${resuelveApel}</div>
      <div style="margin-bottom:8px;">🛡️ <strong>Garantía de Fiel Cumplimiento (10%):</strong> <span style="color:var(--success); font-weight:800;">S/ ${garantia.toLocaleString('es-PE')}</span></div>
      <div style="margin-bottom:8px;">🏗️ <strong>Tope Adicional Obra con autorización (40%) / Máx. absoluto (50%):</strong> S/ ${tope40.toLocaleString('es-PE')} (40%) | S/ ${tope50.toLocaleString('es-PE')} (50%)</div>
      <div>⚖️ <strong>Regla JPRD por duración:</strong> ${jprdStatus}</div>
    `;
  };

  window.runSicanEvaluator = function () {
    const ptsEl = document.getElementById('sicanPts');
    const genEl = document.getElementById('sicanExpGen');
    const espEl = document.getElementById('sicanExpEsp');
    const outEl = document.getElementById('sicanOutputBox');
    if (!ptsEl || !genEl || !espEl || !outEl) return;

    const pts = parseInt(ptsEl.value, 10) || 0;
    const gen = parseFloat(genEl.value) || 0;
    const esp = parseFloat(espEl.value) || 0;
    const pct = Math.round((pts / 72) * 100);

    let examLevel = 'No alcanza puntaje mínimo (< 30 pts)';
    if (pts >= 58) examLevel = 'Puntaje de Examen para NIVEL AVANZADO (≥ 58 pts)';
    else if (pts >= 43) examLevel = 'Puntaje de Examen para NIVEL INTERMEDIO (≥ 43 pts)';
    else if (pts >= 30) examLevel = 'Puntaje de Examen para NIVEL BÁSICO (≥ 30 pts)';

    let finalCert = 'Aún no certifica';
    let roleAllowed = 'Requiere al menos 30 puntos, 3 años de exp. general y 1 año de exp. específica.';

    if (pts >= 58 && gen >= 7 && esp >= 4) {
      finalCert = '🏅 CERTIFICA EN NIVEL AVANZADO (Vigencia: 2 años)';
      roleAllowed = 'Habilitado para ser Responsable Titular / Jefe de la DEC, Oficial de Compras e integrar Comités de Selección.';
    } else if (pts >= 43 && gen >= 5 && esp >= 2) {
      finalCert = '🥈 CERTIFICA EN NIVEL INTERMEDIO (Vigencia: 2 años)';
      roleAllowed = 'Habilitado para ser designado Oficial de Compras e integrar Comités de Selección.';
    } else if (pts >= 30 && gen >= 3 && esp >= 1) {
      finalCert = '🥉 CERTIFICA EN NIVEL BÁSICO (Vigencia: 2 años)';
      roleAllowed = 'Habilitado como operador en la DEC (para ser Oficial de Compras necesitas subir a Nivel Intermedio: ≥43 pts, 5a gen, 2a esp).';
    }

    outEl.innerHTML = `
      <div style="margin-bottom:8px;">📊 <strong>Resultado en Examen SICAN:</strong> <strong>${pts}/72 puntos (${pct}%)</strong> → ${examLevel}</div>
      <div style="margin-bottom:8px; color:var(--accent); font-weight:800; font-size:0.95rem;">${finalCert}</div>
      <div style="margin-bottom:8px;">💼 <strong>Cargos que puedes ejercer:</strong> ${roleAllowed}</div>
      <div style="font-size:0.78rem; color:var(--text-muted);">Nota oficial OECE: El examen tiene 72 preguntas (25 Act. Preparatorias + 22 Selección + 25 Ejecución Contractual) en 120 minutos.</div>
    `;
  };

  // AUDIO (TEXT-TO-SPEECH), PODCAST MODE & PERSONAL NOTES
  window._podcastActive = false;

  window.speakCurrentQuestion = function (qid, onEndCallback) {
    if (!('speechSynthesis' in window)) {
      alert('Tu navegador no soporta lectura por voz.');
      return;
    }
    window.speechSynthesis.cancel();
    const q = (window.OECE_QUESTIONS || []).find(x => x.id === qid);
    if (!q) return;

    const correctOpt = q.options.find(o => o.letter === q.correct);
    const ansText = `La respuesta correcta es la opción ${q.correct}: ${correctOpt ? correctOpt.text : ''}. Regla de oro: ${q.examTip}`;
    const utter = new SpeechSynthesisUtterance(`Pregunta ${q.id}. ${q.question}. ${ansText}`);
    utter.lang = 'es-PE';
    utter.rate = 1.03;
    if (typeof onEndCallback === 'function') {
      utter.onend = onEndCallback;
    }
    window.speechSynthesis.speak(utter);
  };

  window.togglePodcastMode = function () {
    if (!('speechSynthesis' in window)) {
      alert('Tu navegador no soporta lectura por voz.');
      return;
    }
    window._podcastActive = !window._podcastActive;
    if (!window._podcastActive) {
      window.speechSynthesis.cancel();
      renderTrainer();
      return;
    }
    runPodcastStep();
  };

  function runPodcastStep() {
    if (!window._podcastActive) return;
    const filtered = getFilteredTrainerQuestions();
    const q = filtered[state.trainerFilter.currentIndex];
    if (!q) {
      window._podcastActive = false;
      renderTrainer();
      return;
    }
    renderTrainer();
    window.speakCurrentQuestion(q.id, function () {
      if (!window._podcastActive) return;
      setTimeout(function () {
        if (!window._podcastActive) return;
        if (state.trainerFilter.currentIndex < filtered.length - 1) {
          state.trainerFilter.currentIndex++;
          saveState();
          runPodcastStep();
        } else {
          window._podcastActive = false;
          renderTrainer();
        }
      }, 1500);
    });
  }

  window.stopSpeech = function () {
    window._podcastActive = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id === 'view-trainer') renderTrainer();
  };

  window.saveQuestionNote = function (qid, text) {
    state.notes = state.notes || {};
    if (text && text.trim()) {
      state.notes[qid] = text;
    } else {
      delete state.notes[qid];
    }
    saveState();
  };

  // PWA INSTALL HANDLER
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = 'inline-flex';
  });

  window.installPWAApp = function () {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(function () {
        deferredInstallPrompt = null;
        const btn = document.getElementById('pwaInstallBtn');
        if (btn) btn.style.display = 'none';
      });
    } else {
      alert('📱 Para instalar en tu Celular:\n• En Android (Chrome): Toca el menú ⋮ (arriba a la derecha) → «Añadir a pantalla de inicio» o «Instalar aplicación».\n• En iPhone (Safari): Toca el botón Compartir → «Agregar a inicio».');
    }
  };

  // INIT
  document.addEventListener('DOMContentLoaded', function () {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
    if (window.OECE_TOPES_QUESTIONS && window.OECE_QUESTIONS) {
      const existingIds = new Set(window.OECE_QUESTIONS.map(q => q.id));
      window.OECE_TOPES_QUESTIONS.forEach(tq => {
        if (!existingIds.has(tq.id)) {
          window.OECE_QUESTIONS.push(tq);
        }
      });
    }
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeButtonLabel();
    saveState();
    const nameInput = document.getElementById('userNameInput');
    if (nameInput) nameInput.value = state.userName;
    const levelSelect = document.getElementById('targetLevelSelect');
    if (levelSelect) levelSelect.value = state.targetLevel;

    updateSidebarMetrics();
    renderDashboard();
  });
})();
