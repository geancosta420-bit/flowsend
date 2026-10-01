import type {Metadata} from "next";import "./globals.css";import "./theme.css";import {Shell} from "@/components/layout/shell";
export const metadata:Metadata={title:"FlowSend — Relacionamento que gera vendas",description:"CRM, prospecção e campanhas em um só lugar."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body><Shell>{children}</Shell></body></html>}
