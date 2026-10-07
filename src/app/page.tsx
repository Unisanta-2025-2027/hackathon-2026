"use client";

import {
  ArrowDownUp,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  CloudUpload,
  FileCheck2,
  FilePlus2,
  FileText,
  Filter,
  GraduationCap,
  LayoutDashboard,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";

type Screen = "overview" | "studio" | "presets";
type Artifact = "Roteiro" | "Atividade" | "Prova";
type Progress = "Feito" | "Pendente" | "Não iniciado";

type Topic = {
  id: number;
  name: string;
  roteiro: Progress;
  atividade: Progress;
  prova: Progress;
};

const initialTopics: Topic[] = [
  { id: 1, name: "Recursividade", roteiro: "Feito", atividade: "Feito", prova: "Pendente" },
  { id: 2, name: "Filas e Pilhas", roteiro: "Não iniciado", atividade: "Não iniciado", prova: "Não iniciado" },
  { id: 3, name: "Árvores Binárias", roteiro: "Feito", atividade: "Pendente", prova: "Não iniciado" },
  { id: 4, name: "Listas Encadeadas", roteiro: "Feito", atividade: "Feito", prova: "Feito" },
  { id: 5, name: "Tabelas Hash", roteiro: "Pendente", atividade: "Não iniciado", prova: "Não iniciado" },
  { id: 6, name: "Grafos", roteiro: "Não iniciado", atividade: "Não iniciado", prova: "Não iniciado" },
  { id: 7, name: "Algoritmos de Ordenação", roteiro: "Pendente", atividade: "Pendente", prova: "Não iniciado" },
  { id: 8, name: "Busca em Largura e Profundidade", roteiro: "Não iniciado", atividade: "Não iniciado", prova: "Não iniciado" },
  { id: 9, name: "Complexidade de Algoritmos", roteiro: "Feito", atividade: "Não iniciado", prova: "Pendente" },
  { id: 10, name: "Estruturas de Dados em Árvores", roteiro: "Não iniciado", atividade: "Pendente", prova: "Não iniciado" },
  { id: 11, name: "Recursão e Backtracking", roteiro: "Feito", atividade: "Feito", prova: "Não iniciado" },
  { id: 12, name: "Revisão e aplicações", roteiro: "Não iniciado", atividade: "Não iniciado", prova: "Não iniciado" },
];

const artifactKeys: Record<Artifact, keyof Pick<Topic, "roteiro" | "atividade" | "prova">> = {
  Roteiro: "roteiro",
  Atividade: "atividade",
  Prova: "prova",
};

const initialPresets = [
  { name: "Cabeçalho institucional", detail: "Logo, instituição, professor e identificação da turma", active: true, icon: FileText },
  { name: "Questões contextualizadas", detail: "Enunciados práticos com exemplos do cotidiano", active: true, icon: BookOpen },
  { name: "Avaliação equilibrada", detail: "Questões distribuídas por nível de dificuldade", active: false, icon: ClipboardCheck },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [topics, setTopics] = useState(initialTopics);
  const [selectedSubject, setSelectedSubject] = useState("Estrutura de Dados");
  const [selectedClass, setSelectedClass] = useState("Turma A");
  const [term, setTerm] = useState("3º Semestre");
  const [uploadedFile, setUploadedFile] = useState("ementa_estrutura_dados_2026.pdf");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [artifact, setArtifact] = useState<Artifact>("Roteiro");
  const [activeTopicId, setActiveTopicId] = useState(1);
  const [toast, setToast] = useState("");
  const [presets, setPresets] = useState(initialPresets);
  const [presetName, setPresetName] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const planned = topics.filter((topic) => topic.roteiro !== "Não iniciado").length;
    const activities = topics.filter((topic) => topic.atividade === "Feito").length;
    const assessments = topics.filter((topic) => topic.prova === "Feito").length;
    const topicsInProgress = topics.filter((topic) =>
      [topic.roteiro, topic.atividade, topic.prova].some((status) => status !== "Não iniciado"),
    ).length;
    return { planned, activities, assessments, coverage: Math.round((topicsInProgress / topics.length) * 100) };
  }, [topics]);

  const visibleTopics = topics.filter((topic) => {
    const matchesQuery = topic.name.toLowerCase().includes(query.toLowerCase());
    const matchesFilter =
      filter === "Todos" ||
      (filter === "Em andamento" &&
        [topic.roteiro, topic.atividade, topic.prova].some((status) => status === "Pendente")) ||
      (filter === "Não iniciados" &&
        [topic.roteiro, topic.atividade, topic.prova].every((status) => status === "Não iniciado"));
    return matchesQuery && matchesFilter;
  });

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      notify("Escolha um arquivo PDF ou DOCX.");
      event.target.value = "";
      return;
    }
    setUploadedFile(file.name);
    notify("Documento-base adicionado ao planejamento.");
  }

  function openGenerator(topicId?: number, desiredArtifact?: Artifact) {
    if (topicId) setActiveTopicId(topicId);
    if (desiredArtifact) setArtifact(desiredArtifact);
    setModalOpen(true);
  }

  function generateArtifact() {
    setTopics((current) =>
      current.map((topic) =>
        topic.id === activeTopicId
          ? { ...topic, [artifactKeys[artifact]]: "Feito" }
          : topic,
      ),
    );
    setModalOpen(false);
    notify(`${artifact} preparado para ${topics.find((topic) => topic.id === activeTopicId)?.name}.`);
  }

  function addPreset() {
    const name = presetName.trim();
    if (!name) return;
    setPresets((current) => [
      ...current,
      { name, detail: "Padrão personalizado para seus materiais", active: true, icon: Settings2 },
    ]);
    setPresetName("");
    notify("Pré-prompto salvo com sucesso.");
  }

  function exportDocument(format: "PDF" | "DOCX") {
    const topic = topics.find((item) => item.id === activeTopicId);
    const title = `${artifact} — ${topic?.name ?? selectedSubject}`;
    const paragraphs = [
      `${selectedSubject} · ${selectedClass} · ${term}`,
      `Documento-base: ${uploadedFile}`,
      "Objetivos de aprendizagem",
      "Compreender os conceitos principais e aplicá-los em situações práticas.",
      artifact === "Prova" ? "Avaliação" : artifact === "Atividade" ? "Atividade" : "Etapas da aula",
      artifact === "Prova"
        ? "Responda às questões a seguir. Considere os conceitos estudados e justifique suas respostas."
        : "Desenvolva uma solução para o tema proposto e justifique suas escolhas.",
      "1. Explique os conceitos fundamentais relacionados ao tópico.",
      "2. Aplique o conteúdo em um exemplo prático.",
    ];
    const filename = `${artifact.toLowerCase()}-${(topic?.name ?? "material").toLowerCase().replaceAll(" ", "-")}`;

    if (format === "PDF") {
      const printWindow = window.open("", "_blank", "width=900,height=720");
      if (!printWindow) {
        notify("Permita pop-ups para abrir a visualização de impressão em PDF.");
        return;
      }
      const body = paragraphs.map((paragraph, index) =>
        index === 2 || index === 4
          ? `<h2>${escapeHtml(paragraph)}</h2>`
          : `<p>${escapeHtml(paragraph)}</p>`,
      ).join("");
      printWindow.document.write(`<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#24242a;max-width:760px;margin:48px auto;line-height:1.55}header{border-bottom:2px solid #6a5ae0;padding-bottom:16px;margin-bottom:22px}header small{color:#777}h1{font-size:23px;margin:20px 0 6px}h2{font-size:15px;margin-top:25px;color:#5146ac}p{margin:8px 0}.questions{columns:2;column-gap:28px}@media print{body{margin:20mm auto}}</style></head><body><header><strong>DOCENTEFLOW</strong><small> · Material didático</small></header><h1>${escapeHtml(title)}</h1><div class="questions">${body}</div><script>window.onload=()=>window.print()</script></body></html>`);
      printWindow.document.close();
      notify("Visualização pronta. Escolha “Salvar como PDF” na janela de impressão.");
      return;
    }

    const xmlEscape = (value: string) => escapeHtml(value).replaceAll("&apos;", "&apos;");
    const documentParagraphs = [
      `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`,
      ...paragraphs.map((paragraph, index) => `<w:p>${index === 2 || index === 4 ? `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlEscape(paragraph)}</w:t></w:r></w:p>`),
      `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>`,
    ].join("");
    const docxBytes = createZip([
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/document.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${documentParagraphs}</w:body></w:document>` },
    ]);
    const blob = new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.docx`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Documento DOCX exportado.");
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={19} strokeWidth={2.4} /></div>
          <span>docente<span className="brand-accent">flow</span></span>
          <button className="mobile-close icon-button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
        </div>

        <div className="sidebar-context">
          <span className="eyebrow">SEU ESPAÇO DE ENSINO</span>
          <label className="select-wrap">
            <span className="sr-only">Disciplina</span>
            <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>
              <option>Estrutura de Dados</option>
              <option>Programação Web</option>
              <option>Banco de Dados</option>
            </select>
            <ChevronDown size={15} />
          </label>
          <span className="sidebar-subject-note">Prof. de Servidores</span>
        </div>

        <nav className="primary-nav" aria-label="Navegação principal">
          <span className="eyebrow nav-label">ESPAÇO DE TRABALHO</span>
          <NavButton icon={<LayoutDashboard size={17} />} active={screen === "overview"} onClick={() => { setScreen("overview"); setMobileMenuOpen(false); }}>Visão geral <span className="nav-hint">01</span></NavButton>
          <NavButton icon={<Sparkles size={17} />} active={screen === "studio"} onClick={() => { setScreen("studio"); setMobileMenuOpen(false); }}>Esteira de criação <span className="nav-hint">02</span></NavButton>
          <NavButton icon={<SlidersHorizontal size={17} />} active={screen === "presets"} onClick={() => { setScreen("presets"); setMobileMenuOpen(false); }}>Pré-promptos <span className="nav-hint">03</span></NavButton>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={16} /></div>
            <div><strong>Precisa de ajuda?</strong><span>Veja como funciona</span></div>
            <ArrowRight size={15} />
          </div>
          <div className="profile">
            <div className="avatar">MS</div>
            <div className="profile-copy"><strong>Marcos Silva</strong><span>Ensino Superior</span></div>
            <MoreHorizontal size={18} className="profile-more" />
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Espaço de trabalho</span><span className="crumb-slash">/</span><strong>{screen === "overview" ? "Visão geral" : screen === "studio" ? "Esteira de criação" : "Pré-promptos"}</strong></div>
          <div className="topbar-actions">
            <span className="semester-chip"><span className="status-dot" /> Ano letivo 2026</span>
            <button className="avatar avatar-small" aria-label="Perfil do professor">MS</button>
          </div>
        </header>

        <div className="content">
          {screen === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="heading-overline"><span className="heading-rule" /> SEU PLANEJAMENTO, EM UM SÓ LUGAR</div>
                  <h1>{selectedSubject}<label className="term-chip"><select aria-label="Semestre" value={term} onChange={(event) => setTerm(event.target.value)}><option>3º Semestre</option><option>1º Semestre</option><option>2º Semestre</option></select><ChevronDown size={11} /></label></h1>
                  <p className="page-subtitle">Acompanhe o conteúdo do semestre e transforme cada tópico em material de aula.</p>
                </div>
                <div className="heading-actions">
                  <label className="class-select"><GraduationCap size={15} /><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option>Turma A</option><option>Turma B</option><option>Turma C</option></select><ChevronDown size={14} /></label>
                  <button className="button button-primary" onClick={() => fileInputRef.current?.click()}><Plus size={16} /> Novo documento</button>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={handleFile} />
              <button className="upload-strip" onClick={() => fileInputRef.current?.click()}>
                <span className="upload-symbol"><CloudUpload size={21} /></span>
                <span className="upload-copy"><strong>Adicione sua ementa ou documento-base</strong><span>{uploadedFile ? <>Último documento: <b>{uploadedFile}</b></> : "Arraste um PDF ou DOCX, ou clique para selecionar"}</span></span>
                <span className="upload-action"><Upload size={14} /> Selecionar arquivo</span>
              </button>

              <section className="overview-card tracker-summary">
                <div className="section-heading summary-heading">
                  <div><span className="section-kicker">ACOMPANHAMENTO</span><h2>Ementa Tracker <span className="heading-separator">/</span> Cobertura do semestre</h2></div>
                  <span className="updated-label"><span className="live-dot" /> Atualizado agora</span>
                </div>
                <div className="coverage-line"><span>Progresso do planejamento</span><strong>{totals.coverage}%</strong></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${totals.coverage}%` }} /></div>
                <div className="metric-grid">
                  <Metric icon={<List size={17} />} value={topics.length} label="Tópicos mapeados" accent="lavender" />
                  <Metric icon={<CheckCircle2 size={17} />} value={totals.planned} label="Aulas planejadas" accent="mint" />
                  <Metric icon={<CheckCheck size={17} />} value={totals.activities} label="Atividades criadas" accent="peach" />
                  <Metric icon={<ClipboardCheck size={17} />} value={totals.assessments} label="Conteúdos em avaliações" accent="blue" />
                </div>
              </section>

              <section className="overview-card topic-card">
                <div className="topic-toolbar">
                  <div className="section-heading topic-title"><div><span className="section-kicker">CONTEÚDO PROGRAMÁTICO</span><h2>Tópicos da ementa <span className="topic-count">{topics.length}</span></h2></div></div>
                  <div className="table-actions">
                    <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tópico" /></label>
                    <label className="filter-control"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Todos</option><option>Em andamento</option><option>Não iniciados</option></select><ChevronDown size={13} /></label>
                    <button className="icon-button sort-button" title="Ordenar tópicos" onClick={() => setTopics((current) => [...current].reverse())}><ArrowDownUp size={15} /></button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="topic-table">
                    <thead><tr><th className="number-col">Nº</th><th className="name-col">TÓPICO</th><th>ROTEIRO</th><th>ATIVIDADE</th><th>PROVA</th><th className="action-col">AÇÃO</th></tr></thead>
                    <tbody>
                      {visibleTopics.map((topic) => (
                        <tr key={topic.id}>
                          <td className="number-cell">{String(topic.id).padStart(2, "0")}</td>
                          <td className="topic-name">{topic.name}</td>
                          <td><StatusPill status={topic.roteiro} /></td>
                          <td><StatusPill status={topic.atividade} /></td>
                          <td><StatusPill status={topic.prova} /></td>
                          <td><button className="generate-link" onClick={() => openGenerator(topic.id)}>Criar material <ArrowRight size={13} /></button></td>
                        </tr>
                      ))}
                      {visibleTopics.length === 0 && <tr><td colSpan={6} className="empty-state">Nenhum tópico encontrado. Tente mudar a busca ou o filtro.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Exibindo <strong>{visibleTopics.length}</strong> de <strong>{topics.length}</strong> tópicos</span><button onClick={() => openGenerator()} className="text-link">Criar material <ArrowRight size={14} /></button></div>
              </section>
              <div className="bottom-note"><Sparkles size={14} /> Um documento-base, vários materiais prontos para sua turma.</div>
            </>
          )}

          {screen === "studio" && (
            <StudioScreen
              topics={topics}
              uploadedFile={uploadedFile}
              fileInputRef={fileInputRef}
              onFile={handleFile}
              onGenerate={openGenerator}
              onOpenPresets={() => setScreen("presets")}
              onExport={exportDocument}
            />
          )}

          {screen === "presets" && (
            <section className="presets-page">
              <div className="page-heading">
                <div><div className="heading-overline"><span className="heading-rule" /> SEU JEITO DE ENSINAR</div><h1>Pré-promptos</h1><p className="page-subtitle">Salve suas preferências uma vez. Seus próximos materiais já começam do seu jeito.</p></div>
                <span className="saved-count"><Check size={15} /> {presets.filter((preset) => preset.active).length} padrões ativos</span>
              </div>
              <div className="preset-intro">
                <div className="preset-intro-icon"><Settings2 size={20} /></div>
                <div><h2>Seus padrões, sempre à mão</h2><p>Ative ou desative as preferências que devem ser aplicadas aos materiais gerados.</p></div>
                <span className="intro-decoration"><Sparkles size={42} /></span>
              </div>
              <div className="preset-list">
                {presets.map((preset, index) => {
                  const PresetIcon = preset.icon;
                  return <article className="preset-card" key={`${preset.name}-${index}`}>
                    <div className="preset-card-icon"><PresetIcon size={19} /></div>
                    <div className="preset-card-copy"><h3>{preset.name}</h3><p>{preset.detail}</p><span className="preset-tag">APLICADO A ROTEIROS, ATIVIDADES E PROVAS</span></div>
                    <button className={`toggle ${preset.active ? "toggle-on" : ""}`} role="switch" aria-checked={preset.active} aria-label={`Ativar ${preset.name}`} onClick={() => setPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: !item.active } : item))}><span /></button>
                  </article>;
                })}
              </div>
              <div className="add-preset-card">
                <div className="add-preset-copy"><h3>Crie seu próprio padrão</h3><p>Adicione uma regra que você costuma repetir ao preparar seus materiais.</p></div>
                <div className="add-preset-form"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPreset(); }} placeholder="Ex.: Questões no estilo ENADE" /><button className="button button-primary" onClick={addPreset}><Plus size={15} /> Salvar padrão</button></div>
              </div>
              <div className="preset-footnote"><FileCheck2 size={15} /> Os padrões ativos serão considerados ao preparar o próximo material.</div>
            </section>
          )}
        </div>
      </section>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title">
          <div className="modal-topline"><span className="modal-icon"><Sparkles size={18} /></span><button className="icon-button" aria-label="Fechar" onClick={() => setModalOpen(false)}><X size={18} /></button></div>
          <span className="section-kicker">ESTEIRA DE CRIAÇÃO</span><h2 id="generator-title">O que vamos preparar?</h2><p className="modal-description">Escolha o formato e a gente organiza um rascunho a partir da sua ementa.</p>
          <div className="artifact-options">
            {(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((option) => <button key={option} className={`artifact-option ${artifact === option ? "artifact-selected" : ""}`} onClick={() => setArtifact(option)}><span className="artifact-option-icon">{option === "Roteiro" ? <BookOpen size={18} /> : option === "Atividade" ? <FilePlus2 size={18} /> : <ClipboardCheck size={18} />}</span><span><strong>{option}</strong><small>{option === "Roteiro" ? "Plano de aula estruturado" : option === "Atividade" ? "Exercícios para praticar" : "Avaliação com gabarito"}</small></span>{artifact === option && <CheckCircle2 size={17} className="selected-check" />}</button>)}
          </div>
          <label className="form-label">TÓPICO DA EMENTA<select value={activeTopicId} onChange={(event) => setActiveTopicId(Number(event.target.value))}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select><ChevronDown size={15} /></label>
          <div className="modal-template"><div><span className="template-icon"><FileText size={16} /></span><span><strong>Padrão selecionado</strong><small>{presets.filter((preset) => preset.active).length} preferências serão aplicadas</small></span></div><button onClick={() => { setModalOpen(false); setScreen("presets"); }}>Editar</button></div>
          <div className="modal-footer"><button className="button button-quiet" onClick={() => setModalOpen(false)}>Cancelar</button><button className="button button-primary" onClick={generateArtifact}><Sparkles size={15} /> Preparar rascunho</button></div>
          <p className="modal-disclaimer">Protótipo: a geração atualiza seu rastreador e prepara um modelo demonstrativo.</p>
        </section>
      </div>}
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </main>
  );
}

