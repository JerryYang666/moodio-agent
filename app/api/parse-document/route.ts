import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = await verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (file.type === "text/plain") {
      text = new TextDecoder("utf-8").decode(buffer);
    } else if (file.type === "application/pdf") {
      const PDFParser = (await import("pdf2json")).default;
      const pdfParser = new PDFParser(null, true);
      text = await new Promise<string>((resolve, reject) => {
        pdfParser.on("pdfParser_dataError", (err) => reject(err));
        pdfParser.on("pdfParser_dataReady", () => {
          resolve(pdfParser.getRawTextContent());
        });
        pdfParser.parseBuffer(buffer);
      });
      pdfParser.destroy();
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Document parse error:", error);
    return NextResponse.json({ error: "PARSE_FAILED" }, { status: 500 });
  }
}
