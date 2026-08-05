import type { Charge, Client } from "./types";

export const clients: Client[] = [
  { id: "1", name: "Carlos Augusto", phone: "(11) 99876-5432", email: "carlos@email.com", plan: "Mensal", dueDay: 10, status: "Ativo", lastPayment: "10/05/2025", monthlyValue: 89.9 },
  { id: "2", name: "Mariana Souza", phone: "(11) 98765-4321", email: "mariana@email.com", plan: "Mensal", dueDay: 15, status: "Vencido", lastPayment: "10/04/2025", monthlyValue: 79.9 },
  { id: "3", name: "Lucas Pereira", phone: "(11) 97654-3210", plan: "Mensal", dueDay: 20, status: "Ativo", lastPayment: "20/05/2025", monthlyValue: 99.9 },
  { id: "4", name: "Fernanda Lima", phone: "(11) 96543-2109", plan: "Mensal", dueDay: 25, status: "Ativo", lastPayment: "25/05/2025", monthlyValue: 89.9 },
  { id: "5", name: "Rafael Martins", phone: "(11) 95432-1098", plan: "Mensal", dueDay: 10, status: "Vencido", lastPayment: "10/04/2025", monthlyValue: 59.9 },
  { id: "6", name: "Juliana Oliveira", phone: "(11) 94321-0987", plan: "Mensal", dueDay: 13, status: "Ativo", lastPayment: "13/05/2025", monthlyValue: 89.9 },
  { id: "7", name: "Bruno Ferreira", phone: "(11) 93210-9876", plan: "Mensal", dueDay: 18, status: "Vencido", lastPayment: "18/04/2025", monthlyValue: 99.9 },
  { id: "8", name: "Patrícia Gomes", phone: "(11) 92109-8765", plan: "Mensal", dueDay: 22, status: "Ativo", lastPayment: "22/05/2025", monthlyValue: 79.9 }
];

export const charges: Charge[] = [
  { id: "c1", client: "Carlos Augusto", description: "Mensalidade Maio/2025", dueDate: "25/05/2025", status: "A vencer", paymentMethod: "Cartão de crédito", value: 89.9 },
  { id: "c2", client: "Mariana Souza", description: "Mensalidade Maio/2025", dueDate: "26/05/2025", status: "A vencer", paymentMethod: "PIX", value: 79.9 },
  { id: "c3", client: "Lucas Pereira", description: "Mensalidade Maio/2025", dueDate: "27/05/2025", status: "A vencer", paymentMethod: "Boleto bancário", value: 99.9 },
  { id: "c4", client: "Juliana Oliveira", description: "Mensalidade Abril/2025", dueDate: "15/05/2025", status: "Atrasado", paymentMethod: "Boleto bancário", value: 89.9 },
  { id: "c5", client: "Bruno Ferreira", description: "Mensalidade Abril/2025", dueDate: "12/05/2025", status: "Atrasado", paymentMethod: "PIX", value: 99.9 },
  { id: "c6", client: "Patrícia Gomes", description: "Implantação", dueDate: "10/05/2025", status: "Atrasado", paymentMethod: "Cartão de crédito", value: 79.9 },
  { id: "c7", client: "Thiago Rocha", description: "Mensalidade Maio/2025", dueDate: "03/05/2025", status: "Pago", paymentMethod: "PIX", confirmation: "03/05/2025 09:14", value: 59.9 },
  { id: "c8", client: "Amanda Costa", description: "Mensalidade Abril/2025", dueDate: "05/05/2025", status: "Pago", paymentMethod: "Boleto bancário", confirmation: "05/05/2025 10:22", value: 89.9 },
  { id: "c9", client: "João Silva", description: "Mensalidade Maio/2025", dueDate: "21/05/2025", status: "Aguardando webhook", paymentMethod: "Cartão de crédito", value: 89.9 }
];

export const operatorQueue = [
  { label: "Pagamento confirmado — renovar", client: "Carlos Augusto", level: "Baixa", tone: "success" },
  { label: "Novo cliente pago — ativar cadastro", client: "Ana Paula Santos", level: "Média", tone: "info" },
  { label: "Cobrança vencida — reenviar mensagem", client: "Juliana Oliveira", level: "Alta", tone: "danger" },
  { label: "Confirmação pendente — verificar webhook", client: "João Silva", level: "Informação", tone: "warning" }
];
