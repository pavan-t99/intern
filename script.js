/*import dotenv()*/
document.addEventListener('DOMContentLoaded', () => {
  // ====================== DOM ELEMENTS ======================
  const editor               = document.getElementById('latex-editor');
  const lineNumbers          = document.getElementById('line-numbers');
  const compileBtn           = document.getElementById('compile-btn');
  const downloadBtn          = document.getElementById('download-btn');
  const errorPanel           = document.getElementById('error-panel');
  const loading              = document.getElementById('loading');
  const pdfPreview           = document.getElementById('pdf-preview');
  const previewTabsContainer = document.getElementById('preview-tabs');
  const themeToggle          = document.getElementById('theme-toggle');
  const htmlRoot             = document.documentElement;
  const navItems             = document.querySelectorAll('.nav-item');
  const pages                = document.querySelectorAll('.page');
  const templateBar          = document.getElementById('template-bar');
  const templateBtns         = document.querySelectorAll('.template-btn');
  const loadingSpan          = loading ? loading.querySelector('span') : null;

  let currentPreviewUrl = null;

  // ====================== THEME ======================
  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlRoot.setAttribute('data-theme', savedTheme);
    if (themeToggle) themeToggle.checked = savedTheme === 'light';
  }

  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      const newTheme = themeToggle.checked ? 'light' : 'dark';
      htmlRoot.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  initTheme();

  // ====================== NAVIGATION ======================
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const pageId = item.dataset.page;
      pages.forEach(page => page.classList.toggle('active', page.id === pageId));

      if (templateBar) {
        templateBar.style.display = pageId === 'home' ? 'flex' : 'none';
      }
    });
  });

  // ====================== LINE NUMBERS ======================
  function updateLineNumbers() {
    if (!editor || !lineNumbers) return;
    const lines = editor.value.split('\n');
    let numbers = '';
    for (let i = 1; i <= lines.length; i++) numbers += i + '\n';
    lineNumbers.textContent = numbers.trimEnd();
    lineNumbers.style.height = editor.scrollHeight + 'px';
  }

  if (editor) {
    editor.addEventListener('input', updateLineNumbers);
    editor.addEventListener('scroll', () => {
      if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
    });
    editor.addEventListener('paste',   () => setTimeout(updateLineNumbers, 10));
    editor.addEventListener('cut',     () => setTimeout(updateLineNumbers, 10));
    editor.addEventListener('keydown', (e) => {
      if (['Enter', 'Backspace', 'Delete'].includes(e.key)) setTimeout(updateLineNumbers, 10);
    });

    updateLineNumbers();
    window.addEventListener('resize', updateLineNumbers);
  }

  // ====================== TEMPLATES — loaded from XML via server ======================
  /**
   * Fetches GET /templates  →  { templates: [ { id, label, description, content } ] }
   * Server reads templates.xml, parses it with xml2js, returns JSON.
   * Each template button's data-template must match the XML template id attribute.
   */
  let templatesCache = {};   // { id: content }

  async function loadTemplates() {
    try {
      const res = await fetch('/templates');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();

      if (!data.templates || !Array.isArray(data.templates)) {
        throw new Error('Unexpected response shape from /templates');
      }

      // Build a lookup map  id → content
      data.templates.forEach(t => {
        templatesCache[t.id] = t.content;
      });

      // Attach click listeners to every template button
      templateBtns.forEach(btn => {
        const key = btn.dataset.template;
        btn.addEventListener('click', () => {
          if (templatesCache[key] && editor) {
            editor.value = templatesCache[key];
            updateLineNumbers();
          } else {
            console.warn(`Template "${key}" not found in XML`);
          }
        });
      });

      // Load the "basic" template by default into the editor
      if (editor && templatesCache['basic']) {
        editor.value = templatesCache['basic'];
        updateLineNumbers();
      }

      console.log(`Loaded ${data.templates.length} templates from XML`);

    } catch (err) {
      console.error('Failed to load templates from server:', err.message);
      // Fallback: editor stays empty and buttons do nothing
      if (errorPanel) {
        errorPanel.textContent = `Warning: Could not load templates — ${err.message}`;
        errorPanel.style.display = 'block';
        setTimeout(() => { errorPanel.style.display = 'none'; }, 5000);
      }
    }
  }

  loadTemplates();

  // ====================== PREVIEW TABS ======================
  function addPreviewTab(url, label) {
    if (!previewTabsContainer || !pdfPreview) return;
    previewTabsContainer.innerHTML = '';

    const tab = document.createElement('div');
    tab.className = 'preview-tab active';
    tab.textContent = label;
    previewTabsContainer.appendChild(tab);

    pdfPreview.src = url + '#view=FitH,top';
    currentPreviewUrl = url;
  }

  // ====================== COMPILE ======================
  if (compileBtn) {
    compileBtn.addEventListener('click', async () => {
      if (!errorPanel || !loading || !editor) return;

      errorPanel.style.display = 'none';
      loading.style.display = 'flex';
      if (downloadBtn) downloadBtn.disabled = true;

      const latex = editor.value.trim();
      if (!latex) {
        errorPanel.textContent = 'Please enter some LaTeX code first.';
        errorPanel.style.display = 'block';
        loading.style.display = 'none';
        return;
      }

      try {
        const response = await fetch('/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latex })
        });

        if (!response.ok) {
          const text = await response.text();
          let errMsg = `Server error (${response.status})`;
          try { const json = JSON.parse(text); errMsg = json.error || errMsg; } catch {}
          errorPanel.textContent = errMsg;
          errorPanel.style.display = 'block';
          return;
        }

        const blob = await response.blob();
        if (blob.size < 200) {
          errorPanel.textContent = 'Generated PDF is empty or invalid.';
          errorPanel.style.display = 'block';
          return;
        }

        const url     = URL.createObjectURL(blob);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        addPreviewTab(url, `preview-${timeStr}.pdf`);

        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.onclick = () => {
            if (!currentPreviewUrl) return;
            const a = document.createElement('a');
            a.href     = currentPreviewUrl;
            a.download = `document-${timeStr.replace(/:/g, '-')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          };
        }

      } catch (err) {
        errorPanel.textContent = `Network or server error: ${err.message}`;
        errorPanel.style.display = 'block';
      } finally {
        loading.style.display = 'none';
      }
    });
  }

  // Ctrl + Enter shortcut
  if (editor) {
    editor.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); compileBtn?.click(); }
    });
  }

  // ====================== AI RESUME BUILDER ======================
  const numProjects      = document.getElementById('num-projects');
  const numEducation     = document.getElementById('num-education');
  const numInternships   = document.getElementById('num-internships');
  const numCertificates  = document.getElementById('num-certificates');

  const projectsContainer    = document.getElementById('projects-container');
  const educationContainer   = document.getElementById('education-container');
  const internshipsContainer = document.getElementById('internships-container');
  const certificatesContainer = document.getElementById('certificates-container');

  const aiResumeForm = document.getElementById('ai-resume-form');
  const aiResult     = document.getElementById('ai-result');
  const generatedEl  = document.getElementById('generated-latex');
  const copyBtn      = document.getElementById('copy-to-editor-btn');

  function renderDynamicBoxes() {
    const configs = [
      { container: projectsContainer, count: parseInt(numProjects?.value) || 0, title: 'Project',
        fields: [
          { id: 'proj-title', label: 'Project Title',        placeholder: 'e.g. Image to ASCII Converter' },
          { id: 'proj-tech',  label: 'Technologies Used',    placeholder: 'e.g. Python, Pillow' },
          { id: 'proj-desc',  label: 'Description',          placeholder: 'Brief description', type: 'textarea' }
        ]},
      { container: educationContainer, count: parseInt(numEducation?.value) || 0, title: 'Education',
        fields: [
          { id: 'edu-degree', label: 'Degree / Course',  placeholder: 'e.g. B.Sc Computer Science' },
          { id: 'edu-inst',   label: 'Institution',      placeholder: 'e.g. Your University' },
          { id: 'edu-year',   label: 'Year',             placeholder: 'e.g. 2023 -- 2026' },
          { id: 'edu-grade',  label: 'Grade / CGPA',     placeholder: 'e.g. 7.8 / 10' }
        ]},
      { container: internshipsContainer, count: parseInt(numInternships?.value) || 0, title: 'Internship / Experience',
        fields: [
          { id: 'int-role',    label: 'Role',     placeholder: 'e.g. Web Development Intern' },
          { id: 'int-company', label: 'Company',  placeholder: 'e.g. Company Name' },
          { id: 'int-period',  label: 'Period',   placeholder: 'e.g. Jun 2024 -- Aug 2024' },
          { id: 'int-desc',    label: 'Work Done',placeholder: 'Describe your work', type: 'textarea' }
        ]},
      { container: certificatesContainer, count: parseInt(numCertificates?.value) || 0, title: 'Certificate',
        fields: [
          { id: 'cert-name',   label: 'Certificate Name', placeholder: 'e.g. Full Stack Web Development' },
          { id: 'cert-issuer', label: 'Issued By',         placeholder: 'e.g. Udemy' },
          { id: 'cert-year',   label: 'Year',              placeholder: 'e.g. 2025' }
        ]}
    ];

    configs.forEach(({ container, count, title, fields }) => {
      if (!container) return;
      container.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const box = document.createElement('div');
        box.style.cssText = `border:1px solid var(--border);border-radius:12px;padding:1.4rem 1.6rem;margin-bottom:1.2rem;background:rgba(255,255,255,0.03);`;
        box.innerHTML = `<h4 style="margin-bottom:1rem;color:var(--accent);font-size:1rem;">${title} ${i + 1}</h4>`;

        fields.forEach(f => {
          const inputId = `${f.id}-${i}`;
          const fieldEl = document.createElement('div');
          fieldEl.className = 'form-group';
          fieldEl.innerHTML = `
            <label for="${inputId}">${f.label}</label>
            ${f.type === 'textarea'
              ? `<textarea id="${inputId}" placeholder="${f.placeholder}" rows="3"></textarea>`
              : `<input type="text" id="${inputId}" placeholder="${f.placeholder}">`}
          `;
          box.appendChild(fieldEl);
        });
        container.appendChild(box);
      }
    });
  }

  [numProjects, numEducation, numInternships, numCertificates].forEach(input => {
    if (input) input.addEventListener('input', renderDynamicBoxes);
  });

  renderDynamicBoxes();

  function collectFormData() {
    const n = s => (s ? s.trim() : '');
    const projects = [], education = [], internships = [], certificates = [];

    for (let i = 0; i < (parseInt(numProjects?.value) || 0); i++)
      projects.push({ title: n(document.getElementById(`proj-title-${i}`)?.value), tech: n(document.getElementById(`proj-tech-${i}`)?.value), desc: n(document.getElementById(`proj-desc-${i}`)?.value) });

    for (let i = 0; i < (parseInt(numEducation?.value) || 0); i++)
      education.push({ degree: n(document.getElementById(`edu-degree-${i}`)?.value), inst: n(document.getElementById(`edu-inst-${i}`)?.value), year: n(document.getElementById(`edu-year-${i}`)?.value), grade: n(document.getElementById(`edu-grade-${i}`)?.value) });

    for (let i = 0; i < (parseInt(numInternships?.value) || 0); i++)
      internships.push({ role: n(document.getElementById(`int-role-${i}`)?.value), company: n(document.getElementById(`int-company-${i}`)?.value), period: n(document.getElementById(`int-period-${i}`)?.value), desc: n(document.getElementById(`int-desc-${i}`)?.value) });

    for (let i = 0; i < (parseInt(numCertificates?.value) || 0); i++)
      certificates.push({ name: n(document.getElementById(`cert-name-${i}`)?.value), issuer: n(document.getElementById(`cert-issuer-${i}`)?.value), year: n(document.getElementById(`cert-year-${i}`)?.value) });

    return {
      name: n(document.getElementById('full-name')?.value),
      email: n(document.getElementById('email')?.value),
      projects, education, internships, certificates
    };
  }

  function buildPrompt(data) {
    return `Generate a complete, compilable LaTeX resume using moderncv or article class.
Output ONLY raw LaTeX code starting with \\documentclass. No explanations.

NAME: ${data.name || 'Your Name'}
EMAIL: ${data.email || 'your.email@example.com'}

EDUCATION:
${data.education.map((e,i) => `${i+1}. ${e.degree} at ${e.inst}, ${e.year}, Grade: ${e.grade}`).join('\n') || 'None'}

EXPERIENCE:
${data.internships.map((x,i) => `${i+1}. ${x.role} at ${x.company} (${x.period}): ${x.desc}`).join('\n') || 'None'}

PROJECTS:
${data.projects.map((p,i) => `${i+1}. ${p.title} — Tech: ${p.tech} — ${p.desc}`).join('\n') || 'None'}

CERTIFICATES:
${data.certificates.map((c,i) => `${i+1}. ${c.name} by ${c.issuer} (${c.year})`).join('\n') || 'None'}`;
  }

  if (aiResumeForm) {
    aiResumeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = collectFormData();
      if (!data.name || !data.email) { alert('Please enter your full name and email.'); return; }

      const originalMsg = loadingSpan ? loadingSpan.textContent : '';
      if (loadingSpan) loadingSpan.textContent = 'Generating AI Resume...';
      if (loading) loading.style.display = 'flex';
      if (aiResult) aiResult.style.display = 'none';

      try {
        const response = await fetch('/ai-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: buildPrompt(data) })
        });

        if (!response.ok) {
          let errMsg = `Server error (${response.status})`;
          try { const json = await response.json(); errMsg = json.error || errMsg; } catch {}
          throw new Error(errMsg);
        }

        const result = await response.json();
        let latex = (result.latex || '').replace(/^```(?:latex)?\s*/i, '').replace(/```\s*$/i, '').trim();
        if (!latex) throw new Error('Received empty LaTeX from server.');

        if (generatedEl) generatedEl.textContent = latex;
        if (aiResult) { aiResult.style.display = 'block'; aiResult.scrollIntoView({ behavior: 'smooth' }); }

      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        if (loading) loading.style.display = 'none';
        if (loadingSpan) loadingSpan.textContent = originalMsg;
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const latex = generatedEl ? generatedEl.textContent.trim() : '';
      if (!latex || !editor) return;
      editor.value = latex;
      updateLineNumbers();

      navItems.forEach(i => i.classList.remove('active'));
      const homeTab = document.querySelector('[data-page="home"]');
      if (homeTab) homeTab.classList.add('active');
      pages.forEach(p => p.classList.toggle('active', p.id === 'home'));
      if (templateBar) templateBar.style.display = 'flex';
    });
  }
});