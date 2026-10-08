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
import {
  alterarPrePrompto,
  atualizarSituacaoTopico,
  carregarDados,
  cadastrar,
  criarArtefato,
  criarCorrecao,
  criarMateria,
  criarPrePrompto,
  criarTopico,
  criarTurma,
  entrar,
  enviarEmenta,
  sair,
  type AppData,
  type TopicRecord,
} from "./actions";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

type Screen = "overview" | "studio" | "presets";
type Artifact = "Roteiro" | "Atividade" | "Prova";
type Progress = "Feito" | "Pendente" | "Não iniciado";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [appData, setAppData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [topicsAscending, setTopicsSorted] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [artifact, setArtifact] = useState<Artifact>("Roteiro");
  const [activeTopicId, setActiveTopicId] = useState("");
  const [toast, setToast] = useState("");
  const [presetName, setPresetName] = useState("");
  const [formError, setFormError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(async (preferredSubjectId?: string, preferredClassId?: string) => {
    const result = await carregarDados();
    if (result.error) {
      setFormError(result.error);
      setAppData(null);
    } else {
      setFormError("");
      setAppData(result.data);
      if (result.data) {
        const subjectId = (result.data.materias.some((item) => item.id === preferredSubjectId)
          ? preferredSubjectId
          : result.data.materias[0]?.id) ?? "";
        setSelectedSubject(subjectId);
        const classId = (result.data.turmas.some(
          (item) => item.id === preferredClassId && item.materia_id === subjectId,
        )
          ? preferredClassId
          : result.data.turmas.find((item) => item.materia_id === subjectId)?.id) ?? "";
        setSelectedClass(classId);
        setActiveTopicId((current) =>
          result.data?.topicos.some((topic) => topic.id === current)
            ? current
            : result.data?.topicos[0]?.id ?? "",
        );
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refreshData();
    });
  }, [refreshData]);

  const subject = appData?.materias.find((item) => item.id === selectedSubject);
  const classroom = appData?.turmas.find((item) => item.id === selectedClass);
  const syllabus = appData?.ementas.find((item) => item.materia_id === selectedSubject);
  const topics = useMemo(
    () => appData?.topicos.filter((topic) => topic.materia_id === selectedSubject) ?? [],
    [appData?.topicos, selectedSubject],
  );
  const presets = appData?.prePromptos ?? [];
  const uploadedFile = syllabus?.nome_arquivo ?? "";
  const term = classroom?.semestre ? `${classroom.semestre}º Semestre` : `${classroom?.ano_letivo ?? new Date().getFullYear()}`;

  const totals = useMemo(() => {
    const planned = topics.filter((topic) => topic.roteiro !== "Não iniciado").length;
    const activities = topics.filter((topic) => topic.atividade === "Feito").length;
    const assessments = topics.filter((topic) => topic.prova === "Feito").length;
    const topicsInProgress = topics.filter((topic) =>
      [topic.roteiro, topic.atividade, topic.prova].some((status) => status !== "Não iniciado"),
    ).length;
    return { planned, activities, assessments, coverage: topics.length ? Math.round((topicsInProgress / topics.length) * 100) : 0 };
  }, [topics]);

  const visibleTopics = [...topics].sort((left, right) =>
    topicsAscending ? left.titulo.localeCompare(right.titulo) : right.titulo.localeCompare(left.titulo),
  ).filter((topic) => {
    const matchesQuery = topic.titulo.toLowerCase().includes(query.toLowerCase());
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
    event.target.value = "";
    if (!file || !selectedSubject) {
      if (!selectedSubject) notify("Crie ou selecione uma matéria antes de enviar a ementa.");
      return;
    }
    const formData = new FormData();
    formData.set("arquivo", file);
    formData.set("materiaId", selectedSubject);
    formData.set("titulo", file.name);
    formData.set("anoLetivo", String(subject?.ano_letivo ?? new Date().getFullYear()));
    startTransition(async () => {
      const result = await enviarEmenta(formData);
      if (result.error) {
        notify(result.error);
        return;
      }
      await refreshData(selectedSubject, selectedClass);
      notify("Documento-base enviado com segurança.");
    });
  }

  function openGenerator(topicId?: string, desiredArtifact?: Artifact) {
    if (!selectedSubject || !selectedClass || !topics.length) {
      notify("Cadastre uma matéria, turma e tópico antes de preparar um material.");
      return;
    }
    const topic = topicId ? topics.find((item) => item.id === topicId) : topics[0];
    if (topic) setActiveTopicId(topic.id);
    if (desiredArtifact) setArtifact(desiredArtifact);
    if (!syllabus) {
      notify("Adicione primeiro uma ementa para vincular este material.");
      return;
    }
    setModalOpen(true);
  }

  async function generateArtifact() {
    const topic = topics.find((item) => item.id === activeTopicId);
    if (!topic || !subject || !syllabus) {
      notify("Selecione um tópico de uma ementa.");
      return;
    }
    const title = `${artifact} — ${topic.titulo}`;
    const content = {
      objetivo: `Compreender os conceitos de ${topic.titulo} e aplicá-los em situações práticas.`,
      desenvolvimento: artifact === "Roteiro"
        ? "Apresentação do conteúdo, discussão guiada e resolução coletiva de exemplos."
        : artifact === "Atividade"
          ? "Desenvolva uma solução para o tema proposto e justifique suas escolhas."
          : "Responda às questões e justifique as soluções com base nos conceitos estudados.",
      questoes: "1. Explique os conceitos fundamentais relacionados ao tópico.\n2. Aplique o conteúdo em um exemplo prático.",
    };
    const artifactType = artifact === "Roteiro" ? "roteiro_aula" : artifact === "Atividade" ? "atividade" : "prova";
    const activePreset = presets.find((preset) => preset.ativo);
    startTransition(async () => {
      const result = await criarArtefato({
        materiaId: subject.id,
        turmaId: classroom?.materia_id === subject.id ? classroom.id : null,
        ementaId: topic.ementa_id,
        topicoId: topic.id,
        prePromptoId: activePreset?.id ?? null,
        snapshotPrePrompto: {
          nome: activePreset?.nome ?? "",
          descricao: activePreset?.descricao ?? "",
        },
        tipo: artifactType,
        titulo: title,
        conteudo: content,
      });
      if (result.error) {
        notify(result.error);
        return;
      }
      setModalOpen(false);
      await refreshData(subject.id, classroom?.id);
      notify("Rascunho salvo no banco. A geração por IA ainda não está conectada.");
    });
  }

  async function addPreset() {
    const name = presetName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await criarPrePrompto({ nome: name });
      if (result.error) {
        notify(result.error);
        return;
      }
      setPresetName("");
      await refreshData(selectedSubject, selectedClass);
      notify("Pré-prompto salvo no banco.");
    });
  }

  async function createSubjectAndClass(formData: FormData) {
    const subjectName = String(formData.get("materia") ?? "").trim();
    const className = String(formData.get("turma") ?? "").trim();
    const year = Number(formData.get("anoLetivo"));
    const semesterValue = String(formData.get("semestre") ?? "");
    const semester = semesterValue ? Number(semesterValue) : null;
    const shift = String(formData.get("turno") ?? "").trim() || null;
    if (!subjectName || !className) {
      notify("Informe o nome da matéria e da turma.");
      return;
    }
    startTransition(async () => {
      const subjectResult = await criarMateria({ nome: subjectName, anoLetivo: year });
      if (subjectResult.error || !subjectResult.data) {
        notify(subjectResult.error ?? "Não foi possível criar a matéria.");
        return;
      }
      const createdSubject = subjectResult.data;
      const classResult = await criarTurma({ materiaId: createdSubject.id, nome: className, semestre: semester, turno: shift });
      if (classResult.error || !classResult.data) {
        await refreshData(createdSubject.id);
        notify(`Matéria criada, mas a turma falhou: ${classResult.error ?? "erro inesperado"}`);
        return;
      }
      const createdClass = classResult.data;
      setSelectedSubject(createdSubject.id);
      setSelectedClass(createdClass.id);
      setManagementOpen(false);
      await refreshData(createdSubject.id, createdClass.id);
      notify("Matéria e turma criadas.");
    });
  }

  async function createTopicFromForm(formData: FormData) {
    const ementaId = String(formData.get("ementaId") ?? "");
    const title = String(formData.get("titulo") ?? "");
    const description = String(formData.get("descricao") ?? "");
    startTransition(async () => {
      const result = await criarTopico({ ementaId, titulo: title, descricao: description });
      if (result.error) {
        notify(result.error);
        return;
      }
      setTopicModalOpen(false);
      await refreshData(selectedSubject, selectedClass);
      notify("Tópico adicionado à ementa.");
    });
  }

  async function togglePreset(id: string, active: boolean) {
    startTransition(async () => {
      const result = await alterarPrePrompto({ id, ativo: active });
      if (result.error) {
        notify(result.error);
        return;
      }
      await refreshData(selectedSubject, selectedClass);
    });
  }

  async function handleTopicStatus(topicId: string, status: string) {
    if (!["pendente", "planejado", "praticado", "avaliado"].includes(status)) return;
    startTransition(async () => {
      const result = await atualizarSituacaoTopico({
        topicoId: topicId,
        situacao: status as TopicRecord["situacao"],
      });
      if (result.error) {
        notify(result.error);
        return;
      }
      await refreshData(selectedSubject, selectedClass);
      notify("Status do tópico atualizado.");
    });
  }

  if (loading) {
    return <main className="auth-shell"><div className="auth-card"><span className="brand-mark"><GraduationCap size={19} /></span><p>Conectando ao PréPrompto…</p></div></main>;
  }

  if (!appData) {
    return <AuthScreen error={formError} onLogin={async (data) => {
      const result = await entrar(data);
      if (result.error) return result.error;
      await refreshData();
      return null;
    }} onSignup={async (data) => {
      const result = await cadastrar(data);
      if (result.error) return result.error;
      if (!result.data) return "O cadastro não foi concluído. Tente novamente.";
      if (result.data.confirmationRequired) return "Cadastro iniciado. Confirme seu e-mail e depois entre na plataforma.";
      await refreshData();
      return null;
    }} />;
  }

  if (!appData.materias.length) {
    return <main className="auth-shell"><div className="auth-card onboarding-card">
      <div className="brand"><div className="brand-mark"><GraduationCap size={19} /></div><span>Pré<span className="brand-accent">Prompto</span></span></div>
      <span className="section-kicker">PRIMEIRO ACESSO</span><h1>Organize seu espaço de ensino</h1>
      <p className="page-subtitle">Cadastre uma matéria e sua turma para começar a guardar ementas, tópicos e materiais.</p>
      <form action={createSubjectAndClass} className="onboarding-form">
        <label>Matéria<input name="materia" required placeholder="Ex.: Estrutura de Dados" /></label>
        <label>Turma<input name="turma" required placeholder="Ex.: Turma A — Noturno" /></label>
        <div className="form-row">
          <label>Ano letivo<input name="anoLetivo" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /></label>
          <label>Semestre<select name="semestre" defaultValue=""><option value="">Selecione</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}º semestre</option>)}</select></label>
        </div>
        <label>Turno<input name="turno" placeholder="Ex.: Noturno" /></label>
        <button className="button button-primary" disabled={isPending}><Plus size={15} /> Criar matéria e turma</button>
      </form>
      <button className="auth-signout" onClick={() => void sair().then(() => window.location.reload())}>Sair da conta</button>
    </div></main>;
  }

  if (!subject || !classroom) {
    const subjectId = subject?.id ?? "";
    return <main className="auth-shell"><div className="auth-card onboarding-card">
      <div className="brand"><div className="brand-mark"><GraduationCap size={19} /></div><span>Pré<span className="brand-accent">Prompto</span></span></div>
      <span className="section-kicker">SUA PRIMEIRA TURMA</span><h1>Adicione uma turma</h1>
      <p className="page-subtitle">A matéria {subject?.nome} já está pronta. Agora vincule sua primeira turma.</p>
      <form action={async (formData) => {
        const className = String(formData.get("turma") ?? "");
        const semesterValue = String(formData.get("semestre") ?? "");
        startTransition(async () => {
          const result = await criarTurma({
            materiaId: subjectId,
            nome: className,
            semestre: semesterValue ? Number(semesterValue) : null,
            turno: String(formData.get("turno") ?? ""),
          });
          if (result.error || !result.data) {
            notify(result.error ?? "Não foi possível criar a turma.");
            return;
          }
          setSelectedClass(result.data.id);
          await refreshData(subjectId, result.data.id);
        });
      }} className="onboarding-form">
        <label>Turma<input name="turma" required placeholder="Ex.: Turma A — Noturno" /></label>
        <div className="form-row">
          <label>Semestre<select name="semestre" defaultValue=""><option value="">Selecione</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}º semestre</option>)}</select></label>
          <label>Turno<input name="turno" placeholder="Ex.: Noturno" /></label>
        </div>
        <button className="button button-primary" disabled={isPending}><Plus size={15} /> Criar turma</button>
      </form>
      <button className="auth-signout" onClick={() => void sair().then(() => window.location.reload())}>Sair da conta</button>
    </div></main>;
  }

  const selectedSubjectRecord = subject;
  function exportDocument(format: "PDF" | "DOCX") {
    const topic = topics.find((item) => item.id === activeTopicId);
    const title = `${artifact} — ${topic?.titulo ?? subject?.nome ?? "Material"}`;
    const paragraphs = [
      `${subject?.nome ?? ""} · ${classroom?.nome ?? ""} · ${term}`,
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
    const filename = `${artifact.toLowerCase()}-${(topic?.titulo ?? "material").toLowerCase().replaceAll(" ", "-")}`;

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
      printWindow.document.write(`<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#24242a;max-width:760px;margin:48px auto;line-height:1.55}header{border-bottom:2px solid #6a5ae0;padding-bottom:16px;margin-bottom:22px}header small{color:#777}h1{font-size:23px;margin:20px 0 6px}h2{font-size:15px;margin-top:25px;color:#5146ac}p{margin:8px 0}.questions{columns:2;column-gap:28px}@media print{body{margin:20mm auto}}</style></head><body><header><strong>PréPrompto</strong><small> · Material didático</small></header><h1>${escapeHtml(title)}</h1><div class="questions">${body}</div><script>window.onload=()=>window.print()</script></body></html>`);
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
          <span>Pré<span className="brand-accent">Prompto</span></span>
          <button className="mobile-close icon-button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
        </div>

        <div className="sidebar-context">
          <span className="eyebrow">SEU ESPAÇO DE ENSINO</span>
          <label className="select-wrap">
            <span className="sr-only">Disciplina</span>
            <select value={selectedSubject} onChange={(event) => {
              const id = event.target.value;
              setSelectedSubject(id);
              setSelectedClass(appData.turmas.find((item) => item.materia_id === id)?.id ?? "");
            }}>
              {appData.materias.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
            <ChevronDown size={15} />
          </label>
          <span className="sidebar-subject-note">{subject?.ano_letivo ?? ""} · {appData.professor.nome_completo}</span>
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
            <div className="avatar">{appData.professor.nome_completo.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
            <div className="profile-copy"><strong>{appData.professor.nome_completo}</strong><span>{appData.professor.id.slice(0, 8)}</span></div>
            <button className="icon-button profile-more" aria-label="Sair da conta" onClick={() => { startTransition(async () => { const result = await sair(); if (result.error) notify(result.error); else window.location.reload(); }); }}><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Espaço de trabalho</span><span className="crumb-slash">/</span><strong>{screen === "overview" ? "Visão geral" : screen === "studio" ? "Esteira de criação" : "Pré-promptos"}</strong></div>
          <div className="topbar-actions">
            <span className="semester-chip"><span className="status-dot" /> Ano letivo {classroom.ano_letivo}</span>
            <button className="avatar avatar-small" aria-label={`Perfil de ${appData.professor.nome_completo}`}>{appData.professor.nome_completo.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</button>
          </div>
        </header>

        <div className="content">
          {screen === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="heading-overline"><span className="heading-rule" /> SEU PLANEJAMENTO, EM UM SÓ LUGAR</div>
                  <h1>{subject.nome}<span className="term-chip">{term}</span></h1>
                  <p className="page-subtitle">Acompanhe o conteúdo do semestre e transforme cada tópico em material de aula.</p>
                </div>
                <div className="heading-actions">
                  <label className="class-select"><GraduationCap size={15} /><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>{appData.turmas.filter((item) => item.materia_id === subject.id).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><ChevronDown size={14} /></label>
                  <button className="button button-outline" onClick={() => setManagementOpen(true)}><Plus size={15} /> Matéria / turma</button>
                  <button className="button button-primary" onClick={() => fileInputRef.current?.click()} disabled={isPending}><Plus size={16} /> Nova ementa</button>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={handleFile} />
              <button className="upload-strip" onClick={() => fileInputRef.current?.click()}>
                <span className="upload-symbol"><CloudUpload size={21} /></span>
                <span className="upload-copy"><strong>Adicione sua ementa ou documento-base</strong><span>{isPending ? "Enviando arquivo para o armazenamento privado…" : uploadedFile ? <>Última ementa: <b>{uploadedFile}</b></> : "Selecione um PDF, DOCX ou TXT para armazenar na sua conta"}</span></span>
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
                    <button className="icon-button sort-button" title="Ordenar tópicos" onClick={() => setTopicsSorted((current) => !current)}><ArrowDownUp size={15} /></button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="topic-table">
                    <thead><tr><th className="number-col">Nº</th><th className="name-col">TÓPICO</th><th>ROTEIRO</th><th>ATIVIDADE</th><th>PROVA</th><th className="action-col">AÇÃO</th></tr></thead>
                    <tbody>
                      {visibleTopics.map((topic) => (
                        <tr key={topic.id}>
                          <td className="number-cell">{String(topics.indexOf(topic) + 1).padStart(2, "0")}</td>
                          <td className="topic-name">{topic.titulo}<select className="topic-situation-select" aria-label={`Status de ${topic.titulo}`} value={topic.situacao} onChange={(event) => handleTopicStatus(topic.id, event.target.value)} disabled={isPending}><option value="pendente">Pendente</option><option value="planejado">Planejado</option><option value="praticado">Praticado</option><option value="avaliado">Avaliado</option></select></td>
                          <td><StatusPill status={topic.roteiro} /></td>
                          <td><StatusPill status={topic.atividade} /></td>
                          <td><StatusPill status={topic.prova} /></td>
                          <td><button className="generate-link" onClick={() => openGenerator(topic.id)}>Criar material <ArrowRight size={13} /></button></td>
                        </tr>
                      ))}
                      {visibleTopics.length === 0 && <tr><td colSpan={6} className="empty-state">{topics.length ? "Nenhum tópico encontrado. Tente mudar a busca ou o filtro." : <>Esta ementa ainda não tem tópicos. <button className="text-link" onClick={() => setTopicModalOpen(true)}>Adicionar tópico</button></>}</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Exibindo <strong>{visibleTopics.length}</strong> de <strong>{topics.length}</strong> tópicos</span><div className="table-footer-actions"><button onClick={() => setTopicModalOpen(true)} className="text-link"><Plus size={13} /> Adicionar tópico</button><button onClick={() => openGenerator()} className="text-link">Criar material <ArrowRight size={14} /></button></div></div>
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
              provas={appData.provas}
            />
          )}

          {screen === "presets" && (
            <section className="presets-page">
              <div className="page-heading">
                <div><div className="heading-overline"><span className="heading-rule" /> SEU JEITO DE ENSINAR</div><h1>Pré-promptos</h1><p className="page-subtitle">Salve suas preferências uma vez. Seus próximos materiais já começam do seu jeito.</p></div>
                <span className="saved-count"><Check size={15} /> {presets.filter((preset) => preset.ativo).length} padrões ativos</span>
              </div>
              <div className="preset-intro">
                <div className="preset-intro-icon"><Settings2 size={20} /></div>
                <div><h2>Seus padrões, sempre à mão</h2><p>Ative ou desative as preferências que devem ser aplicadas aos materiais gerados.</p></div>
                <span className="intro-decoration"><Sparkles size={42} /></span>
              </div>
              <div className="preset-list">
                {presets.map((preset, index) => {
                  const PresetIcon = [FileText, BookOpen, ClipboardCheck][index % 3];
                  return <article className="preset-card" key={preset.id}>
                    <div className="preset-card-icon"><PresetIcon size={19} /></div>
                    <div className="preset-card-copy"><h3>{preset.nome}</h3><p>{preset.descricao || "Padrão personalizado para seus materiais"}</p><span className="preset-tag">APLICADO A ROTEIROS, ATIVIDADES E PROVAS</span></div>
                    <button className={`toggle ${preset.ativo ? "toggle-on" : ""}`} role="switch" aria-checked={preset.ativo} aria-label={`Ativar ${preset.nome}`} onClick={() => togglePreset(preset.id, !preset.ativo)} disabled={isPending}><span /></button>
                  </article>;
                })}
              </div>
              <div className="add-preset-card">
                <div className="add-preset-copy"><h3>Crie seu próprio padrão</h3><p>Adicione uma regra que você costuma repetir ao preparar seus materiais.</p></div>
                <div className="add-preset-form"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPreset(); }} placeholder="Ex.: Questões no estilo ENADE" /><button className="button button-primary" onClick={addPreset} disabled={isPending}><Plus size={15} /> Salvar padrão</button></div>
              </div>
              <div className="preset-footnote"><FileCheck2 size={15} /> Os padrões ativos serão considerados ao preparar o próximo material.</div>
            </section>
          )}
        </div>
      </section>

      {managementOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManagementOpen(false); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="management-title">
          <div className="modal-topline"><span className="modal-icon"><GraduationCap size={18} /></span><button className="icon-button" aria-label="Fechar" onClick={() => setManagementOpen(false)}><X size={18} /></button></div>
          <span className="section-kicker">GESTÃO ACADÊMICA</span><h2 id="management-title">Adicionar matéria e turma</h2>
          <form action={createSubjectAndClass} className="onboarding-form modal-form">
            <label>Matéria<input name="materia" required placeholder="Ex.: Estrutura de Dados" /></label>
            <label>Turma<input name="turma" required placeholder="Ex.: Turma A — Noturno" /></label>
            <div className="form-row">
              <label>Ano letivo<input name="anoLetivo" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /></label>
              <label>Semestre<select name="semestre" defaultValue=""><option value="">Selecione</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}º semestre</option>)}</select></label>
            </div>
            <label>Turno<input name="turno" placeholder="Ex.: Noturno" /></label>
            <div className="modal-footer"><button type="button" className="button button-quiet" onClick={() => setManagementOpen(false)}>Cancelar</button><button className="button button-primary" disabled={isPending}><Plus size={15} /> Salvar</button></div>
          </form>
          <div className="management-divider"><span>OU</span></div>
          <h3 className="management-subheading">Adicionar turma a {subject.nome}</h3>
          <form action={async (formData) => {
            const className = String(formData.get("turmaExistente") ?? "");
            const semesterValue = String(formData.get("semestreExistente") ?? "");
            startTransition(async () => {
              const result = await criarTurma({
                materiaId: selectedSubjectRecord?.id ?? "",
                nome: className,
                semestre: semesterValue ? Number(semesterValue) : null,
                turno: String(formData.get("turnoExistente") ?? ""),
              });
              if (result.error || !result.data) {
                notify(result.error ?? "Não foi possível criar a turma.");
                return;
              }
              setManagementOpen(false);
              await refreshData(selectedSubjectRecord?.id, result.data.id);
              notify("Turma adicionada.");
            });
          }} className="onboarding-form modal-form">
            <label>Nome da turma<input name="turmaExistente" required placeholder="Ex.: Turma B — Matutino" /></label>
            <div className="form-row">
              <label>Semestre<select name="semestreExistente" defaultValue=""><option value="">Selecione</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}º semestre</option>)}</select></label>
              <label>Turno<input name="turnoExistente" placeholder="Ex.: Matutino" /></label>
            </div>
            <button className="button button-outline" disabled={isPending}><Plus size={15} /> Adicionar turma</button>
          </form>
          <p className="modal-disclaimer">O cadastro é salvo na sua conta do PréPrompto.</p>
        </section>
      </div>}
      {topicModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTopicModalOpen(false); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="topic-title">
          <div className="modal-topline"><span className="modal-icon"><List size={18} /></span><button className="icon-button" aria-label="Fechar" onClick={() => setTopicModalOpen(false)}><X size={18} /></button></div>
          <span className="section-kicker">EMENTA</span><h2 id="topic-title">Adicionar tópico</h2>
          <form action={createTopicFromForm} className="onboarding-form modal-form">
            <label>Ementa<select name="ementaId" required defaultValue={syllabus?.id ?? ""}>{appData.ementas.filter((item) => item.materia_id === subject.id).map((item) => <option key={item.id} value={item.id}>{item.titulo}</option>)}</select></label>
            <label>Nome do tópico<input name="titulo" required maxLength={200} placeholder="Ex.: Estruturas de dados lineares" /></label>
            <label>Descrição<textarea name="descricao" rows={3} placeholder="Habilidades ou observações (opcional)" /></label>
            <div className="modal-footer"><button type="button" className="button button-quiet" onClick={() => setTopicModalOpen(false)}>Cancelar</button><button className="button button-primary" disabled={isPending}><Plus size={15} /> Salvar tópico</button></div>
          </form>
        </section>
      </div>}
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title">
          <div className="modal-topline"><span className="modal-icon"><Sparkles size={18} /></span><button className="icon-button" aria-label="Fechar" onClick={() => setModalOpen(false)}><X size={18} /></button></div>
          <span className="section-kicker">ESTEIRA DE CRIAÇÃO</span><h2 id="generator-title">O que vamos preparar?</h2><p className="modal-description">Escolha o formato e a gente organiza um rascunho a partir da sua ementa.</p>
          <div className="artifact-options">
            {(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((option) => <button key={option} className={`artifact-option ${artifact === option ? "artifact-selected" : ""}`} onClick={() => setArtifact(option)}><span className="artifact-option-icon">{option === "Roteiro" ? <BookOpen size={18} /> : option === "Atividade" ? <FilePlus2 size={18} /> : <ClipboardCheck size={18} />}</span><span><strong>{option}</strong><small>{option === "Roteiro" ? "Plano de aula estruturado" : option === "Atividade" ? "Exercícios para praticar" : "Avaliação com gabarito"}</small></span>{artifact === option && <CheckCircle2 size={17} className="selected-check" />}</button>)}
          </div>
          <label className="form-label">TÓPICO DA EMENTA<select value={activeTopicId} onChange={(event) => setActiveTopicId(event.target.value)}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.titulo}</option>)}</select><ChevronDown size={15} /></label>
          <div className="modal-template"><div><span className="template-icon"><FileText size={16} /></span><span><strong>Padrão selecionado</strong><small>{presets.filter((preset) => preset.ativo).length} preferências serão aplicadas</small></span></div><button onClick={() => { setModalOpen(false); setScreen("presets"); }}>Editar</button></div>
          <div className="modal-footer"><button className="button button-quiet" onClick={() => setModalOpen(false)}>Cancelar</button><button className="button button-primary" onClick={generateArtifact} disabled={isPending}><Sparkles size={15} /> Salvar rascunho</button></div>
          <p className="modal-disclaimer">O rascunho será persistido; geração por IA ainda não está conectada.</p>
        </section>
      </div>}
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </main>
  );
}

