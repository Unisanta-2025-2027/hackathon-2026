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
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import {
  alterarPrePrompto,
  carregarDados,
  cadastrar,
  criarCorrecao,
  gerarMaterialComIA,
  criarMateria,
  criarPrePrompto,
  salvarCabecalho,
  atualizarTopico,
  excluirEmenta,
  excluirTopico,
  excluirPrePrompto,
  entrar,
  enviarEmenta,
  alterarPrePromptoConteudo,
  sair,
  type AppData,
  type MaterialGerado,
  type SyllabusRecord,
  type TemplateRecord,
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
  const generationLockRef = useRef(false);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedHeaderId, setSelectedHeaderId] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [topicsAscending, setTopicsSorted] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [managementMode, setManagementMode] = useState<"materia" | null>(null);
  const [editingTopic, setEditingTopic] = useState<TopicRecord | null>(null);
  const [topicToDelete, setTopicToDelete] = useState<TopicRecord | null>(null);
  const [syllabusToDelete, setSyllabusToDelete] = useState<SyllabusRecord | null>(null);
  const [presetToDelete, setPresetToDelete] = useState<{ id: string; nome: string; cabecalho: boolean } | null>(null);
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact>("Roteiro");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [generatedMaterial, setGeneratedMaterial] = useState<MaterialGerado | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [examExportVersion, setExamExportVersion] = useState<"A" | "B">("A");
  const [toast, setToast] = useState("");
  const [presetName, setPresetName] = useState("");
  const [formError, setFormError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isUploadingSyllabus, setIsUploadingSyllabus] = useState(false);
  const [syllabusUploadError, setSyllabusUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(async (preferredSubjectId?: string) => {
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
        setSelectedHeaderId((current) =>
          result.data?.prePromptos.some((item) => item.id === current && item.materia_id === subjectId)
            ? current
            : result.data?.prePromptos.find((item) => item.materia_id === subjectId)?.id ?? "",
        );
        setSelectedTopicIds((current) => {
          const availableTopics = result.data?.topicos.filter((topic) => topic.materia_id === subjectId) ?? [];
          const availableIds = new Set(availableTopics.map((topic) => topic.id));
          const selected = current.filter((id) => availableIds.has(id));
          return selected.length ? selected : availableTopics[0] ? [availableTopics[0].id] : [];
        });
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
  const syllabus = subject?.ementa ?? null;
  const topics = useMemo(
    () => appData?.topicos.filter((topic) => topic.materia_id === selectedSubject) ?? [],
    [appData?.topicos, selectedSubject],
  );
  const activeTopic = topics.find((topic) => selectedTopicIds.includes(topic.id));
  const presets = appData?.prePromptos ?? [];
  const subjectHeaders = presets.filter((preset) => preset.materia_id === selectedSubject);
  const selectedHeader = subjectHeaders.find((preset) => preset.id === selectedHeaderId)
    ?? subjectHeaders[0];
  const uploadedFile = syllabus?.nome_arquivo ?? "";
  const syllabusExtractionError = syllabusUploadError || (syllabus?.situacao_extracao === "falhou" ? syllabus.erro_extracao ?? "A extração dos tópicos falhou." : null);
  const totals = useMemo(() => {
    let planned = 0;
    let activities = 0;
    let assessments = 0;
    let topicsInProgress = 0;
    for (const topic of topics) {
      if (topic.roteiro !== "Não iniciado") planned += 1;
      if (topic.atividade === "Feito") activities += 1;
      if (topic.prova === "Feito") assessments += 1;
      if (
        topic.roteiro !== "Não iniciado" ||
        topic.atividade !== "Não iniciado" ||
        topic.prova !== "Não iniciado"
      ) {
        topicsInProgress += 1;
      }
    }
    return {
      planned,
      activities,
      assessments,
      coverage: topics.length ? Math.round((topicsInProgress / topics.length) * 100) : 0,
    };
  }, [topics]);

  const visibleTopics = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return topics
      .filter((topic) => {
        const matchesQuery = topic.titulo.toLowerCase().includes(normalizedQuery);
        const completedArtifacts = [topic.roteiro, topic.atividade, topic.prova]
          .filter((status) => status === "Feito").length;
        const matchesFilter =
          filter === "Todos" ||
          (filter === "Em andamento" && completedArtifacts > 0 && completedArtifacts < 3) ||
          (filter === "Não iniciados" &&
            topic.roteiro === "Não iniciado" &&
            topic.atividade === "Não iniciado" &&
            topic.prova === "Não iniciado");
        return matchesQuery && matchesFilter;
      })
      .sort((left, right) =>
        topicsAscending ? left.titulo.localeCompare(right.titulo) : right.titulo.localeCompare(left.titulo),
      );
  }, [filter, query, topics, topicsAscending]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (isUploadingSyllabus) return;
    if (!file || !selectedSubject) {
      if (!selectedSubject) notify("Crie ou selecione uma matéria antes de enviar a ementa.");
      return;
    }
    setSyllabusUploadError("");
    const formData = new FormData();
    formData.set("arquivo", file);
    formData.set("materiaId", selectedSubject);
    formData.set("titulo", file.name);
    formData.set("anoLetivo", String(subject?.ano_letivo ?? new Date().getFullYear()));
    setIsUploadingSyllabus(true);
    startTransition(async () => {
      try {
        const result = await enviarEmenta(formData);
        if (result.error) {
          setSyllabusUploadError(result.error);
          return;
        }
        if (!result.data) {
          setSyllabusUploadError("O envio da ementa não retornou um resultado válido.");
          return;
        }
        await refreshData(selectedSubject);
        notify(
          result.data.aviso ??
            `Documento enviado e ${result.data.topicosCriados} tópicos identificados automaticamente.`,
        );
      } catch (error) {
        setSyllabusUploadError(error instanceof Error ? error.message : "Falha inesperada ao enviar a ementa.");
      } finally {
        setIsUploadingSyllabus(false);
      }
    });
  }

  function openGenerator(topicSelection?: string | string[], desiredArtifact?: Artifact) {
    if (!selectedSubject || !topics.length) {
      notify("Cadastre uma matéria e um tópico antes de preparar um material.");
      return;
    }
    const requestedIds = Array.isArray(topicSelection) ? topicSelection : topicSelection ? [topicSelection] : selectedTopicIds;
    const validIds = requestedIds.filter((id) => topics.some((item) => item.id === id));
    setSelectedTopicIds(validIds.length ? validIds : topics[0] ? [topics[0].id] : []);
    if (desiredArtifact) setArtifact(desiredArtifact);
    setGenerationError("");
    setModalOpen(true);
  }

  async function generateArtifact() {
    if (generationLockRef.current) return;
    const topicIds = selectedTopicIds.filter((id) => topics.some((topic) => topic.id === id));
    if (!topicIds.length || !subject) {
      notify("Selecione pelo menos um tópico válido da matéria.");
      return;
    }
    const artifactType = artifact === "Roteiro" ? "roteiro_aula" : artifact === "Atividade" ? "atividade" : "prova";
    const requiresHeader = artifactType !== "roteiro_aula";
    if (requiresHeader && !selectedHeader) {
      setGenerationError("Cadastre e selecione um cabeçalho desta matéria antes de gerar uma atividade ou prova.");
      return;
    }
    const activePreset = presets.find((preset) => !preset.materia_id && preset.ativo && preset.tipos_artefato.includes(artifactType));
    generationLockRef.current = true;
    setGenerationError("");
    setIsGenerating(true);
    startTransition(async () => {
      try {
        const result = await gerarMaterialComIA({
          materiaId: subject.id,
          topicoIds: topicIds,
          prePromptoId: activePreset?.id ?? null,
          cabecalhoId: requiresHeader ? selectedHeader.id : null,
          tipo: artifactType,
        });
        if (result.error || !result.data) {
          setGenerationError(result.error ?? "Não foi possível gerar o material. Tente novamente.");
          return;
        }
        setGeneratedMaterial(result.data);
        setModalOpen(false);
        await refreshData(subject.id);
        notify("Material pedagógico gerado e salvo.");
      } catch {
        setGenerationError("Ocorreu um erro inesperado ao gerar o material. Verifique sua conexão e tente novamente.");
      } finally {
        generationLockRef.current = false;
        setIsGenerating(false);
      }
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
      await refreshData(selectedSubject);
      notify("Pré-prompto salvo no banco.");
    });
  }

  async function updatePreset(id: string, formData: FormData) {
    const result = await alterarPrePromptoConteudo({
      id,
      nome: String(formData.get("nome") ?? ""),
      descricao: String(formData.get("descricao") ?? ""),
      instrucoesFixas: String(formData.get("instrucoesFixas") ?? ""),
    });
    if (result.error) {
      notify(result.error);
      return;
    }
    await refreshData(selectedSubject);
    notify("Pré-prompto atualizado.");
  }

  async function confirmDeletePreset() {
    if (!presetToDelete) return;
    startTransition(async () => {
      const result = await excluirPrePrompto(presetToDelete.id);
      if (result.error) {
        notify(result.error);
        return;
      }
      if (presetToDelete.cabecalho && selectedHeaderId === presetToDelete.id) setSelectedHeaderId("");
      if (presetToDelete.cabecalho && editingHeaderId === presetToDelete.id) setEditingHeaderId(null);
      const removedName = presetToDelete.nome;
      setPresetToDelete(null);
      await refreshData(selectedSubject);
      notify(`${presetToDelete.cabecalho ? "Cabeçalho" : "Pré-prompto"} “${removedName}” excluído.`);
    });
  }

  async function addHeader(formData: FormData) {
    if (!selectedSubject) return;
    const result = await salvarCabecalho({
      materiaId: selectedSubject,
      nome: String(formData.get("nome") ?? ""),
      nomeEscola: String(formData.get("nomeEscola") ?? ""),
      nomeProfessor: String(formData.get("nomeProfessor") ?? ""),
    });
    if (result.error) {
      notify(result.error);
      return;
    }
    if (!result.data) {
      notify("O cabeçalho não foi salvo.");
      return;
    }
    setSelectedHeaderId(result.data.id);
    await refreshData(selectedSubject);
    notify("Cabeçalho salvo para esta matéria.");
  }

  async function updateHeader(id: string, formData: FormData) {
    if (!selectedSubject) return;
    const result = await salvarCabecalho({
      id,
      materiaId: selectedSubject,
      nome: String(formData.get("nome") ?? ""),
      nomeEscola: String(formData.get("nomeEscola") ?? ""),
      nomeProfessor: String(formData.get("nomeProfessor") ?? ""),
    });
    if (result.error) {
      notify(result.error);
      return;
    }
    if (!result.data) {
      notify("O cabeçalho não foi atualizado.");
      return;
    }
    setEditingHeaderId(null);
    await refreshData(selectedSubject);
    notify("Cabeçalho atualizado.");
  }

  async function createSubjectOnly(formData: FormData) {
    const name = String(formData.get("materia") ?? "").trim();
    const year = Number(formData.get("anoLetivo"));
    if (!name || !Number.isInteger(year)) {
      notify("Informe o nome da matéria e um ano letivo válido.");
      return;
    }
    startTransition(async () => {
      const result = await criarMateria({ nome: name, anoLetivo: year });
      if (result.error || !result.data) {
        notify(result.error ?? "Não foi possível criar a matéria.");
        return;
      }
      setManagementMode(null);
      await refreshData(result.data.id);
      notify("Matéria criada.");
    });
  }

  async function editTopicFromForm(formData: FormData) {
    if (!editingTopic) return;
    const title = String(formData.get("titulo") ?? "");
    const description = String(formData.get("descricao") ?? "");
    const skillsText = String(formData.get("habilidades") ?? "");
    const habilidades = skillsText
      .split(/\r?\n/)
      .map((habilidade) => habilidade.trim())
      .filter(Boolean);
    startTransition(async () => {
      const result = await atualizarTopico({
        topicoId: editingTopic.id,
        titulo: title,
        descricao: description,
        habilidades,
      });
      if (result.error) {
        notify(result.error);
        return;
      }
      setEditingTopic(null);
      await refreshData(selectedSubject);
      notify("Tópico atualizado.");
    });
  }

  async function confirmDeleteTopic() {
    if (!topicToDelete) return;
    startTransition(async () => {
      const result = await excluirTopico(topicToDelete.id);
      if (result.error) {
        notify(result.error);
        return;
      }
      setTopicToDelete(null);
      await refreshData(selectedSubject);
      notify("Tópico excluído. Os materiais salvos continuam na biblioteca, sem vínculo com esse tópico.");
    });
  }

  async function confirmDeleteSyllabus() {
    if (!syllabusToDelete) return;
    startTransition(async () => {
      const result = await excluirEmenta(syllabusToDelete.id);
      if (result.error) {
        notify(result.error);
        return;
      }
      setSyllabusToDelete(null);
      setSyllabusUploadError("");
      await refreshData(selectedSubject);
      notify(result.data?.aviso ?? "Ementa, arquivo e tópicos vinculados excluídos.");
    });
  }

  async function togglePreset(id: string, active: boolean) {
    startTransition(async () => {
      const result = await alterarPrePrompto({ id, ativo: active });
      if (result.error) {
        notify(result.error);
        return;
      }
      await refreshData(selectedSubject);
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
      <p className="page-subtitle">Cadastre sua primeira matéria para o ano letivo e comece a guardar ementas, tópicos e materiais.</p>
      <form action={createSubjectOnly} className="onboarding-form">
        <label>Nome da matéria<input name="materia" required maxLength={160} placeholder="Ex.: Estrutura de Dados" /></label>
        <label>Ano letivo<input name="anoLetivo" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /></label>
        <button className="button button-primary" disabled={isPending}><Plus size={15} /> Criar matéria</button>
      </form>
      <button className="auth-signout" onClick={() => void sair().then(() => window.location.reload())}>Sair da conta</button>
    </div></main>;
  }

  if (!subject) {
    return <main className="auth-shell"><div className="auth-card"><p>Carregando matéria…</p></div></main>;
  }

  function exportDocument(format: "PDF" | "DOCX", includeTeacherNotes = false) {
    if (!generatedMaterial) {
      notify("Gere um material antes de exportar.");
      return;
    }
    let contentForExport = generatedMaterial.conteudo;
    let title = generatedMaterial.titulo;
    if (!includeTeacherNotes) {
      const studentContent = { ...generatedMaterial.conteudo };
      delete studentContent.gabaritoComentado;
      delete studentContent.rubrica;
      contentForExport = studentContent;
      if (generatedMaterial.tipo === "prova") {
        const versions = generatedMaterial.conteudo.versoes;
        const selectedVersion = versions && typeof versions === "object" && !Array.isArray(versions)
          ? (versions as Record<string, unknown>)[examExportVersion]
          : null;
        const versionContent = selectedVersion && typeof selectedVersion === "object" && !Array.isArray(selectedVersion)
          ? selectedVersion as Record<string, unknown>
          : null;
        if (!versionContent) {
          notify(`A versão ${examExportVersion} da prova não está disponível.`);
          return;
        }
        const examDetails = { ...studentContent };
        delete examDetails.versoes;
        delete examDetails.matrizAvaliacao;
        contentForExport = {
          ...examDetails,
          versao: examExportVersion,
          questoes: versionContent.questoes,
        };
        title = `${title} — Versão ${examExportVersion}`;
      }
    }
    const paragraphs = flattenMaterial(contentForExport);
    const filename = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
    const headerRows = [
      ...(generatedMaterial.tipo === "roteiro_aula" ? [] : [
        ["Instituição", generatedMaterial.cabecalho.instituicao || "________________________________"],
        ["Matéria", generatedMaterial.cabecalho.materia || "________________________________"],
        ["Professor(a)", generatedMaterial.cabecalho.professor || "________________________________"],
        ["Tópico(s)", generatedMaterial.cabecalho.topicos.join(", ")],
        ["Nome do aluno", "________________________________"],
        ["Data", "____/____/______"],
      ]),
    ];

    if (format === "PDF") {
      const printWindow = window.open("", "_blank", "width=900,height=720");
      if (!printWindow) {
        notify("Permita pop-ups para abrir a visualização de impressão em PDF.");
        return;
      }
      const body = paragraphs.map((paragraph) =>
        paragraph.heading
          ? `<h2>${escapeHtml(paragraph.text)}</h2>`
          : `<p>${escapeHtml(paragraph.text)}</p>`,
      ).join("");
      const header = headerRows.length ? `<header class="school-header">${headerRows.map(([label, value]) =>
        `<div class="header-field"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`,
      ).join("")}</header>` : "";
      printWindow.document.write(`<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#24242a;max-width:760px;margin:48px auto;line-height:1.55}.school-header{border:1px solid #777;padding:14px 16px;margin-bottom:22px}.header-field{min-height:23px}h1{font-size:23px;margin:20px 0 6px}h2{font-size:15px;margin-top:25px;color:#5146ac}p{margin:8px 0}.questions{columns:2;column-gap:28px}@media print{body{margin:20mm auto}}</style></head><body>${header}<h1>${escapeHtml(title)}</h1><div class="questions">${body}</div><script>window.onload=()=>window.print()</script></body></html>`);
      printWindow.document.close();
      notify("Visualização pronta. Escolha “Salvar como PDF” na janela de impressão.");
      return;
    }

    const xmlEscape = (value: string) => escapeHtml(value).replaceAll("&apos;", "&apos;");
    const documentParagraphs = [
      ...headerRows.map(([label, value]) => `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlEscape(label)}: </w:t></w:r><w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`),
      `<w:p/>`,
      `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`,
      ...paragraphs.map((paragraph) => `<w:p>${paragraph.heading ? `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlEscape(paragraph.text)}</w:t></w:r></w:p>`),
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
              setSyllabusUploadError("");
              setEditingHeaderId(null);
              const firstTopic = appData.topicos.find((item) => item.materia_id === id);
              setSelectedTopicIds(firstTopic ? [firstTopic.id] : []);
              setSelectedHeaderId(appData.prePromptos.find((item) => item.materia_id === id)?.id ?? "");
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
            <span className="year-chip"><span className="status-dot" /> Ano letivo {subject.ano_letivo}</span>
          </div>
        </header>

        <div className="content">
          {screen === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="heading-overline"><span className="heading-rule" /> SEU PLANEJAMENTO, EM UM SÓ LUGAR</div>
                  <h1>{subject.nome}</h1>
                  <p className="page-subtitle">Acompanhe seu plano de ensino e transforme cada tópico em material de aula.</p>
                </div>
                <div className="heading-actions">
                  <button className="button button-outline" onClick={() => setManagementMode("materia")}><Plus size={15} /> Nova matéria</button>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={handleFile} disabled={isUploadingSyllabus} />
              {syllabus ? <section className="overview-card syllabus-slot" aria-label="Ementa desta matéria">
                <span className="syllabus-file-icon"><FileText size={18} /></span>
                <div className="syllabus-slot-copy">
                  <strong>{syllabus.nome_arquivo ?? syllabus.titulo}</strong>
                  <small>{isUploadingSyllabus ? "Enviando e extraindo tópicos…" : syllabus.titulo}</small>
                </div>
                <span className={`syllabus-status ${syllabus.situacao_extracao === "concluido" ? "syllabus-status-ready" : syllabus.situacao_extracao === "falhou" ? "syllabus-status-failed" : ""}`}>
                  {isUploadingSyllabus ? "Processando" : syllabus.situacao_extracao === "concluido" ? "Tópicos extraídos" : syllabus.situacao_extracao === "falhou" ? "Falha na extração" : "Aguardando extração"}
                </span>
                <div className="syllabus-slot-actions">
                  <button className="button button-outline button-small" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSyllabus}><Upload size={14} /> {isUploadingSyllabus ? "Processando…" : "Substituir"}</button>
                  <button className="icon-button syllabus-delete-button" aria-label="Remover ementa" title="Remover ementa" onClick={() => setSyllabusToDelete(syllabus)} disabled={isPending || isUploadingSyllabus}><Trash2 size={16} /></button>
                </div>
                {syllabusExtractionError && <p className="syllabus-upload-error" role="alert">{syllabusExtractionError} Envie outro arquivo para tentar novamente.</p>}
              </section> : <div className="syllabus-empty">
                <button className="upload-strip" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSyllabus}>
                  <span className="upload-symbol"><CloudUpload size={21} /></span>
                  <span className="upload-copy"><strong>Adicionar ementa ou documento-base</strong><span>{isUploadingSyllabus ? "Enviando e identificando os tópicos com IA…" : "Selecione um PDF, DOCX ou TXT para armazenar na sua conta"}</span></span>
                  <span className="upload-action"><Upload size={14} /> {isUploadingSyllabus ? "Processando…" : "Selecionar arquivo"}</span>
                </button>
                {syllabusExtractionError && <p className="syllabus-upload-error" role="alert">{syllabusExtractionError} Escolha outro arquivo para tentar novamente.</p>}
              </div>}

              <section className="overview-card tracker-summary">
                <div className="section-heading summary-heading">
                  <div><span className="section-kicker">ACOMPANHAMENTO</span><h2>Ementa Tracker <span className="heading-separator">/</span> Cobertura da matéria</h2></div>
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
                    <thead><tr><th className="name-col">TÓPICO</th><th>ROTEIRO</th><th>ATIVIDADE</th><th>PROVA</th><th className="action-col">AÇÃO</th></tr></thead>
                    <tbody>
                      {visibleTopics.map((topic) => (
                        <tr key={topic.id}>
                          <td className="topic-name"><span className="number-cell">{String(topics.indexOf(topic) + 1).padStart(2, "0")}</span>{topic.titulo}</td>
                          <td><StatusPill status={topic.roteiro} /></td>
                          <td><StatusPill status={topic.atividade} /></td>
                          <td><StatusPill status={topic.prova} /></td>
                          <td><div className="topic-actions"><button className="generate-link" onClick={() => openGenerator(topic.id)}>Criar material <ArrowRight size={13} /></button><button className="icon-button topic-row-action" aria-label={`Editar tópico ${topic.titulo}`} title="Editar tópico" onClick={() => setEditingTopic(topic)}><Pencil size={15} /></button><button className="icon-button topic-row-action danger-action" aria-label={`Excluir tópico ${topic.titulo}`} title="Excluir tópico" onClick={() => setTopicToDelete(topic)}><Trash2 size={15} /></button></div></td>
                        </tr>
                      ))}
                      {visibleTopics.length === 0 && <tr><td colSpan={5} className="empty-state">{topics.length ? "Nenhum tópico encontrado. Tente mudar a busca ou o filtro." : "Envie um documento-base para identificar os tópicos automaticamente."}</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Exibindo <strong>{visibleTopics.length}</strong> de <strong>{topics.length}</strong> tópicos</span><div className="table-footer-actions"><button onClick={() => fileInputRef.current?.click()} className="text-link" disabled={isUploadingSyllabus}><Upload size={13} /> {syllabus ? "Substituir ementa" : "Enviar ementa"}</button><button onClick={() => openGenerator()} className="text-link">Criar material <ArrowRight size={14} /></button></div></div>
              </section>
              <div className="bottom-note"><Sparkles size={14} /> Um documento-base, vários materiais prontos para seus estudantes.</div>
            </>
          )}

          {screen === "studio" && (
            <StudioScreen
              topics={topics}
              selectedTopics={topics.filter((item) => selectedTopicIds.includes(item.id))}
              selectedTopicIds={selectedTopicIds}
              onSelectedTopics={setSelectedTopicIds}
              uploadedFile={uploadedFile}
              isUploadingSyllabus={isUploadingSyllabus}
              syllabusExtractionError={syllabusExtractionError}
              fileInputRef={fileInputRef}
              onFile={handleFile}
              onGenerate={openGenerator}
              onOpenPresets={() => setScreen("presets")}
              onExport={exportDocument}
              provas={appData.provas}
              headerPresets={subjectHeaders}
              selectedHeaderId={selectedHeader?.id ?? ""}
              hasSelectedHeader={Boolean(selectedHeader)}
              onSelectHeader={setSelectedHeaderId}
            />
          )}

          {screen === "presets" && (
            <section className="presets-page">
              <div className="page-heading">
                <div><div className="heading-overline"><span className="heading-rule" /> SEU JEITO DE ENSINAR</div><h1>Pré-promptos</h1><p className="page-subtitle">Salve suas preferências uma vez. Seus próximos materiais já começam do seu jeito.</p></div>
                <span className="saved-count"><Check size={15} /> {presets.filter((preset) => !preset.materia_id && preset.ativo).length} pré-promptos ativos</span>
              </div>
              <div className="preset-intro">
                <div className="preset-intro-icon"><Settings2 size={20} /></div>
                <div><h2>Seus padrões, sempre à mão</h2><p>Ative ou desative as preferências que devem ser aplicadas aos materiais gerados.</p></div>
                <span className="intro-decoration"><Sparkles size={42} /></span>
              </div>
              <div className="preset-list">
                {presets.filter((preset) => !preset.materia_id).map((preset, index) => {
                  const PresetIcon = [FileText, BookOpen, ClipboardCheck][index % 3];
                  return <article className="preset-card" key={preset.id}>
                    <div className="preset-card-heading">
                      <div className="preset-card-icon"><PresetIcon size={19} /></div>
                      <div className="preset-card-copy"><h3>{preset.nome}</h3><p>{preset.descricao || "Padrão personalizado para seus materiais"}</p><span className="preset-tag">APLICADO A ROTEIROS, ATIVIDADES E PROVAS</span></div>
                      <button className={`toggle ${preset.ativo ? "toggle-on" : ""}`} role="switch" aria-checked={preset.ativo} aria-label={`Ativar ${preset.nome}`} onClick={() => togglePreset(preset.id, !preset.ativo)} disabled={isPending}><span /></button>
                    </div>
                    <form action={async (formData) => updatePreset(preset.id, formData)} className="preset-edit-form">
                      <label>Nome<input name="nome" defaultValue={preset.nome} maxLength={120} required /></label>
                      <label>Descrição<input name="descricao" defaultValue={preset.descricao ?? ""} maxLength={500} /></label>
                      <label>Instruções fixas<textarea name="instrucoesFixas" rows={3} defaultValue={preset.instrucoes_fixas ?? ""} maxLength={4000} placeholder="Preferências que a IA deve seguir ao gerar os materiais" /></label>
                      <div className="preset-edit-actions"><button className="button button-outline button-small" disabled={isPending}><Check size={14} /> Salvar alterações</button><button type="button" className="button button-danger-outline button-small" onClick={() => setPresetToDelete({ id: preset.id, nome: preset.nome, cabecalho: false })}><Trash2 size={14} /> Excluir</button></div>
                    </form>
                  </article>;
                })}
              </div>
              <div className="add-preset-card">
                <div className="add-preset-copy"><h3>Crie seu próprio padrão</h3><p>Adicione uma regra que você costuma repetir ao preparar seus materiais.</p></div>
                <div className="add-preset-form"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPreset(); }} placeholder="Ex.: Questões no estilo ENADE" /><button className="button button-primary" onClick={addPreset} disabled={isPending}><Plus size={15} /> Salvar padrão</button></div>
              </div>
              <section className="header-presets">
                <div className="header-presets-heading">
                  <div><span className="section-kicker">PADRÕES POR MATÉRIA</span><h2>Cabeçalhos fixos</h2></div>
                  <span className="header-subject-name">{subject?.nome}</span>
                </div>
                <p className="page-subtitle">Escolha entre os cabeçalhos desta matéria ao criar uma atividade ou prova. Cada escola pode ter seu próprio padrão.</p>
                <div className="preset-list header-preset-list">
                  {subjectHeaders.map((headerPreset) => (
                    <article className={`header-preset-card ${editingHeaderId === headerPreset.id ? "header-preset-open" : ""}`} key={headerPreset.id}>
                      <div className="header-preset-title">
                        <div className="header-preset-summary"><h3>{headerPreset.nome}</h3><span className="header-institution-badge">{headerPreset.nome_escola || "Instituição não definida"}</span></div>
                        <div className="header-preset-actions">
                          <button type="button" className="button button-outline button-small" aria-expanded={editingHeaderId === headerPreset.id} onClick={() => setEditingHeaderId((current) => current === headerPreset.id ? null : headerPreset.id)}><Pencil size={13} /> {editingHeaderId === headerPreset.id ? "Fechar" : "Editar"}</button>
                          <button type="button" className="button button-danger-outline button-small" onClick={() => setPresetToDelete({ id: headerPreset.id, nome: headerPreset.nome, cabecalho: true })}><Trash2 size={14} /> Excluir</button>
                        </div>
                      </div>
                      {editingHeaderId === headerPreset.id && <form action={async (formData) => updateHeader(headerPreset.id, formData)} className="header-edit-form">
                          <label>Nome do padrão<input name="nome" defaultValue={headerPreset.nome} maxLength={120} required /></label>
                          <div className="form-row">
                            <label>Instituição<input name="nomeEscola" defaultValue={headerPreset.nome_escola ?? ""} maxLength={160} placeholder="Nome da escola/faculdade" /></label>
                            <label>Professor(a)<input name="nomeProfessor" defaultValue={headerPreset.nome_professor ?? appData.professor.nome_completo} maxLength={160} placeholder="Nome do professor" /></label>
                          </div>
                          <div className="header-fields-preview" aria-label="Pré-visualização da impressão">
                            <strong>Pré-visualização da impressão</strong>
                            <span>{headerPreset.nome_escola || "Instituição"}</span><span>Matéria: {subject?.nome}</span><span>{headerPreset.nome_professor || appData.professor.nome_completo}</span>
                            <span>Nome do aluno: ____________________</span><span>Data: ____/____/______</span>
                          </div>
                          <div className="header-edit-actions"><button type="button" className="button button-quiet button-small" onClick={() => setEditingHeaderId(null)} disabled={isPending}>Cancelar</button><button className="button button-primary button-small" disabled={isPending}><Check size={14} /> {isPending ? "Salvando…" : "Salvar cabeçalho"}</button></div>
                        </form>}
                    </article>
                  ))}
                  {subjectHeaders.length === 0 && <p className="empty-state header-empty-state">Envie um documento-base desta matéria para criar o primeiro cabeçalho automaticamente, ou cadastre um abaixo.</p>}
                </div>
                <form action={addHeader} className="add-header-card">
                  <h3>Adicionar cabeçalho para outra escola</h3>
                  <div className="header-create-fields">
                    <label>Nome do padrão<input name="nome" defaultValue={`Cabeçalho — ${subject?.nome ?? ""}`} maxLength={120} required /></label>
                    <label>Instituição<input name="nomeEscola" maxLength={160} placeholder="Ex.: ETEC / Faculdade XYZ" /></label>
                    <label>Professor(a)<input name="nomeProfessor" defaultValue={appData.professor.nome_completo} maxLength={160} placeholder="Nome do professor" /></label>
                    <button className="button button-primary" disabled={isPending}><Plus size={15} /> Adicionar</button>
                  </div>
                  <p>Nome do aluno e data permanecem em branco para preenchimento manual na aplicação da atividade ou prova.</p>
                </form>
              </section>
              <div className="preset-footnote"><FileCheck2 size={15} /> Os pré-promptos ativos serão aplicados automaticamente; cabeçalhos são escolhidos por material.</div>
            </section>
          )}
        </div>
      </section>

      {editingTopic && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isPending && event.target === event.currentTarget) setEditingTopic(null); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="edit-topic-title">
          <div className="modal-topline"><span className="modal-icon"><Pencil size={17} /></span><button className="icon-button" aria-label="Fechar edição" onClick={() => setEditingTopic(null)} disabled={isPending}><X size={18} /></button></div>
          <span className="section-kicker">CONTEÚDO PROGRAMÁTICO</span><h2 id="edit-topic-title">Editar tópico</h2>
          <form action={editTopicFromForm} className="onboarding-form modal-form">
            <label>Nome do tópico<input name="titulo" required maxLength={200} defaultValue={editingTopic.titulo} /></label>
            <label>Descrição<textarea name="descricao" rows={3} maxLength={2000} defaultValue={editingTopic.descricao ?? ""} /></label>
            <label>Habilidades <span className="field-hint">Uma habilidade por linha, até 12.</span><textarea name="habilidades" rows={4} maxLength={3600} defaultValue={editingTopic.habilidades.join("\n")} /></label>
            <div className="modal-footer"><button type="button" className="button button-quiet" onClick={() => setEditingTopic(null)} disabled={isPending}>Cancelar</button><button className="button button-primary" disabled={isPending}><Check size={15} /> {isPending ? "Salvando…" : "Salvar alterações"}</button></div>
          </form>
        </section>
      </div>}
      {topicToDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isPending && event.target === event.currentTarget) setTopicToDelete(null); }}>
        <section className="generator-modal confirm-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-topic-title">
          <div className="modal-topline"><span className="modal-icon delete-modal-icon"><Trash2 size={17} /></span><button className="icon-button" aria-label="Fechar confirmação" onClick={() => setTopicToDelete(null)} disabled={isPending}><X size={18} /></button></div>
          <span className="section-kicker">EXCLUIR CONTEÚDO</span><h2 id="delete-topic-title">Excluir tópico?</h2>
          <p className="modal-description">O tópico <strong>{topicToDelete.titulo}</strong> será removido da ementa. Materiais já gerados permanecerão salvos, mas deixarão de estar vinculados a ele.</p>
          <div className="modal-footer"><button className="button button-quiet" onClick={() => setTopicToDelete(null)} disabled={isPending}>Cancelar</button><button className="button button-danger" onClick={confirmDeleteTopic} disabled={isPending}><Trash2 size={15} /> {isPending ? "Excluindo…" : "Excluir tópico"}</button></div>
        </section>
      </div>}
      {syllabusToDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isPending && event.target === event.currentTarget) setSyllabusToDelete(null); }}>
        <section className="generator-modal confirm-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-syllabus-title">
          <div className="modal-topline"><span className="modal-icon delete-modal-icon"><Trash2 size={17} /></span><button className="icon-button" aria-label="Fechar confirmação" onClick={() => setSyllabusToDelete(null)} disabled={isPending}><X size={18} /></button></div>
          <span className="section-kicker">EXCLUIR DOCUMENTO-BASE</span><h2 id="delete-syllabus-title">Excluir esta ementa?</h2>
          <p className="modal-description"><strong>{syllabusToDelete.titulo}</strong>{syllabusToDelete.nome_arquivo ? ` (${syllabusToDelete.nome_arquivo})` : ""} e os {appData.topicos.filter((topic) => topic.ementa_id === syllabusToDelete.id).length} tópico(s) vinculados serão excluídos. O arquivo associado será removido, se houver. Materiais gerados ficam salvos, sem vínculo com os tópicos excluídos.</p>
          <div className="modal-footer"><button className="button button-quiet" onClick={() => setSyllabusToDelete(null)} disabled={isPending}>Cancelar</button><button className="button button-danger" onClick={confirmDeleteSyllabus} disabled={isPending}><Trash2 size={15} /> {isPending ? "Excluindo…" : "Excluir ementa"}</button></div>
        </section>
      </div>}
      {presetToDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isPending && event.target === event.currentTarget) setPresetToDelete(null); }}>
        <section className="generator-modal confirm-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-preset-title">
          <div className="modal-topline"><span className="modal-icon delete-modal-icon"><Trash2 size={17} /></span><button className="icon-button" aria-label="Fechar confirmação" onClick={() => setPresetToDelete(null)} disabled={isPending}><X size={18} /></button></div>
          <span className="section-kicker">EXCLUIR PADRÃO</span><h2 id="delete-preset-title">Excluir {presetToDelete.cabecalho ? "cabeçalho fixo" : "pré-prompto"}?</h2>
          <p className="modal-description">O padrão <strong>{presetToDelete.nome}</strong> será excluído. Os materiais já gerados continuarão salvos com a cópia das preferências usada na geração.</p>
          <div className="modal-footer"><button className="button button-quiet" onClick={() => setPresetToDelete(null)} disabled={isPending}>Cancelar</button><button className="button button-danger" onClick={confirmDeletePreset} disabled={isPending}><Trash2 size={15} /> {isPending ? "Excluindo…" : "Excluir padrão"}</button></div>
        </section>
      </div>}
      {managementMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManagementMode(null); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="management-title">
          <div className="modal-topline"><span className="modal-icon"><GraduationCap size={18} /></span><button className="icon-button" aria-label="Fechar" onClick={() => setManagementMode(null)}><X size={18} /></button></div>
          <span className="section-kicker">MATÉRIA</span>
          <>
            <h2 id="management-title">Nova matéria</h2>
            <p className="modal-description">Cadastre uma matéria para o ano letivo.</p>
            <form action={createSubjectOnly} className="onboarding-form modal-form">
              <label>Nome da matéria<input name="materia" required maxLength={160} placeholder="Ex.: Estrutura de Dados" /></label>
              <label>Ano letivo<input name="anoLetivo" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /></label>
              <div className="modal-footer"><button type="button" className="button button-quiet" onClick={() => setManagementMode(null)}>Cancelar</button><button className="button button-primary" disabled={isPending}><Plus size={15} /> Criar matéria</button></div>
            </form>
          </>
          <p className="modal-disclaimer">O cadastro é salvo na sua conta do PréPrompto.</p>
        </section>
      </div>}
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!isGenerating && event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title">
          <div className="modal-topline"><span className="modal-icon"><Sparkles size={18} /></span><button className="icon-button" aria-label={isGenerating ? "Geração em andamento" : "Fechar"} onClick={() => { if (!isGenerating) setModalOpen(false); }} disabled={isGenerating}><X size={18} /></button></div>
          {!isGenerating ? <>
            <span className="section-kicker">ESTEIRA DE CRIAÇÃO</span><h2 id="generator-title">Gerar material com IA</h2><p className="modal-description">A IA combinará o tópico, a ementa e suas preferências para criar um material completo.</p>
            <div className="artifact-options">
              {(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((option) => <button key={option} className={`artifact-option ${artifact === option ? "artifact-selected" : ""}`} onClick={() => setArtifact(option)}><span className="artifact-option-icon">{option === "Roteiro" ? <BookOpen size={18} /> : option === "Atividade" ? <FilePlus2 size={18} /> : <ClipboardCheck size={18} />}</span><span><strong>{option}</strong><small>{option === "Roteiro" ? "Plano de aula estruturado" : option === "Atividade" ? "Exercícios para praticar" : "Avaliação com gabarito"}</small></span>{artifact === option && <CheckCircle2 size={17} className="selected-check" />}</button>)}
            </div>
            <TopicSelectionList topics={topics} selectedTopicIds={selectedTopicIds} onSelectedTopics={setSelectedTopicIds} disabled={isGenerating} />
            {artifact === "Roteiro" ? <p className="header-not-required">Roteiros de aula não utilizam cabeçalho.</p> : <div className="generator-header-setting"><label className="form-label">CABEÇALHO<select required value={selectedHeader?.id ?? ""} onChange={(event) => setSelectedHeaderId(event.target.value)}><option value="">Selecione um cabeçalho</option>{subjectHeaders.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.nome_escola ? ` · ${item.nome_escola}` : ""}</option>)}</select><ChevronDown size={15} /></label>{!subjectHeaders.length && <small className="header-select-hint">Cadastre um cabeçalho em Pré-promptos para continuar.</small>}</div>}
            <div className="modal-template"><div><span className="template-icon"><FileText size={16} /></span><span><strong>Padrões selecionados</strong><small>{presets.filter((preset) => !preset.materia_id && preset.ativo).length} preferências serão aplicadas</small></span></div><button onClick={() => { setModalOpen(false); setScreen("presets"); }}>Editar</button></div>
            {generationError && <p className="generation-error" role="alert">{generationError}</p>}
            <div className="modal-footer"><button className="button button-quiet" onClick={() => setModalOpen(false)} disabled={isPending}>Cancelar</button><button className="button button-primary" onClick={generateArtifact} disabled={isPending || (artifact !== "Roteiro" && !selectedHeader)}><Sparkles size={15} /> {isPending ? "Preparando…" : "Gerar material"}</button></div>
            <p className="modal-disclaimer">O conteúdo gerado será salvo no seu histórico e poderá ser exportado em PDF ou DOCX.</p>
          </> : <div className="generation-panel" aria-live="polite">
            <span className="section-kicker">GERAÇÃO EM ANDAMENTO</span>
            <h2 id="generator-title">Estamos criando seu material</h2>
            <p className="generation-description">A IA está analisando os tópicos e preparando um conteúdo alinhado à matéria. Materiais completos podem levar alguns instantes.</p>
            <div className="generation-progress" role="progressbar" aria-label="Geração do material em andamento" aria-valuetext="Aguarde enquanto o material é gerado">
              <span />
            </div>
            <ElapsedTimer />
            <div className="generation-steps">
              <span><b>01</b> Leitura do tópico e das preferências</span>
              <span><b>02</b> Elaboração do material pedagógico</span>
              <span><b>03</b> Validação e salvamento na biblioteca</span>
            </div>
            <p className="modal-disclaimer">Mantenha esta janela aberta. Avisaremos assim que o material estiver pronto.</p>
          </div>}
        </section>
      </div>}
      {generatedMaterial && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGeneratedMaterial(null); }}>
        <section className="generated-modal" role="dialog" aria-modal="true" aria-labelledby="generated-title">
          <div className="modal-topline"><span className="modal-icon"><CheckCircle2 size={18} /></span><button className="icon-button" aria-label="Fechar material" onClick={() => setGeneratedMaterial(null)}><X size={18} /></button></div>
          <span className="section-kicker">MATERIAL GERADO E SALVO</span>
          <h2 id="generated-title">{generatedMaterial.titulo}</h2>
          {(generatedMaterial.tipo === "prova" || generatedMaterial.tipo === "atividade") && <p className="teacher-key-notice">Gabarito e critérios aparecem somente nesta prévia. A exportação padrão é a versão do estudante.</p>}
          {generatedMaterial.tipo === "prova" && <label className="exam-version-select">VERSÃO PARA EXPORTAR<select value={examExportVersion} onChange={(event) => setExamExportVersion(event.target.value as "A" | "B")}><option value="A">Versão A — estudante</option><option value="B">Versão B — estudante</option></select></label>}
          <div className="generated-preview">{Object.entries(generatedMaterial.conteudo).map(([key, value]) =>
            <GeneratedSection key={key} name={key} value={value} />,
          )}</div>
          <div className="modal-footer">
            <button className="button button-quiet" onClick={() => setGeneratedMaterial(null)}>Fechar</button>
            {(generatedMaterial.tipo === "prova" || generatedMaterial.tipo === "atividade") && <button className="button button-outline" onClick={() => exportDocument("DOCX", true)}><FileCheck2 size={15} /> DOCX professor</button>}
            <button className="button button-outline" onClick={() => exportDocument("DOCX")}><FileCheck2 size={15} /> DOCX aluno</button>
            <button className="button button-primary" onClick={() => exportDocument("PDF")}><FileText size={15} /> PDF aluno</button>
          </div>
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
      <p className="page-subtitle">{isSignup ? "Comece a organizar matérias e materiais em um só lugar." : "Entre para acessar seu planejamento e documentos."}</p>
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

function ElapsedTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <p className="generation-elapsed">Tempo decorrido: <strong>{formatElapsedTime(elapsedSeconds)}</strong></p>;
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

function fieldLabel(value: string) {
  const spaced = value.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ");
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes ? `${minutes} min ${String(remainingSeconds).padStart(2, "0")} s` : `${remainingSeconds} s`;
}

function flattenMaterial(content: Record<string, unknown>) {
  const paragraphs: { text: string; heading: boolean }[] = [];
  function visit(value: unknown, label: string, depth: number) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${label} ${index + 1}`, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      paragraphs.push({ text: `${"  ".repeat(Math.min(depth, 4))}${fieldLabel(label)}`, heading: true });
      for (const [key, item] of Object.entries(record)) visit(item, key, depth + 1);
      return;
    }
    if (value !== null && value !== undefined && value !== "") {
      const text = typeof value === "string" ? value : String(value);
      paragraphs.push({ text: `${"  ".repeat(Math.min(depth, 4))}${fieldLabel(label)}: ${text}`, heading: false });
    }
  }
  for (const [key, value] of Object.entries(content)) visit(value, key, 0);
  return paragraphs;
}

function GeneratedSection({ name, value }: { name: string; value: unknown }) {
  return <section className="generated-section">
    <h3>{fieldLabel(name)}</h3>
    <GeneratedValue value={value} />
  </section>;
}

function GeneratedValue({ value }: { value: unknown }): React.ReactNode {
  if (Array.isArray(value)) {
    return <div className="generated-list">{value.map((item, index) =>
      <div className="generated-item" key={index}><span className="generated-item-number">{String(index + 1).padStart(2, "0")}</span><GeneratedValue value={item} /></div>,
    )}</div>;
  }
  if (value && typeof value === "object") {
    return <div className="generated-object">{Object.entries(value as Record<string, unknown>).map(([key, item]) =>
      <div className="generated-field" key={key}><strong>{fieldLabel(key)}</strong><GeneratedValue value={item} /></div>,
    )}</div>;
  }
  return <p className="generated-text">{value === null || value === undefined ? "—" : String(value)}</p>;
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

function TopicSelectionList({ topics, selectedTopicIds, onSelectedTopics, disabled = false }: {
  topics: TopicRecord[];
  selectedTopicIds: string[];
  onSelectedTopics: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return <fieldset className="topic-selection">
    <legend>TÓPICOS DA EMENTA</legend>
    <div className="topic-selection-list">
      {topics.length ? topics.map((topic) => (
        <label key={topic.id} className="topic-selection-option">
          <input
            type="checkbox"
            checked={selectedTopicIds.includes(topic.id)}
            disabled={disabled}
            onChange={(event) => onSelectedTopics(
              event.target.checked
                ? [...selectedTopicIds, topic.id]
                : selectedTopicIds.filter((id) => id !== topic.id),
            )}
          />
          <span>{topic.titulo}</span>
        </label>
      )) : <span className="topic-selection-empty">Nenhum tópico disponível nesta matéria.</span>}
    </div>
    <span className="topic-selection-count">{selectedTopicIds.length} tópico(s) selecionado(s)</span>
  </fieldset>;
}

function StudioScreen({ topics, selectedTopics, selectedTopicIds, onSelectedTopics, uploadedFile, isUploadingSyllabus, syllabusExtractionError, fileInputRef, onFile, onGenerate, onOpenPresets, onExport, provas, headerPresets, selectedHeaderId, hasSelectedHeader, onSelectHeader }: {
  topics: TopicRecord[];
  selectedTopics: TopicRecord[];
  selectedTopicIds: string[];
  onSelectedTopics: (ids: string[]) => void;
  uploadedFile: string;
  isUploadingSyllabus: boolean;
  syllabusExtractionError: string | null;
  provas: AppData["provas"];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: (topicIds: string[], artifact?: Artifact) => void;
  onOpenPresets: () => void;
  onExport: (format: "PDF" | "DOCX", includeTeacherNotes?: boolean) => void;
  headerPresets: TemplateRecord[];
  selectedHeaderId: string;
  hasSelectedHeader: boolean;
  onSelectHeader: (id: string) => void;
}) {
  const [selectedType, setSelectedType] = useState<Artifact>("Roteiro");
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
          <div className="card-title-row"><div className="number-badge">01</div><div><span className="section-kicker">FONTE DE CONTEÚDO</span><h2>Comece pelo seu documento</h2></div><span className="ready-tag">{uploadedFile ? <><Check size={12} /> Documento pronto</> : "Documento opcional"}</span></div>
          <div className="source-file"><span className="source-file-icon"><FileText size={19} /></span><div><strong>{uploadedFile || "Nenhum documento selecionado"}</strong><span>{isUploadingSyllabus ? "Enviando e extraindo tópicos com IA…" : syllabusExtractionError ?? (uploadedFile ? "Documento-base · PDF / DOCX / TXT" : "Adicione a ementa ou o conteúdo da aula")}</span></div><button className="button button-outline button-small" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSyllabus}><Upload size={14} /> {isUploadingSyllabus ? "Processando…" : "Trocar arquivo"}</button></div>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={onFile} disabled={isUploadingSyllabus} />
        </div>

        <div className="studio-card create-card">
          <div className="card-title-row"><div className="number-badge">02</div><div><span className="section-kicker">NOVO MATERIAL</span><h2>O que você quer criar?</h2></div></div>
          <div className="create-type-grid">{(["Roteiro", "Atividade", "Prova"] as Artifact[]).map((type) => <button key={type} className={`create-type ${selectedType === type ? "create-type-active" : ""}`} onClick={() => setSelectedType(type)}><span className="create-type-icon">{type === "Roteiro" ? <BookOpen size={20} /> : type === "Atividade" ? <FilePlus2 size={20} /> : <ClipboardCheck size={20} />}</span><strong>{type}</strong><span>{type === "Roteiro" ? "Plano de aula completo" : type === "Atividade" ? "Prática para a turma" : "Avaliação e gabarito"}</span>{selectedType === type && <CheckCircle2 size={16} className="type-check" />}</button>)}</div>
          <div className="studio-topic-layout"><TopicSelectionList topics={topics} selectedTopicIds={selectedTopicIds} onSelectedTopics={onSelectedTopics} disabled={topics.length === 0} /></div>
          <div className="presets-applied"><span className="applied-icon"><Settings2 size={15} /></span><span><strong>Seus pré-promptos ativos</strong><small>Preferências aplicáveis incorporadas ao material</small></span><button onClick={onOpenPresets}>Ver padrões <ArrowRight size={13} /></button></div>
          <div className="studio-submit"><span><Sparkles size={15} /> Plano pedagógico pronto em poucos segundos</span><button className="button button-primary" onClick={() => onGenerate(selectedTopicIds, selectedType)} disabled={!selectedTopicIds.length || (selectedType !== "Roteiro" && !hasSelectedHeader)}><Sparkles size={16} /> Gerar {selectedType.toLowerCase()} <ArrowRight size={15} /></button></div>
        </div>

        <div className="studio-card correction-card">
          <button className="correction-toggle" onClick={() => setCorrectionOpen((open) => !open)}><span className="correction-icon"><ClipboardCheck size={18} /></span><span className="correction-copy"><strong>Correção de prova</strong><small>Compare respostas com o gabarito e agilize a avaliação.</small></span><span className="correction-expand">{correctionOpen ? "Fechar" : "Abrir módulo"} <ChevronDown size={14} className={correctionOpen ? "chevron-up" : ""} /></span></button>
          {correctionOpen && <form action={submitCorrection} className="correction-body"><label className="form-label">PROVA<select name="artefatoId" value={correctionTopic} onChange={(event) => setCorrectionTopic(event.target.value)} required><option value="">Selecione uma prova criada</option>{provas.map((exam) => <option key={exam.id} value={exam.id}>{exam.titulo}</option>)}</select><ChevronDown size={15} /></label><label className="form-label">IDENTIFICAÇÃO DO ALUNO<input name="identificacaoAluno" placeholder="Nome ou código" /></label><label className="correction-upload"><Upload size={16} />Arquivo da resposta<input name="arquivo" type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" /></label><label className="form-label correction-answer">RESPOSTA DIGITADA<textarea name="textoResposta" rows={3} placeholder="Ou cole aqui a resposta do aluno" /></label><button className="button button-outline" disabled={correctionBusy || provas.length === 0}>{correctionBusy ? "Salvando…" : "Registrar resposta"} <ArrowRight size={14} /></button>{correctionMessage && <div className="correction-message" role="status">{correctionMessage}</div>}</form>}
        </div>
      </div>

      <aside className="studio-aside">
        <div className="studio-settings">
          <label className="form-label">LAYOUT DO MATERIAL<select defaultValue="Padrão escolar · 2 colunas"><option>Padrão escolar · 2 colunas</option><option>Folha de atividades</option><option>Plano de aula</option></select><ChevronDown size={15} /></label>
          {selectedType === "Roteiro" ? <p className="header-not-required">Roteiros de aula não utilizam cabeçalho.</p> : <div className="studio-header-setting">
            <label className="form-label">CABEÇALHO<select required value={selectedHeaderId} onChange={(event) => onSelectHeader(event.target.value)}><option value="">Selecione um cabeçalho</option>{headerPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.nome}{preset.nome_escola ? ` · ${preset.nome_escola}` : ""}</option>)}</select><ChevronDown size={15} /></label>
            {!hasSelectedHeader && <small className="header-select-hint">Cadastre um cabeçalho em Pré-promptos para gerar atividades ou provas.</small>}
          </div>}
        </div>
        <div className="preview-card"><div className="preview-top"><span className="section-kicker">VISUALIZAÇÃO</span><span className="preview-dots">•••</span></div>        <div className="paper">{selectedType !== "Roteiro" && <><div className="paper-brand"><span className="paper-logo"><GraduationCap size={15} /></span><span>INSTITUIÇÃO DE ENSINO<small>Material didático</small></span></div><div className="paper-line" /></>}<span className="paper-label">{selectedType.toUpperCase()}</span><h3>{selectedTopics.length ? selectedTopics.map((topic) => topic.titulo).join(", ") : "Selecione um ou mais tópicos"}</h3><p>Objetivos de aprendizagem e conteúdos para a sua turma.</p><div className="paper-section-title" /><div className="paper-line wide" /><div className="paper-line" /><div className="paper-question"><b>01.</b><span>Questão ou etapa do material preparada para seus alunos...</span></div><div className="paper-question"><b>02.</b><span>Desenvolva e explique sua resposta.</span></div><div className="paper-columns"><i /><i /></div><span className="paper-footer">PréPrompto · 2026</span></div><div className="export-row"><button className="button button-outline" onClick={() => onExport("PDF")}><FileText size={15} /> Exportar PDF</button><button className="button button-outline" onClick={() => onExport("DOCX")}><FileCheck2 size={15} /> Exportar DOCX</button></div></div>
        <div className="tip-card"><span><Sparkles size={15} /></span><p><strong>Dica de professor</strong>Materiais em 2 colunas ajudam a economizar papel na hora de imprimir.</p></div>
      </aside>
    </div>
  </section>;
}
