"use client";
import { FormEvent, useEffect, useState } from "react";
import "./result.css";
import {
  api,
  auth,
  AnalyzerResult,
  Dashboard,
  Deployment,
  DeploymentPlan,
  EnvironmentVariable,
  GitConnection,
  Monitoring,
  Project,
  ProjectService,
  Runtime,
  Server,
  slugify,
  streamDeployment,
} from "../lib/api";

type View =
  | "dashboard"
  | "projects"
  | "deployments"
  | "monitoring"
  | "git"
  | "servers"
  | "logs"
  | "settings"
  | "new"
  | "project"
  | "deployment-result";
const nav: [View, string, string][] = [
  ["dashboard", "⌂", "Дашборд"],
  ["projects", "▣", "Проекты"],
  ["deployments", "↻", "Deployments"],
  ["monitoring", "⌁", "Мониторинг"],
  ["git", "⌘", "Git Sources"],
  ["servers", "▤", "Серверы"],
  ["logs", "≡", "Логи"],
  ["settings", "⚙", "Настройки"],
];
const runtime: Record<Runtime, string> = {
  NODE: "Node.js",
  SPRING_BOOT: "Spring Boot",
  PYTHON: "Python",
  GO: "Go",
  DOTNET: ".NET",
  DOCKERFILE: "Dockerfile",
};
const blank = {
  name: "",
  slug: "",
  repositoryUrl: "",
  branch: "main",
  runtime: "DOCKERFILE" as Runtime,
  applicationPort: 3000,
  publicPort: 0,
  healthPath: "/",
  domain: "",
  autoDeploy: true,
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard"),
    [projects, setProjects] = useState<Project[]>([]),
    [deployments, setDeployments] = useState<Deployment[]>([]),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [metrics, setMetrics] = useState<Monitoring | null>(null),
    [servers, setServers] = useState<Server[]>([]),
    [connections, setConnections] = useState<GitConnection[]>([]),
    [active, setActive] = useState<Project | null>(null),
    [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(
      null,
    ),
    [notice, setNotice] = useState("Загрузка данных…"),
    [token, setToken] = useState<string>("");
  async function load() {
    try {
      const [p, d, db, m, s, c] = await Promise.all([
        api.projects(),
        api.deployments(),
        api.dashboard(),
        api.monitoring(),
        api.servers(),
        api.connections(),
      ]);
      setProjects(p);
      setDeployments(d);
      setDashboard(db);
      setMetrics(m);
      setServers(s);
      setConnections(c);
      setActive((x) =>
        x ? (p.find((q) => q.id === x.id) ?? p[0] ?? null) : (p[0] ?? null),
      );
      setNotice("Все системы работают нормально");
    } catch (e) {
      const message = e instanceof Error ? e.message : "API недоступен";
      if (message.includes("(401)") || message.includes("(403)")) {
        auth.clear();
        setToken("");
        return;
      }
      setNotice(message);
    }
  }
  useEffect(() => {
    try {
      setToken(auth.token() ?? "");
    } catch {
      setToken("");
    }
  }, []);
  useEffect(() => {
    if (token) void load();
  }, [token]);
  const open = (p: Project) => {
    setActive(p);
    setView("project");
  };
  if (!token)
    return (
      <AuthGate
        success={(value) => {
          auth.set(value);
          setToken(value);
        }}
      />
    );
  let page: React.ReactNode;
  if (view === "dashboard")
    page = (
      <DashboardPage
        dashboard={dashboard}
        projects={projects}
        deployments={deployments}
        open={open}
        next={setView}
      />
    );
  else if (view === "projects")
    page = (
      <ProjectsPage
        projects={projects}
        open={open}
        newProject={() => setView("new")}
      />
    );
  else if (view === "project" && active)
    page = (
      <ProjectPage
        project={active}
        deployments={deployments}
        metrics={metrics}
        openResult={(d) => {
          setSelectedDeployment(d);
          setView("deployment-result");
        }}
        deploy={async () => {
          const d = await api.deploy(active.id, "");
          setDeployments((x) => [d, ...x]);
          setSelectedDeployment(d);
          setView("deployment-result");
          setNotice(
            "Deployment передан Agent. Открыта страница результата с live-статусом.",
          );
        }}
      />
    );
  else if (view === "deployment-result" && active && selectedDeployment)
    page = (
      <DeploymentResultPage
        project={active}
        initial={selectedDeployment}
        back={() => setView("project")}
        openDeployments={() => setView("deployments")}
        retry={async () => {
          const next = await api.deploy(active.id, "");
          setDeployments((items) => [next, ...items]);
          setSelectedDeployment(next);
        }}
      />
    );
  else if (view === "deployments")
    page = (
      <Deployments
        deployments={deployments}
        openResult={(d) => {
          const p = projects.find((x) => x.slug === d.projectSlug);
          if (p) {
            setActive(p);
            setSelectedDeployment(d);
            setView("deployment-result");
          }
        }}
      />
    );
  else if (view === "monitoring") page = <MonitoringPage metrics={metrics} />;
  else if (view === "git")
    page = (
      <GitPage connections={connections} newProject={() => setView("new")} />
    );
  else if (view === "servers")
    page = (
      <ServersPage
        servers={servers}
        add={async (x) => {
          const s = await api.createServer(x);
          setServers((a) => [s, ...a]);
          setNotice(
            `Сервер ${s.name} добавлен. Сгенерируйте enrollment token для Agent.`,
          );
        }}
        enroll={async (id) => {
          const e = await api.enrollment(id);
          window.prompt(
            "Скопируйте одноразовый enrollment token. Он больше не будет показан:",
            e.token,
          );
        }}
      />
    );
  else if (view === "logs") page = <LogsPage deployments={deployments} />;
  else if (view === "new")
    page = (
      <NewProject
        servers={servers}
        cancel={() => setView("projects")}
        create={async (x) => {
          const p = await api.createProject(x);
          const d = await api.deploy(p.id, "");
          setProjects((a) => [p, ...a]);
          setDeployments((a) => [d, ...a]);
          setActive(p);
          setSelectedDeployment(d);
          setView("deployment-result");
          setNotice(
            `Проект ${p.name} создан; Agent начал анализ и deployment.`,
          );
        }}
      />
    );
  else
    page = (
      <Placeholder title={nav.find((x) => x[0] === view)?.[2] ?? "Настройки"} />
    );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <b>✣</b>AutoDeploy
        </div>
        <nav>
          {nav.map(([id, icon, title]) => (
            <button
              className={view === id ? "nav active" : "nav"}
              onClick={() => setView(id)}
              key={id}
            >
              <i>{icon}</i>
              {title}
            </button>
          ))}
        </nav>
        <div className="server-mini">
          <small>Локальный control plane</small>
          <b>
            Worker <em>●</em>
          </b>
          <Meter label="CPU" value={32} />
          <Meter label="RAM" value={48} />
          <Meter label="Диск" value={62} />
          <p>AutoDeploy v1.2.0</p>
        </div>
      </aside>
      <div className="shell">
        <header>
          <label className="search">
            ⌕ <input placeholder="Поиск…" />
          </label>
          <div className="top-actions">
            <i>A</i>
            <button
              className="ghost"
              onClick={() => {
                auth.clear();
                setToken("");
              }}
            >
              Выйти
            </button>
          </div>
        </header>
        <main>
          <div
            className={
              notice.includes("failed") || notice.includes("недоступ")
                ? "notice notice-error"
                : "notice"
            }
          >
            ●　{notice}
          </div>
          {page}
        </main>
      </div>
    </div>
  );
}

