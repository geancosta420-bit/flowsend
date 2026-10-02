import type {Metadata} from "next";import {Plus_Jakarta_Sans} from "next/font/google";import "./globals.css";import "./theme.css";import {Shell} from "@/components/layout/shell";
const jakarta=Plus_Jakarta_Sans({subsets:["latin"],variable:"--font-plus-jakarta",display:"swap"});
export const metadata:Metadata={title:"FlowSend — Relacionamento que gera vendas",description:"CRM, prospecção e campanhas em um só lugar."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR" className={jakarta.variable}><body><Shell>{children}</Shell></body></html>}
