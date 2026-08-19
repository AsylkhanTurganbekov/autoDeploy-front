export type Runtime = "NODE" | "SPRING_BOOT" | "DOCKERFILE";
export type Project = { id: number; name: string; slug: string; repositoryUrl: string; branch: string; runtime: Runtime; applicationPort: number; domain: string | null; autoDeploy: boolean; targetServerId?: number | null; createdAt: string };
export type EnvironmentVariable = { id: number; key: string; value: string | null; secret: boolean; createdAt: string };
export type Deployment = { id: number; projectSlug: string; commitSha: string; status: string; failureReason?: string | null; createdAt: string; updatedAt?: string };
export type DeploymentLog = { id: number; lineNumber: number; message: string; createdAt: string };
export type AnalyzerResult = { id: number; status: string; detectedRuntime?: Runtime | null; applicationPort?: number | null; summary?: string | null; evidence?: string | null; errorMessage?: string | null; createdAt: string; updatedAt: string };
export type Dashboard = { projects: number; activeDeployments: number; servers: number; errors: number; recentDeployments: Deployment[]; server: Server };
export type Server = { id: number; name: string; host: string; environment: string; labels: string; status: string; lastSeen: string | null; cpu?: number; ram?: number; disk?: number; containers?: number; lastHeartbeat?: string };
export type Monitoring = { status: string; uptime: string; cpu: number; ram: string; requestsPerMinute: number; responseTimeMs: number; availability: number; cpuSeries: number[]; ramSeries: number[]; requestSeries: number[] };
export type GitConnection = { id: number; name: string; provider: string; status: string; account: string; description: string };

const base = "/api/v1";
const tokenKey = "autodeploy.access-token";
export const auth = { token: () => typeof window === "undefined" ? null : window.localStorage.getItem(tokenKey), set: (value: string) => window.localStorage.setItem(tokenKey, value), clear: () => window.localStorage.removeItem(tokenKey) };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers); headers.set("Content-Type", "application/json"); const token = auth.token(); if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
    throw new Error(body?.detail ?? body?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const api = {
  register: (email: string, password: string) => request<{ accessToken: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<{ accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  health: () => request<{ status: string }>("/health"), projects: () => request<Project[]>("/projects"), project: (id:number) => request<Project>(`/projects/${id}`),
  createProject: (data: Omit<Project, "id" | "createdAt">) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id:number,data: Omit<Project,"id"|"createdAt">) => request<Project>(`/projects/${id}`, {method:"PUT",body:JSON.stringify(data)}), deleteProject:(id:number)=>request<void>(`/projects/${id}`,{method:"DELETE"}),
  variables: (projectId: number) => request<EnvironmentVariable[]>(`/projects/${projectId}/variables`),
  saveVariable: (projectId: number, key: string, value: string, secret: boolean) => request<EnvironmentVariable>(`/projects/${projectId}/variables/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value, secret }) }),
  deleteVariable:(projectId:number,key:string)=>request<void>(`/projects/${projectId}/variables/${encodeURIComponent(key)}`,{method:"DELETE"}),
  deploy: (projectId: number, commitSha: string) => request<Deployment>(`/projects/${projectId}/deployments`, { method: "POST", body: JSON.stringify({ commitSha }) }),
  projectDeployments:(id:number)=>request<Deployment[]>(`/projects/${id}/deployments`), rollback:(projectId:number,deploymentId:number)=>request<Deployment>(`/projects/${projectId}/deployments/${deploymentId}/rollback`,{method:"POST"}), advisor:(id:number)=>request<{recommendation:string}>(`/projects/${id}/advisor`,{method:"POST"}), deployments: () => request<Deployment[]>("/deployments"), logs: (deploymentId: number) => request<DeploymentLog[]>(`/deployments/${deploymentId}/logs`), analyze:(id:number)=>request<AnalyzerResult>(`/projects/${id}/analyze`,{method:"POST"}), analysis:(id:number)=>request<AnalyzerResult>(`/projects/${id}/analysis`),
  githubConnections:()=>request<{id:number;provider:string;account:string;status:string;createdAt:string}[]>("/github/connections"), connectGitHub:(token:string)=>request<{id:number;provider:string;account:string}>("/github/connections",{method:"POST",body:JSON.stringify({token})}), disconnectGitHub:(id:number)=>request<void>(`/github/connections/${id}`,{method:"DELETE"}), branches:(repository:string)=>request<string[]>(`/github/branches?repository=${encodeURIComponent(repository)}`),
  dashboard: () => request<Dashboard>("/dashboard"), monitoring: () => request<Monitoring>("/monitoring"), servers: () => request<Server[]>("/servers"), createServer: (data: Pick<Server,"name"|"host"|"environment"|"labels">) => request<Server>("/servers", { method: "POST", body: JSON.stringify(data) }), enrollment: (id:number) => request<{token:string;expiresAt:string;notice:string}>(`/servers/${id}/enrollment`, { method:"POST" }), connections: () => request<GitConnection[]>("/git-connections"),
};
export async function streamDeployment(id:number,onEvent:(kind:"log"|"status",value:unknown)=>void,signal:AbortSignal){const token=auth.token();const response=await fetch(`${base}/deployments/${id}/events`,{headers:{Authorization:`Bearer ${token}`},signal});if(!response.ok||!response.body)throw new Error(`SSE connection failed (${response.status})`);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",event="status";while(!signal.aborted){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true});const blocks=buffer.split("\n\n");buffer=blocks.pop()??"";for(const block of blocks){for(const line of block.split("\n")){if(line.startsWith("event:"))event=line.slice(6).trim();if(line.startsWith("data:")){try{onEvent(event==="log"?"log":"status",JSON.parse(line.slice(5)));}catch{}}}}}}
export function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63); }