function AuthGate({ success }: { success: (token: string) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [register, setRegister] = useState(true),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = register
        ? await api.register(email, password)
        : await api.login(email, password);
      success(r.accessToken);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Ошибка авторизации");
    }
  }
  return (
    <div className="auth">
      <form onSubmit={submit}>
        <div className="brand">
          <b>✣</b>AutoDeploy
        </div>
        <h1>{register ? "Создать аккаунт" : "Войти"}</h1>
        <p>Локальный control plane</p>
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="error">{error}</p>
        <button className="primary">
          {register ? "Зарегистрироваться" : "Войти"}
        </button>
        <button type="button" onClick={() => setRegister(!register)}>
          {register ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
        </button>
      </form>
    </div>
  );
}
function DashboardPage({
  dashboard,
  projects,
  deployments,
  open,
  next,
}: {
  dashboard: Dashboard | null;
  projects: Project[];
  deployments: Deployment[];
  open: (p: Project) => void;
  next: (v: View) => void;
}) {
  const cards = [
    ["▣", "Проекты", dashboard?.projects ?? 0, "↑ 2 за неделю"],
    [
      "◉",
      "Активные Deployments",
      dashboard?.activeDeployments ?? 0,
      "В очереди 0",
    ],
    ["▤", "Серверы", dashboard?.servers ?? 0, "Все доступны"],
    ["◌", "Ошибки", dashboard?.errors ?? 0, "↓ за неделю"],
  ];
  return (
    <>
      <Title
        title="AutoDeploy"
        text="Обзор инфраструктуры и деплоев"
        button="＋ Новый проект"
        action={() => next("new")}
      />
      <section className="stat-grid">
        {cards.map((x) => (
          <article className="stat" key={x[1]}>
            <i>{x[0]}</i>
            <small>{x[1]}</small>
            <b>{x[2]}</b>
            <p>{x[3]}</p>
          </article>
        ))}
      </section>
      <section className="two-col">
        <article className="panel">
          <Head
            title="Проекты"
            action="Смотреть все"
            click={() => next("projects")}
          />
          {projects.length ? (
            projects.map((p) => (
              <button
                className="project-row"
                onClick={() => open(p)}
                key={p.id}
              >
                <strong>{p.name[0]}</strong>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.repositoryUrl.replace("https://github.com/", "")}
                  </small>
                </span>
                <span>⌘ {p.branch}</span>
                <em>
                  ● {p.domain ? "Auto Deploy включен" : "Готов к настройке"}
                </em>
                ⋮
              </button>
            ))
          ) : (
            <Empty text="Создайте первый проект из GitHub." />
          )}
        </article>
        <article className="panel">
          <Head title="Сервер" />
          <ServerCard server={dashboard?.server} />
          <Meter label="CPU" value={dashboard?.server.cpu ?? 0} />
          <Meter label="RAM" value={dashboard?.server.ram ?? 0} />
          <Meter label="Диск" value={dashboard?.server.disk ?? 0} />
        </article>
      </section>
      <article className="panel table-panel">
        <Head
          title="Последние Deployments"
          action="Смотреть все"
          click={() => next("deployments")}
        />
        <DeploymentTable items={deployments} />
      </article>
    </>
  );
}
function ProjectsPage({
  projects,
  open,
  newProject,
}: {
  projects: Project[];
  open: (p: Project) => void;
  newProject: () => void;
}) {
  return (
    <>
      <Title
        title="Проекты"
        text="Репозитории и production-конфигурации"
        button="＋ Новый проект"
        action={newProject}
      />
      <article className="panel table-panel">
        <div className="table">
          <div className="tr th">
            <span>Проект</span>
            <span>Репозиторий</span>
            <span>Domain</span>
            <span>Статус</span>
          </div>
          {projects.map((p) => (
            <button className="tr link-row" onClick={() => open(p)} key={p.id}>
              <span>
                <b>{p.name}</b>
                <small>{runtime[p.runtime]}</small>
              </span>
              <span>{p.repositoryUrl.replace("https://github.com/", "")}</span>
              <span>{p.domain || "—"}</span>
              <em>● Healthy</em>
            </button>
          ))}
        </div>
        {!projects.length && <Empty text="Проектов пока нет." />}
      </article>
    </>
  );
}
function ProjectPage({
  project,
  deployments,
  metrics,
  deploy,
  openResult,
}: {
  project: Project;
  deployments: Deployment[];
  metrics: Monitoring | null;
  deploy: () => Promise<void>;
  openResult: (d: Deployment) => void;
}) {
  const [tab, setTab] = useState("Overview");
  let ds = deployments.filter((x) => x.projectSlug === project.slug);
  return (
    <>
      <p className="crumb">← Проекты　›　{project.name}</p>
      <div className="project-head">
        <strong>{project.name[0]}</strong>
        <div>
          <h1>
            {project.name} <em className="tag">Healthy</em>
          </h1>
          <p>
            ◉ {project.repositoryUrl}　⌘ {project.branch}　⌁ {project.slug}
          </p>
        </div>
        <div>
          <button className="primary" onClick={() => void deploy()}>
            ▷ Deploy
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          "Overview",
          "Deployments",
          "Monitoring",
          "Logs",
          "Environment",
          "Domains",
          "Settings",
        ].map((x) => (
          <button
            className={tab === x ? "selected" : ""}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "Environment" ? (
        <EnvironmentTab project={project} />
      ) : tab === "Deployments" ? (
        <DeploymentLive project={project} initial={ds} deploy={deploy} />
      ) : tab === "Logs" ? (
        <LogsTab items={ds} />
      ) : tab === "Settings" ? (
        <SettingsTab project={project} />
      ) : tab === "Domains" ? (
        <DomainsTab project={project} />
      ) : (
        <>
          <section className="metric-grid">
            <Metric
              label="CPU"
              value={`${metrics?.cpu ?? 23}%`}
              note="avg 23%"
            />
            <Metric
              label="RAM"
              value={metrics?.ram ?? "1.4 / 4 GB"}
              note="73% / 16 GB"
            />
            <Metric
              label="Requests/min"
              value={`${metrics?.requestsPerMinute ?? 128}`}
              note="avg 287"
            />
            <Metric
              label="Response time"
              value={`${metrics?.responseTimeMs ?? 120} ms`}
              note="P95 210 ms"
            />
            <Metric
              label="Availability"
              value={`${metrics?.availability ?? 99.98}%`}
              note="30d"
            />
          </section>
          <section className="chart-grid">
            <Chart title="CPU (%)" data={metrics?.cpuSeries ?? []} />
            <Chart title="RAM (GB)" data={metrics?.ramSeries ?? []} />
            <Chart title="Requests/min" data={metrics?.requestSeries ?? []} />
          </section>
          <AnalyzerTab project={project} />
          <article className="panel table-panel">
            <Head title="История сборок и деплоев" />
          <DeploymentResultTable items={ds} openResult={openResult} />
          </article>
        </>
      )}
    </>
  );
}
function EnvironmentTab({ project }: { project: Project }) {
  const [items, setItems] = useState<EnvironmentVariable[]>([]),
    [key, setKey] = useState(""),
    [value, setValue] = useState(""),
    [secret, setSecret] = useState(true),
    [error, setError] = useState("");
  const load = () =>
    api
      .variables(project.id)
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [project.id]);
  return (
    <article className="panel">
      <Head title="Environment variables" />
      <p>Значения secret никогда не возвращаются из API.</p>
      <div className="input-two">
        <label>
          Ключ
          <input
            value={key}
            placeholder="DATABASE_URL"
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Значение
          <input
            value={value}
            type={secret ? "password" : "text"}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={secret}
          onChange={(e) => setSecret(e.target.checked)}
        />
        Secret
      </label>
      <button
        className="primary"
        onClick={() =>
          void api
            .saveVariable(project.id, key, value, secret)
            .then(() => {
              setKey("");
              setValue("");
              load();
            })
            .catch((e) => setError(e.message))
        }
      >
        Сохранить
      </button>
      <p className="error">{error}</p>
      {items.map((v) => (
        <div className="connection" key={v.id}>
          <span>
            <strong>{v.key}</strong>
            <small>{v.secret ? "••••••••" : v.value}</small>
          </span>
          <em>{v.secret ? "secret" : "plain"}</em>
          <button
            onClick={() =>
              void api.deleteVariable(project.id, v.key).then(load)
            }
          >
            Удалить
          </button>
        </div>
      ))}
    </article>
  );
}
function AnalyzerTab({ project }: { project: Project }) {
  const [result, setResult] = useState<AnalyzerResult | null>(null),
    [services, setServices] = useState<ProjectService[]>([]),
    [plan, setPlan] = useState<DeploymentPlan | null>(null),
    [error, setError] = useState(""),
    [advice, setAdvice] = useState("");
  const load = () => {
    void api
      .analysis(project.id)
      .then(setResult)
      .catch(() => setResult(null));
    void api
      .services(project.id)
      .then(setServices)
      .catch(() => setServices([]));
  };
  useEffect(() => {
    load();
  }, [project.id]);
  return (
    <article className="panel">
      <Head title="Анализ и план deployment" />
      <p>
        {result
          ? `${result.status}: ${result.summary ?? result.errorMessage}`
          : "Первый deployment выполнит статический анализ Agent и вернёт список сервисов."}
      </p>
      {result && <small>{result.evidence}</small>}
      <button
        className="primary"
        onClick={() =>
          void api
            .analyze(project.id)
            .then(() => setTimeout(load, 1500))
            .catch((e) => setError(e.message))
        }
      >
        Запустить анализ
      </button>{" "}
      <button
        onClick={() =>
          void api
            .deploymentPlan(project.id)
            .then(setPlan)
            .catch((e) => setError(e.message))
        }
      >
        Построить безопасный план
      </button>{" "}
      <button
        onClick={() =>
          void api
            .advisor(project.id)
            .then((x) => setAdvice(x.recommendation))
            .catch((e) => setError(e.message))
        }
      >
        AI рекомендации
      </button>
      {services.length > 0 && (
        <div className="service-list">
          {services.map((s) => (
            <div className="connection" key={s.id}>
              <span>
                <strong>
                  {s.key} {s.selected ? "· выбрано" : ""}
                </strong>
                <small>
                  {s.path} · {runtime[s.runtime]} · {s.internalPort} ·{" "}
                  {s.dockerfileSource}
                </small>
              </span>
              <em>{s.visibility}</em>
              {s.visibility === "PUBLIC" && !s.selected && (
                <button
                  onClick={() =>
                    void api
                      .selectService(project.id, s.id)
                      .then(load)
                      .catch((e) => setError(e.message))
                  }
                >
                  Выбрать
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {plan && (
        <p>
          <b>{plan.source}</b>: {plan.summary}
          {plan.selectedServiceKey
            ? ` Рекомендуемый сервис: ${plan.selectedServiceKey}.`
            : " Публичный сервис не выбран."}
        </p>
      )}
      {advice && <p>{advice}</p>}
      <p className="error">{error}</p>
    </article>
  );
}
function DeploymentLive({
  project,
  initial,
  deploy,
}: {
  project: Project;
  initial: Deployment[];
  deploy: () => Promise<void>;
}) {
  const [items, setItems] = useState(initial),
    [logs, setLogs] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void api
      .projectDeployments(project.id)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [project.id]);
  async function follow(id: number) {
    const stop = new AbortController();
    try {
      await streamDeployment(
        id,
        (kind, value) => {
          if (kind === "log")
            setLogs((x) => [...x, (value as { message: string }).message]);
          else
            setItems((x) =>
              x.map((d) => (d.id === id ? (value as Deployment) : d)),
            );
        },
        stop.signal,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "SSE disconnected");
    }
  }
  async function rollback(id: number) {
    try {
      const d = await api.rollback(project.id, id);
      setItems((x) => [d, ...x]);
      void follow(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rollback failed");
    }
  }
  return (
    <>
      <article className="panel">
        <Head title="Deployments" />
        <button
          className="primary"
          onClick={() =>
            void deploy().then(() =>
              api.projectDeployments(project.id).then((x) => {
                setItems(x);
                if (x[0]) void follow(x[0].id);
              }),
            )
          }
        >
          Запустить deployment
        </button>
        {items.some((d) => d.status === "SUCCESS" || d.status === "FAILED") && (
          <button
            onClick={() =>
              void rollback(
                items.find(
                  (d) => d.status === "SUCCESS" || d.status === "FAILED",
                )!.id,
              )
            }
          >
            Rollback к предыдущему успешному
          </button>
        )}
        <DeploymentTable items={items} />
        <p className="error">{error}</p>
      </article>
      <article className="panel log-view">
        {logs.length ? (
          logs.map((x, i) => <p key={i}>{x}</p>)
        ) : (
          <small>
            Выберите запущенный deployment — live-логи появятся здесь.
          </small>
        )}
      </article>
    </>
  );
}
function DeploymentResultPage({
  project,
  initial,
  back,
  openDeployments,
  retry,
}: {
  project: Project;
  initial: Deployment;
  back: () => void;
  openDeployments: () => void;
  retry: () => Promise<void>;
}) {
  const [currentProject, setCurrentProject] = useState(project),
    [deployment, setDeployment] = useState(initial),
    [services, setServices] = useState<ProjectService[]>([]),
    [logs, setLogs] = useState<string[]>([]),
    [error, setError] = useState("");
  const terminal = ["SUCCESS", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(
    deployment.status,
  );
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [p, items, serviceItems, logItems] = await Promise.all([
          api.project(project.id),
          api.projectDeployments(project.id),
          api.services(project.id),
          api.logs(deployment.id),
        ]);
        if (cancelled) return;
        setCurrentProject(p);
        setDeployment(items.find((x) => x.id === deployment.id) ?? initial);
        setServices(serviceItems);
        setLogs(logItems.map((x) => x.message));
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось обновить результат deployment",
          );
      }
    };
    void refresh();
    if (terminal)
      return () => {
        cancelled = true;
      };
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [project.id, deployment.id, terminal, initial]);
  const publicUrl =
    typeof window !== "undefined" && currentProject.publicPort
      ? `${window.location.protocol}//${window.location.hostname}:${currentProject.publicPort}${currentProject.healthPath || "/"}`
      : null;
  const statusText =
    deployment.status === "SUCCESS"
      ? "Приложение прошло health-check и доступно"
      : deployment.status === "FAILED"
        ? "Agent остановил deployment: смотрите причину и логи ниже"
        : terminal
          ? `Deployment завершён: ${deployment.status}`
          : "Agent выполняет работу — страница обновляется автоматически";
  const checkoutDone = logs.some((line) => line.includes("Checking out") || line.includes("Static plan"));
  const analysisDone = logs.some((line) => line.includes("Static plan selected"));
  const buildStarted = logs.some((line) => line.includes("Building immutable Docker image"));
  const healthStarted = logs.some((line) => line.includes("Health check"));
  const phase = (done: boolean, active: boolean) => done ? "done" : active ? "active" : "";
  return (
    <>
      <p className="crumb">
        ← Проекты　›　{project.name}　›　Результат deployment
      </p>
      <div className="page-title">
        <div>
          <h1>Результат deployment</h1>
          <p>{statusText}</p>
        </div>
        <em className={`result-status ${deployment.status.toLowerCase()}`}>
          ● {deployment.status}
        </em>
      </div>
      <section className="result-grid">
        <article className="panel result-summary">
          <Head title="Публичный доступ" />
          {publicUrl && deployment.status === "SUCCESS" ? (
            <>
              <a
                className="deployment-link"
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {publicUrl}
              </a>
              <p>
                Внешний порт <b>{currentProject.publicPort}</b> выбран Agent
                после проверки занятости. Внутри контейнера:{" "}
                <b>{currentProject.applicationPort}</b>.
              </p>
              <a
                className="primary link-button"
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть приложение ↗
              </a>
            </>
          ) : (
            <>
              <p>
                Ссылка появится только после успешной сборки, старта контейнера
                и health-check.
              </p>
              <p>
                <b>Предварительный диапазон внешних портов:</b> 18100–18999.
              </p>
            </>
          )}
          <small>
            Системные Nginx, 80 и 443 не изменяются. Сейчас используется прямой
            доступ по IP и выделенному порту.
          </small>
        </article>
        <article className="panel">
          <Head title="Что сделал Agent" />
          <ol className="agent-steps">
            <li className={phase(checkoutDone, deployment.status === "CHECKOUT")}>
              Принял репозиторий и ветку <b>{project.branch}</b>
            </li>
            <li className={phase(analysisDone, checkoutDone && !analysisDone)}>
              Проверил структуру без запуска кода на этапе анализа
            </li>
            <li className={phase(buildStarted, analysisDone && !buildStarted)}>
              Собирает безопасный Docker-образ и запускает изолированный
              контейнер
            </li>
            <li className={phase(deployment.status === "SUCCESS", healthStarted && deployment.status !== "SUCCESS")}>
              Проверяет health endpoint{" "}
              <code>{currentProject.healthPath || "/"}</code>
            </li>
          </ol>
        </article>
      </section>
      <section className="two-col result-details">
        <article className="panel">
          <Head title="Обнаруженные сервисы и Dockerfile" />
          {services.length ? (
            services.map((s) => (
              <div className="connection" key={s.id}>
                <span>
                  <strong>
                    {s.key}
                    {s.selected ? " · развёрнут" : ""}
                  </strong>
                  <small>
                    {s.path} · {runtime[s.runtime]} · внутренний порт{" "}
                    {s.internalPort}
                  </small>
                </span>
                <em>
                  {s.dockerfileSource === "GENERATED"
                    ? "Dockerfile Agent"
                    : "Dockerfile репозитория"}
                </em>
              </div>
            ))
          ) : (
            <Empty text="Результат анализа появится, когда Agent завершит checkout." />
          )}
          <small>
            Если безопасного Dockerfile нет или он нарушает policy, Agent
            генерирует проверенный Dockerfile только во временной рабочей папке.
            Репозиторий не изменяется и ничего в GitHub не пушится.
          </small>
        </article>
        <article className="panel">
          <Head title="Изоляция" />
          <p>
            Контейнер получает отдельную Docker-сеть и уникальное имя. Agent не
            меняет существующие контейнеры, system Nginx, порты 80/443 и чужие
            volumes.
          </p>
          <p>
            Для запущенного сервиса применяются ограничения CPU/RAM/PID,
            read-only root filesystem и <code>no-new-privileges</code>.
          </p>
          <button onClick={back}>Вернуться к проекту</button>{" "}
          <button onClick={openDeployments}>Все deployments</button>
          {deployment.status === "FAILED" && <button className="primary" onClick={() => void retry().catch((e) => setError(e instanceof Error ? e.message : "Retry failed"))}>Retry deployment</button>}
        </article>
      </section>
      <article className="panel log-view">
        <Head title="Live-логи Agent" />
        {logs.length ? (
          logs.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)
        ) : (
          <small>Логи появятся после того, как Agent примет задание.</small>
        )}
        {deployment.failureReason && (
          <p className="error">Причина: {deployment.failureReason}</p>
        )}
        {error && <p className="error">{error}</p>}
      </article>
    </>
  );
}
function LogsTab({ items }: { items: Deployment[] }) {
  const [logs, setLogs] = useState<string[]>([]);
  return (
    <article className="panel log-view">
      {items[0] ? (
        <button
          onClick={() =>
            void api
              .logs(items[0].id)
              .then((x) => setLogs(x.map((l) => l.message)))
          }
        >
          Загрузить логи последнего deployment
        </button>
      ) : null}
      {logs.map((x, i) => (
        <p key={i}>{x}</p>
      ))}
    </article>
  );
}
function DomainsTab({ project }: { project: Project }) {
  return (
    <article className="panel">
      <Head title="Domain" />
      <p>
        {project.domain ??
          "Домен ещё не назначен. До появления DNS используйте только локальный gateway."}
      </p>
      <small>
        HTTPS не включается автоматически: выпуск сертификата требует домен и
        отдельное подтверждение.
      </small>
    </article>
  );
}
function SettingsTab({ project }: { project: Project }) {
  const [domain, setDomain] = useState(project.domain ?? ""),
    [autoDeploy, setAutoDeploy] = useState(project.autoDeploy),
    [saved, setSaved] = useState("");
  return (
    <article className="panel">
      <Head title="Project settings" />
      <label>
        Domain
        <input
          value={domain}
          placeholder="app.example.com"
          onChange={(e) => setDomain(e.target.value)}
        />
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={autoDeploy}
          onChange={(e) => setAutoDeploy(e.target.checked)}
        />
        Auto deploy после push
      </label>
      <button
        className="primary"
        onClick={() =>
          void api
            .updateProject(project.id, { ...project, domain, autoDeploy })
            .then(() =>
              setSaved(
                "Настройки сохранены. Обновите страницу для карточки проекта.",
              ),
            )
        }
      >
        Сохранить
      </button>
      <p>{saved}</p>
    </article>
  );
}
function Deployments({
  deployments,
  openResult,
}: {
  deployments: Deployment[];
  openResult: (d: Deployment) => void;
}) {
  return (
    <>
      <Title title="Deployments" text="История безопасных поставок" />
      <article className="panel table-panel">
        <DeploymentResultTable items={deployments} openResult={openResult} />
      </article>
    </>
  );
}
function MonitoringPage({ metrics }: { metrics: Monitoring | null }) {
  return (
    <>
      <Title
        title="Мониторинг"
        text="Demo-метрики API до подключения Prometheus"
      />
      <section className="metric-grid">
        <Metric
          label="Статус"
          value={metrics?.status ?? "HEALTHY"}
          note="health check passed"
        />
        <Metric
          label="Uptime"
          value={metrics?.uptime ?? "4d 12h"}
          note="current version"
        />
        <Metric
          label="CPU"
          value={`${metrics?.cpu ?? 23}%`}
          note="average 17%"
        />
        <Metric
          label="Availability"
          value={`${metrics?.availability ?? 99.98}%`}
          note="7d"
        />
      </section>
      <section className="chart-grid wide">
        <Chart title="CPU и нагрузка" data={metrics?.cpuSeries ?? []} />
        <Chart title="Requests/min" data={metrics?.requestSeries ?? []} />
      </section>
    </>
  );
}
function GitPage({
  connections,
  newProject,
}: {
  connections: GitConnection[];
  newProject: () => void;
}) {
  const [items, setItems] = useState<
      { id: number; provider: string; account: string; status: string }[]
    >([]),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    api
      .githubConnections()
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <p className="crumb">Git Sources　›　Новый проект</p>
      <Title
        title="Подключите GitHub"
        text="Token проверяется через GitHub API и сохраняется только в зашифрованном виде."
      />
      <section className="providers">
        <Provider icon="◉" name="GitHub" active />
        <Provider icon="◆" name="GitLab" />
        <Provider icon="◇" name="Self-Hosted GitLab" />
      </section>
      <section className="two-col">
        <article className="panel">
          <Head title="Подключенные источники" />
          {items.length ? (
            items.map((c) => (
              <div className="connection" key={c.id}>
                <b>◉</b>
                <span>
                  <strong>GitHub</strong>
                  <small>{c.account}</small>
                </span>
                <em>{c.status}</em>
                <button
                  onClick={() => void api.disconnectGitHub(c.id).then(load)}
                >
                  Отключить
                </button>
              </div>
            ))
          ) : (
            <Empty text="GitHub пока не подключён." />
          )}
        </article>
        <article className="panel">
          <Head title="Подключить GitHub" />
          <label>
            Fine-grained personal access token
            <input
              value={token}
              type="password"
              autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <small>
            Нужны только права чтения Contents/Metadata на выбранные
            репозитории. Token не выводится в UI и логах.
          </small>
          <button
            className="primary"
            disabled={!token}
            onClick={() =>
              void api
                .connectGitHub(token)
                .then(() => {
                  setToken("");
                  load();
                })
                .catch((e) => setError(e.message))
            }
          >
            Проверить и подключить
          </button>
          <p className="error">{error}</p>
          <button onClick={newProject}>Создать проект из GitHub</button>
        </article>
      </section>
    </>
  );
}
function ServersPage({
  servers,
  add,
  enroll,
}: {
  servers: Server[];
  add: (
    x: Pick<Server, "name" | "host" | "environment" | "labels">,
  ) => Promise<void>;
  enroll: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [host, setHost] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Title
        title="Серверы"
        text="Добавьте сервер, затем установите Agent с одноразовым enrollment token."
      />
      <form
        className="panel input-two"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await add({ name, host, environment: "production", labels: "{}" });
            setName("");
            setHost("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Название
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Host / IP
          <input
            required
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="10.0.0.10"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Добавляем…" : "Добавить сервер"}
        </button>
      </form>
      {servers.length === 0 ? (
        <p className="muted">Серверов пока нет.</p>
      ) : (
        servers.map((s) => (
          <article className="panel" key={s.id}>
            <Head title={`${s.name} · ${s.status}`} />
            <p>
              {s.host} · {s.environment} ·{" "}
              {s.lastSeen
                ? `last seen ${new Date(s.lastSeen).toLocaleString()}`
                : "Agent ещё не подключён"}
            </p>
            <button onClick={() => enroll(s.id)}>
              Создать enrollment token
            </button>
          </article>
        ))
      )}
    </>
  );
}
function LogsPage({ deployments }: { deployments: Deployment[] }) {
  return (
    <>
      <Title title="Логи" text="События deployment и приложения" />
      <article className="panel log-view">
        <small>Выберите deployment, чтобы увидеть поток логов</small>
        {deployments.slice(0, 5).map((d) => (
          <p key={d.id}>
            <b>{d.projectSlug}</b>　{d.commitSha}　<em>{d.status}</em>
          </p>
        ))}
      </article>
    </>
  );
}
function NewProject({
  cancel,
  create,
  servers,
}: {
  cancel: () => void;
  create: (x: Omit<Project, "id" | "createdAt">) => Promise<void>;
  servers: Server[];
}) {
  const [f, setF] = useState(
      blank as typeof blank & { targetServerId?: number },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.targetServerId) {
      setError("Выберите подключённый сервер для deployment.");
      return;
    }
    setBusy(true);
    try {
      await create({ ...f, slug: f.slug || slugify(f.name) });
    } catch (x) {
      setError(x instanceof Error ? x.message : "Ошибка создания");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="crumb">Git Sources　›　Новый проект</p>
      <Title
        title="Новый проект"
        text="GitHub → безопасный Agent-анализ → изолированный deployment"
      />
      <form className="new-project" onSubmit={submit}>
        <article className="panel">
          <Head title="Repository" />
          <label>
            Название проекта
            <input
              required
              value={f.name}
              onChange={(e) =>
                setF({
                  ...f,
                  name: e.target.value,
                  slug: f.slug || slugify(e.target.value),
                })
              }
            />
          </label>
          <label>
            GitHub repository URL
            <input
              required
              value={f.repositoryUrl}
              onChange={(e) => setF({ ...f, repositoryUrl: e.target.value })}
              placeholder="https://github.com/org/repo.git или git@github.com:org/repo.git"
            />
          </label>
          <label>
            Branch
            <input
              required
              value={f.branch}
              onChange={(e) => setF({ ...f, branch: e.target.value })}
            />
          </label>
          <p className="muted">
            Agent читает только структуру Dockerfile, определяет внутренний порт
            из <code>EXPOSE</code> и не исполняет скрипты репозитория на этапе
            анализа.
          </p>
        </article>
        <article className="panel">
          <Head title="Production settings" />
          <label>
            Целевой сервер
            <select
              required
              value={f.targetServerId ?? ""}
              onChange={(e) =>
                setF({ ...f, targetServerId: Number(e.target.value) })
              }
            >
              <option value="">Выберите server</option>
              {servers
                .filter((s) => s.status === "ONLINE")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.host}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Slug
            <input
              required
              value={f.slug}
              onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })}
            />
          </label>
          <label>
            Domain <small>(опционально)</small>
            <input
              value={f.domain}
              onChange={(e) => setF({ ...f, domain: e.target.value })}
              placeholder="app.example.com"
            />
          </label>
          <p className="muted">
            Внешний порт выберет Agent из диапазона 18100–18999. Nginx, 80 и 443
            не изменяются.
          </p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={f.autoDeploy}
              onChange={(e) => setF({ ...f, autoDeploy: e.target.checked })}
            />
            Auto Deploy <small>Запускать после push в main</small>
          </label>
          <p className="error">{error}</p>
          <div className="form-actions">
            <button type="button" onClick={cancel}>
              Отмена
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Передаём Agent…" : "Analyze & Deploy"} →
            </button>
          </div>
        </article>
      </form>
    </>
  );
}
function Title({
  title,
  text,
  button,
  action,
}: {
  title: string;
  text: string;
  button?: string;
  action?: () => void;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {button && (
        <button className="primary" onClick={action}>
          {button}
        </button>
      )}
    </div>
  );
}
function Head({
  title,
  action,
  click,
}: {
  title: string;
  action?: string;
  click?: () => void;
}) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {action && <button onClick={click}>{action}　›</button>}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <small>{label}</small>
      <b>{value}</b>
      <p>{note}</p>
    </article>
  );
}
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span>
        {label}
        <b>{value}%</b>
      </span>
      <i>
        <em style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
