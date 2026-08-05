export type ClientStatus = "Ativo" | "Vencido" | "Cancelado";
export type ChargeStatus = "A vencer" | "Atrasado" | "Pago" | "Aguardando webhook";
export type UserRole = "Administrador" | "Operador";

export type Client = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  plan: string;
  dueDay: number;
  status: ClientStatus;
  lastPayment: string;
  monthlyValue: number;
};

export type Charge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  status: ChargeStatus;
  paymentMethod: "PIX" | "Cartão de crédito" | "Boleto bancário";
  confirmation?: string;
  value: number;
};