function AuthScreen({ error, onLogin, onSignup }: {
  error: string;
  onLogin: (formData: FormData) => Promise<string | null>;
  onSignup: (formData: FormData) => Promise<string | null>;
}) {
  const [isSignup, setIsSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const result = await (isSignup ? onSignup(formData) : onLogin(formData));
    if (result) setMessage(result);
    setBusy(false);
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="brand auth-brand"><div className="brand-mark"><GraduationCap size={19} /></div><span>Pré<span className="brand-accent">Prompto</span></span></div>
      <span className="section-kicker">SEU ESPAÇO DE ENSINO</span>
      <h1>{isSignup ? "Crie sua conta" : "Bem-vindo de volta"}</h1>
      <p className="page-subtitle">{isSignup ? "Comece a organizar matérias, turmas e materiais em um só lugar." : "Entre para acessar seu planejamento e documentos."}</p>
      <form className="onboarding-form auth-form" onSubmit={handleSubmit}>
        {isSignup && <label>Nome completo<input name="nome" autoComplete="name" required maxLength={120} /></label>}
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label>Senha<input name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} required /></label>
        {(message || error) && <p className={`auth-message ${message.includes("Confirme") || message.includes("Cadastro iniciado") ? "auth-info" : ""}`} role="alert">{message || error}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? "Aguarde…" : isSignup ? "Criar conta" : "Entrar"}</button>
      </form>
      <button className="auth-switch" onClick={() => { setMessage(""); setIsSignup((current) => !current); }}>{isSignup ? "Já tem uma conta? Entrar" : "Primeiro acesso? Criar conta"}</button>
      <p className="auth-security"><CheckCircle2 size={14} /> Seus dados são isolados pela segurança do Supabase.</p>
    </section>
  </main>;
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

function StudioScreen({ topics, uploadedFile, fileInputRef, onFile, onGenerate, onOpenPresets, onExport, provas }: {
  topics: TopicRecord[];
  uploadedFile: string;
  provas: AppData["provas"];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: (topicId?: string, artifact?: Artifact) => void;
  onOpenPresets: () => void;
  onExport: (format: "PDF" | "DOCX") => void;
}) {
  const [selectedType, setSelectedType] = useState<Artifact>("Roteiro");
  const [selectedTopic, setSelectedTopic] = useState(topics[0]?.id ?? "");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionTopic, setCorrectionTopic] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);

  async function submitCorrection(formData: FormData) {
    setCorrectionBusy(true);
    setCorrectionMessage("");
    const result = await criarCorrecao(formData);
    setCorrectionMessage(result.error ?? "Resposta registrada para correção. A avaliação por IA ainda não está conectada.");
    setCorrectionBusy(false);
  }

  return <section className="studio-page">
    <div className="page-heading"><div><div className="heading-overline"><span className="heading-rule" /> DO CONTEÚDO AO MATERIAL</div><h1>Esteira de criação</h1><p className="page-subtitle">Monte materiais no seu formato, sem começar do zero.</p></div><span className="studio-step"><span>1</span> Escolha <i /> <span>2</span> Personalize <i /> <span>3</span> Exporte</span></div>
    <div className="studio-layout">
      <div className="studio-main">
        <div className="studio-card source-card">
          <div className="card-title-row"><div className="number-badge">01</div><div><span className="section-kicker">FONTE DE CONTEÚDO</span><h2>Comece pelo seu documento</h2></div><span className="ready-tag"><Check size={12} /> Documento pronto</span></div>
          <div className="source-file"><span className="source-file-icon"><FileText size={19} /></span><div><strong>{uploadedFile || "Nenhum documento selecionado"}</strong><span>{uploadedFile ? "Documento-base · PDF / DOCX / TXT" : "Adicione a ementa ou o conteúdo da aula"}</span></div><button className="button button-outline button-small" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Trocar arquivo</button></div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={onFile} />
        </div>

        <div className="studio-card create-card">
          <div className="card-title-row"><div className="number-badge">02</div><div><span className="section-kicker">NOVO MATERIAL</span><h2>O que você quer criar?</h2></div></div>
          <div className="create-type-grid">{(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((type) => <button key={type} className={`create-type ${selectedType === type ? "create-type-active" : ""}`} onClick={() => setSelectedType(type)}><span className="create-type-icon">{type === "Roteiro" ? <BookOpen size={20} /> : type === "Atividade" ? <FilePlus2 size={20} /> : <ClipboardCheck size={20} />}</span><strong>{type}</strong><span>{type === "Roteiro" ? "Plano de aula completo" : type === "Atividade" ? "Prática para a turma" : "Avaliação e gabarito"}</span>{selectedType === type && <CheckCircle2 size={16} className="type-check" />}</button>)}</div>
          <div className="form-row"><label className="form-label">TÓPICO DA EMENTA<select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.titulo}</option>)}</select><ChevronDown size={15} /></label><label className="form-label">LAYOUT DO MATERIAL<select defaultValue="Padrão escolar · 2 colunas"><option>Padrão escolar · 2 colunas</option><option>Folha de atividades</option><option>Plano de aula</option></select><ChevronDown size={15} /></label></div>
          <div className="presets-applied"><span className="applied-icon"><Settings2 size={15} /></span><span><strong>Seus pré-promptos ativos</strong><small>Aplicados ao próximo rascunho</small></span><button onClick={onOpenPresets}>Ver padrões <ArrowRight size={13} /></button></div>
          <div className="studio-submit"><span><Sparkles size={15} /> Pronto em poucos segundos</span><button className="button button-primary" onClick={() => onGenerate(selectedTopic, selectedType)}><Sparkles size={16} /> Preparar {selectedType.toLowerCase()} <ArrowRight size={15} /></button></div>
        </div>

        <div className="studio-card correction-card">
          <button className="correction-toggle" onClick={() => setCorrectionOpen((open) => !open)}><span className="correction-icon"><ClipboardCheck size={18} /></span><span className="correction-copy"><strong>Correção de prova</strong><small>Compare respostas com o gabarito e agilize a avaliação.</small></span><span className="correction-expand">{correctionOpen ? "Fechar" : "Abrir módulo"} <ChevronDown size={14} className={correctionOpen ? "chevron-up" : ""} /></span></button>
          {correctionOpen && <form action={submitCorrection} className="correction-body"><label className="form-label">PROVA<select name="artefatoId" value={correctionTopic} onChange={(event) => setCorrectionTopic(event.target.value)} required><option value="">Selecione uma prova criada</option>{provas.map((exam) => <option key={exam.id} value={exam.id}>{exam.titulo}</option>)}</select><ChevronDown size={15} /></label><label className="form-label">IDENTIFICAÇÃO DO ALUNO<input name="identificacaoAluno" placeholder="Nome ou código" /></label><label className="correction-upload"><Upload size={16} />Arquivo da resposta<input name="arquivo" type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" /></label><label className="form-label correction-answer">RESPOSTA DIGITADA<textarea name="textoResposta" rows={3} placeholder="Ou cole aqui a resposta do aluno" /></label><button className="button button-outline" disabled={correctionBusy || provas.length === 0}>{correctionBusy ? "Salvando…" : "Registrar resposta"} <ArrowRight size={14} /></button>{correctionMessage && <div className="correction-message" role="status">{correctionMessage}</div>}</form>}
        </div>
      </div>

      <aside className="studio-aside">
        <div className="preview-card"><div className="preview-top"><span className="section-kicker">VISUALIZAÇÃO</span><span className="preview-dots">•••</span></div>        <div className="paper"><div className="paper-brand"><span className="paper-logo"><GraduationCap size={15} /></span><span>INSTITUIÇÃO DE ENSINO<small>Material didático</small></span></div><div className="paper-line" /><span className="paper-label">{selectedType.toUpperCase()}</span><h3>{topics.find((topic) => topic.id === selectedTopic)?.titulo ?? "Selecione um tópico"}</h3><p>Objetivos de aprendizagem e conteúdos para a sua turma.</p><div className="paper-section-title" /><div className="paper-line wide" /><div className="paper-line" /><div className="paper-question"><b>01.</b><span>Questão ou etapa do material preparada para seus alunos...</span></div><div className="paper-question"><b>02.</b><span>Desenvolva e explique sua resposta.</span></div><div className="paper-columns"><i /><i /></div><span className="paper-footer">PréPrompto · 2026</span></div><div className="export-row"><button className="button button-outline" onClick={() => onExport("PDF")}><FileText size={15} /> Exportar PDF</button><button className="button button-outline" onClick={() => onExport("DOCX")}><FileCheck2 size={15} /> Exportar DOCX</button></div></div>
        <div className="tip-card"><span><Sparkles size={15} /></span><p><strong>Dica de professor</strong>Materiais em 2 colunas ajudam a economizar papel na hora de imprimir.</p></div>
      </aside>
    </div>
  </section>;
}
