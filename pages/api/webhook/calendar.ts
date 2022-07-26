import { webcrypto as crypto } from "node:crypto";
import { NextApiHandler, PageConfig } from "next";
import getRawBody from "raw-body";

const handler: NextApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(404);
  }

  const signingSecret = process.env.TICKET_TAILOR_SIGNING_SECRET;

  if (!req.headers["tickettailor-webhook-signature"]) {
    return res.status(401).json({ message: "Invalid signature." });
  }

  let signatureHeader = req.headers["tickettailor-webhook-signature"];
  try {
    if (Array.isArray(signatureHeader)) {
      signatureHeader = signatureHeader[0];
    }
    const [timestampPart, signaturePart] = signatureHeader.split(",");
    const [, timestamp] = timestampPart.split("=");
    const [, signature] = signaturePart.split("=");

    const rawBody = await getRawBody(req);

    const encoder = new TextEncoder();
    const alg = {
      name: "HMAC",
      hash: "SHA-256",
    } as const;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      alg,
      false,
      ["sign", "verify"]
    );

    try {
      await crypto.subtle.verify(
        alg,
        key,
        Buffer.from(signature),
        Buffer.from(`${timestamp}${rawBody.toString("utf-8")}`)
      );
    } catch (err) {
      console.error("Failed to verify signature.", {
        signature,
        body: `${timestamp}${rawBody.toString("utf-8")}`,
      });
    }
  } catch (err) {
    console.error("Failed to process signature header.", {
      signatureHeader,
    });
  }

  try {
    await res.revalidate("/calendar");
    return res.json({ revalidated: true });
  } catch (err) {
    return res.status(500).send("Failed to revalidate calendar.");
  }
};

export const config: PageConfig = {
  api: {
    bodyParser: false,
  },
};

export default handler;
