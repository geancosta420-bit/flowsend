import type { Campaign, Contact } from "@/types";
export const initialContacts: Contact[] = [
 {id:"c1",name:"Mariana Costa",phone:"+55 11 99876-5432",company:"Clínica Aurora",email:"mariana@aurora.com.br",city:"São Paulo",segment:"Saúde",status:"Interessado",tags:["Quente","Clínicas"],optedOut:false,lastContact:"Hoje, 10:42"},
 {id:"c2",name:"Rafael Mendes",phone:"+55 21 98765-4321",company:"Mendes Gastronomia",email:"rafael@mendes.com.br",city:"Rio de Janeiro",segment:"Alimentação",status:"Respondeu",tags:["Restaurantes"],optedOut:false,lastContact:"Hoje, 09:18"},
 {id:"c3",name:"Juliana Almeida",phone:"+55 31 99123-4567",company:"Hotel Vale Verde",email:"juliana@valeverde.com.br",city:"Belo Horizonte",segment:"Hotelaria",status:"Proposta",tags:["Hotéis","Proposta enviada"],optedOut:false,lastContact:"Ontem, 16:30"},
 {id:"c4",name:"Pedro Oliveira",phone:"+55 41 99654-3210",company:"Mercado Central",email:"pedro@mercadocentral.com.br",city:"Curitiba",segment:"Varejo",status:"Contatado",tags:["Mercados"],optedOut:false,lastContact:"Ontem, 14:05"},
 {id:"c5",name:"Camila Ferreira",phone:"+55 51 99456-7890",company:"Studio Camila",email:"camila@studio.com.br",city:"Porto Alegre",segment:"Serviços",status:"Novo",tags:["Lead novo"],optedOut:false,lastContact:"—"},
 {id:"c6",name:"André Santos",phone:"+55 11 98234-5678",company:"TechSolutions",email:"andre@techsolutions.com.br",city:"São Paulo",segment:"Tecnologia",status:"Cliente",tags:["Cliente","VIP"],optedOut:false,lastContact:"28 set, 11:20"},
 {id:"c7",name:"Fernanda Rocha",phone:"+55 85 98765-1234",company:"Clínica Bem Estar",email:"fernanda@bemestar.com.br",city:"Fortaleza",segment:"Saúde",status:"Interessado",tags:["Quente","Clínicas"],optedOut:false,lastContact:"28 set, 10:12"},
 {id:"c8",name:"Lucas Carvalho",phone:"+55 19 99111-2233",company:"Pousada do Lago",email:"lucas@pousada.com.br",city:"Campinas",segment:"Hotelaria",status:"Sem interesse",tags:["Opt-out"],optedOut:true,lastContact:"27 set, 15:47"}
];
export const initialCampaigns: Campaign[] = [
 {id:"cp1",name:"Prospecção — Clínicas SP",objective:"Prospecção",audience:"Clínicas",sent:973,total:1248,replies:186,status:"Ativa",date:"Hoje, 09:00"},
 {id:"cp2",name:"Reativação de clientes",objective:"Reativação",audience:"Clientes antigos",sent:842,total:842,replies:214,status:"Concluída",date:"Ontem, 14:30"},
 {id:"cp3",name:"Novidades de outubro",objective:"Divulgação",audience:"Leads novos",sent:0,total:560,replies:0,status:"Agendada",date:"02 out, 10:00"}
];
export const initialInstances = [
 {id:"wa1",name:"WhatsApp Comercial",phone:"+55 11 98765-4321",provider:"evolution",status:"connected"},
 {id:"wa2",name:"WhatsApp Suporte",phone:"+55 11 91234-5678",provider:"evolution",status:"connected"}
];
export const navGroups = [{label:"VISÃO GERAL",links:[{label:"Dashboard",href:"/",icon:"dashboard"}]},{label:"VENDAS",links:[{label:"Contatos",href:"/contatos",icon:"contacts"},{label:"Listas",href:"/listas",icon:"lists"},{label:"Campanhas",href:"/campanhas",icon:"campaigns"},{label:"CRM",href:"/crm",icon:"crm"},{label:"Mensagens",href:"/mensagens",icon:"messages"}]},{label:"FERRAMENTAS",links:[{label:"Templates",href:"/templates",icon:"templates"},{label:"Agendamentos",href:"/agendamentos",icon:"calendar"},{label:"Relatórios",href:"/relatorios",icon:"reports"}]},{label:"SISTEMA",links:[{label:"Usuários",href:"/usuarios",icon:"userAdmin"},{label:"Integrações",href:"/integracoes",icon:"integrations"},{label:"Pagamentos",href:"/pagamentos",icon:"billing"},{label:"Configurações",href:"/configuracoes",icon:"settings"},{label:"Central de ajuda",href:"/ajuda",icon:"help"}]}];