function NavButton({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} onClick={onClick}><span className="nav-icon">{icon}</span><span className="nav-text">{children}</span>{active && <span className="nav-active-mark" />}</button>;
}

function Metric({ icon, value, label, accent }: { icon: React.ReactNode; value: number; label: string; accent: string }) {
  return <div className="metric-card"><span className={`metric-icon ${accent}`}>{icon}</span><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>;
}

function StatusPill({ status }: { status: Progress }) {
  return <span className={`status-pill ${status === "Feito" ? "status-done" : status === "Pendente" ? "status-pending" : "status-idle"}`}>{status === "Feito" && <Check size={10} />}{status}</span>;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function createZip(entries: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({ name: encoder.encode(entry.name), data: encoder.encode(entry.content) }));
  const crc32 = (data: Uint8Array) => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const checksum = crc32(file.data);
    const local = new Uint8Array(30 + file.name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, file.name.length, true);
    local.set(file.name, 30);
    localParts.push(local, file.data);

    const central = new Uint8Array(46 + file.name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, file.name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(file.name, 46);
    centralParts.push(central);
    localOffset += local.length + file.data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return concatenateBytes([...localParts, ...centralParts, end]);
}

function concatenateBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function StudioScreen({ topics, uploadedFile, fileInputRef, onFile, onGenerate, onOpenPresets, onExport }: {
  topics: Topic[];
  uploadedFile: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: (topicId?: number, artifact?: Artifact) => void;
  onOpenPresets: () => void;
  onExport: (format: "PDF" | "DOCX") => void;
}) {
  const [selectedType, setSelectedType] = useState<Artifact>("Roteiro");
  const [selectedTopic, setSelectedTopic] = useState(topics[0]?.id ?? 1);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionTopic, setCorrectionTopic] = useState("");
  const [correctionFile, setCorrectionFile] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");
  return <section className="studio-page">
    <div className="page-heading"><div><div className="heading-overline"><span className="heading-rule" /> DO CONTEÚDO AO MATERIAL</div><h1>Esteira de criação</h1><p className="page-subtitle">Monte materiais no seu formato, sem começar do zero.</p></div><span className="studio-step"><span>1</span> Escolha <i /> <span>2</span> Personalize <i /> <span>3</span> Exporte</span></div>
    <div className="studio-layout">
      <div className="studio-main">
        <div className="studio-card source-card">
          <div className="card-title-row"><div className="number-badge">01</div><div><span className="section-kicker">FONTE DE CONTEÚDO</span><h2>Comece pelo seu documento</h2></div><span className="ready-tag"><Check size={12} /> Documento pronto</span></div>
          <div className="source-file"><span className="source-file-icon"><FileText size={19} /></span><div><strong>{uploadedFile || "Nenhum documento selecionado"}</strong><span>{uploadedFile ? "Documento-base · PDF / DOCX" : "Adicione a ementa ou o conteúdo da aula"}</span></div><button className="button button-outline button-small" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Trocar arquivo</button></div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={onFile} />
        </div>

        <div className="studio-card create-card">
          <div className="card-title-row"><div className="number-badge">02</div><div><span className="section-kicker">NOVO MATERIAL</span><h2>O que você quer criar?</h2></div></div>
          <div className="create-type-grid">{(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((type) => <button key={type} className={`create-type ${selectedType === type ? "create-type-active" : ""}`} onClick={() => setSelectedType(type)}><span className="create-type-icon">{type === "Roteiro" ? <BookOpen size={20} /> : type === "Atividade" ? <FilePlus2 size={20} /> : <ClipboardCheck size={20} />}</span><strong>{type}</strong><span>{type === "Roteiro" ? "Plano de aula completo" : type === "Atividade" ? "Prática para a turma" : "Avaliação e gabarito"}</span>{selectedType === type && <CheckCircle2 size={16} className="type-check" />}</button>)}</div>
          <div className="form-row"><label className="form-label">TÓPICO DA EMENTA<select value={selectedTopic} onChange={(event) => setSelectedTopic(Number(event.target.value))}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select><ChevronDown size={15} /></label><label className="form-label">LAYOUT DO MATERIAL<select defaultValue="Padrão escolar · 2 colunas"><option>Padrão escolar · 2 colunas</option><option>Folha de atividades</option><option>Plano de aula</option></select><ChevronDown size={15} /></label></div>
          <div className="presets-applied"><span className="applied-icon"><Settings2 size={15} /></span><span><strong>Seus pré-promptos ativos</strong><small>Cabeçalho institucional · Questões contextualizadas</small></span><button onClick={onOpenPresets}>Ver padrões <ArrowRight size={13} /></button></div>
          <div className="studio-submit"><span><Sparkles size={15} /> Pronto em poucos segundos</span><button className="button button-primary" onClick={() => onGenerate(selectedTopic, selectedType)}><Sparkles size={16} /> Preparar {selectedType.toLowerCase()} <ArrowRight size={15} /></button></div>
        </div>

        <div className="studio-card correction-card">
          <button className="correction-toggle" onClick={() => setCorrectionOpen((open) => !open)}><span className="correction-icon"><ClipboardCheck size={18} /></span><span className="correction-copy"><strong>Correção de prova</strong><small>Compare respostas com o gabarito e agilize a avaliação.</small></span><span className="correction-expand">{correctionOpen ? "Fechar" : "Abrir módulo"} <ChevronDown size={14} className={correctionOpen ? "chevron-up" : ""} /></span></button>
          {correctionOpen && <div className="correction-body"><label className="form-label">GABARITO OU RUBRICA<select value={correctionTopic} onChange={(event) => setCorrectionTopic(event.target.value)}><option value="">Selecione uma prova criada</option>{topics.filter((topic) => topic.prova === "Feito").map((topic) => <option key={topic.id}>{topic.name}</option>)}</select><ChevronDown size={15} /></label><label className="correction-upload"><Upload size={16} />{correctionFile || "Envie as respostas dos alunos"}<input type="file" accept=".pdf,.doc,.docx,.jpg,.png" onChange={(event) => { setCorrectionFile(event.target.files?.[0]?.name ?? ""); setCorrectionMessage(""); }} /></label><button className="button button-outline" onClick={() => setCorrectionMessage(correctionTopic && correctionFile ? `Respostas de ${correctionFile} prontas para comparar com o gabarito de ${correctionTopic}.` : "Selecione uma prova e adicione o arquivo com as respostas.")}>Iniciar correção <ArrowRight size={14} /></button>{correctionMessage && <div className="correction-message" role="status">{correctionMessage} <span>Prévia demonstrativa</span></div>}</div>}
        </div>
      </div>

      <aside className="studio-aside">
        <div className="preview-card"><div className="preview-top"><span className="section-kicker">VISUALIZAÇÃO</span><span className="preview-dots">•••</span></div><div className="paper"><div className="paper-brand"><span className="paper-logo"><GraduationCap size={15} /></span><span>INSTITUIÇÃO DE ENSINO<small>Material didático</small></span></div><div className="paper-line" /><span className="paper-label">{selectedType.toUpperCase()} · ESTRUTURA DE DADOS</span><h3>{topics.find((topic) => topic.id === selectedTopic)?.name}</h3><p>Objetivos de aprendizagem e conteúdos para a sua turma.</p><div className="paper-section-title" /><div className="paper-line wide" /><div className="paper-line" /><div className="paper-question"><b>01.</b><span>Questão ou etapa do material preparada para seus alunos...</span></div><div className="paper-question"><b>02.</b><span>Desenvolva e explique sua resposta.</span></div><div className="paper-columns"><i /><i /></div><span className="paper-footer">DOCENTEFLOW · 2026</span></div><div className="export-row"><button className="button button-outline" onClick={() => onExport("PDF")}><FileText size={15} /> Exportar PDF</button><button className="button button-outline" onClick={() => onExport("DOCX")}><FileCheck2 size={15} /> Exportar DOCX</button></div></div>
        <div className="tip-card"><span><Sparkles size={15} /></span><p><strong>Dica de professor</strong>Materiais em 2 colunas ajudam a economizar papel na hora de imprimir.</p></div>
      </aside>
    </div>
  </section>;
}