function ServerCard({ server }: { server?: Server }) {
  return (
    <div className="server-card">
      <b>▤</b>
      <span>
        <strong>{server?.name ?? "prod-server-01"}</strong>
        <small>
          <em>● Online</em>　{server?.containers ?? 6} containers
        </small>
      </span>
      <button>Подробнее　›</button>
    </div>
  );
}
function DeploymentTable({ items }: { items: Deployment[] }) {
  return items.length ? (
    <div className="table">
      <div className="tr th">
        <span>Проект</span>
        <span>Статус</span>
        <span>Commit</span>
        <span>Время</span>
      </div>
      {items.map((d) => (
        <div className="tr" key={d.id}>
          <b>{d.projectSlug}</b>
          <em>● {d.status}</em>
          <code>{d.commitSha.slice(0, 12)}</code>
          <time>{new Date(d.createdAt).toLocaleString("ru-RU")}</time>
        </div>
      ))}
    </div>
  ) : (
    <Empty text="Deployments появятся после запуска проекта." />
  );
}
function DeploymentResultTable({
  items,
  openResult,
}: {
  items: Deployment[];
  openResult: (deployment: Deployment) => void;
}) {
  return items.length ? (
    <div className="table">
      <div className="tr th has-action">
        <span>Проект</span><span>Статус</span><span>Commit</span><span>Время</span><span />
      </div>
      {items.map((deployment) => (
        <div className="tr has-action" key={deployment.id}>
          <b>{deployment.projectSlug}</b><em>● {deployment.status}</em><code>{deployment.commitSha.slice(0, 12)}</code><time>{new Date(deployment.createdAt).toLocaleString("ru-RU")}</time>
          <button onClick={() => openResult(deployment)}>Результат</button>
        </div>
      ))}
    </div>
  ) : <Empty text="Deployments появятся после запуска проекта." />;
}
function Chart({ title, data }: { title: string; data: number[] }) {
  let max = Math.max(...data, 1),
    p = data
      .map((n, i) => `${(i / (data.length - 1)) * 100},${90 - (n / max) * 68}`)
      .join(" ");
  return (
    <article className="panel chart">
      <Head title={title} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 90H100M0 55H100M0 20H100" />
        <polyline points={p} />
      </svg>
      <small>12:00　　　　　　　　15:00　　　　　　　　18:00</small>
    </article>
  );
}
function Provider({
  icon,
  name,
  active = false,
}: {
  icon: string;
  name: string;
  active?: boolean;
}) {
  return (
    <button className={active ? "provider chosen" : "provider"}>
      <b>{icon}</b>
      {name}
      {!active && <small>Скоро</small>}
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <b>Пока пусто</b>
      <p>{text}</p>
    </div>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <>
      <Title title={title} text="Раздел подготовлен для локального MVP." />
      <article className="panel">
        <Empty text="Здесь появятся данные после подключения соответствующего API." />
      </article>
    </>
  );
}
