import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = { title: "AutoDeploy", description: "Safe deployment control plane" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}</body></html>; }
