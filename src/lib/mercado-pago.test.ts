import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractPix, isOrderPaid, validateMercadoPagoWebhookSignature } from "./mercado-pago";

describe("Mercado Pago webhook", () => {
  it("valida assinatura HMAC no formato oficial", () => {
    const secret = "segredo-teste";
    const dataId = "ORD01ABCDEF";
    const requestId = "request-123";
    const ts = "1781009491";
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const hash = createHmac("sha256", secret).update(manifest).digest("hex");

    expect(validateMercadoPagoWebhookSignature({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: requestId,
      dataId,
      secret,
    })).toBe(true);
  });

  it("rejeita assinatura alterada", () => {
    expect(validateMercadoPagoWebhookSignature({
      xSignature: "ts=1,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      xRequestId: "request-123",
      dataId: "ORD01ABCDEF",
      secret: "segredo-teste",
    })).toBe(false);
  });
});

describe("Mercado Pago order", () => {
  it("considera pago somente processed/accredited", () => {
    expect(isOrderPaid({ status: "processed", status_detail: "accredited" })).toBe(true);
    expect(isOrderPaid({ status: "action_required", status_detail: "waiting_payment" })).toBe(false);
  });

  it("extrai dados do Pix da primeira transacao", () => {
    const result = extractPix({
      id: "ORD01",
      status: "action_required",
      status_detail: "waiting_transfer",
      total_amount: "30.00",
      transactions: {
        payments: [{
          id: "PAY01",
          amount: "30.00",
          payment_method: {
            id: "pix",
            type: "bank_transfer",
            ticket_url: "https://example.com/pix",
            qr_code: "000201",
            qr_code_base64: "base64",
          },
        }],
      },
    });

    expect(result.orderId).toBe("ORD01");
    expect(result.paymentId).toBe("PAY01");
    expect(result.amount).toBe(30);
    expect(result.qrCode).toBe("000201");
  });
});
